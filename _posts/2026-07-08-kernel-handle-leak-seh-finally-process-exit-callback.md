---
title: "커널 드라이버 핸들 누수 추적기 — 프로세스 종료 콜백에서 __finally가 실행되지 않는 이유"
excerpt: "WinDbg !htrace에 잡힌 ObHn 프로세스 핸들 누수를 추적한 기록. 프로세스 종료 콜백(ProcessNotifyCallbackRoutineEx)에서 ZwOpenProcess로 연 핸들이 SEH __finally 미실행으로 닫히지 않는 근본 원인을 커널 SEH·IRQL·객체 수명 관점에서 분석하고, WorkItem 지연 실행으로 해결한 과정."
category: tech
date: 2026-07-08
author: kim-tigerj
tags: [커널 드라이버, WinDbg, 핸들 누수, SEH, __finally, IRQL, WorkItem, Windows, Orange Platform]
---

## 문제

커널 드라이버(yfilter)를 검사하던 중, WinDbg의 핸들 추적(`!htrace`)에 프로세스 핸들(`ObHn` 태그) 참조가 계속 남아 있는 것을 발견했다. 남은 참조의 스택을 보면 두 가지 경로가 잡힌다.

```
a43a8d    +1     ObHn     1     5 nt!ObpTraceObjectReferenceIfActive+1a
                                    nt!ObReferenceObjectByPointerWithTag+53
                                    nt!ObOpenObjectByPointer+93
                                    nt!PsOpenProcess+556
                                    nt!NtOpenProcess+23
                                    nt!KiSystemServiceCopyEnd+25
                                    nt!KiServiceLinkage+0
                                    orange!CProcessTable::OpenProcessHandle+a5
                                    orange!CProcessTable::Add3+275
                                    orange!AddProcessToTable3+372
                                    orange!ProcessNotifyCallbackRoutineEx+261
                                    nt!PspCallProcessNotifyRoutines+152
                                    nt!PspInsertThread+822
                                    nt!NtCreateUserProcess+9d2

  a51520    +1     ObHn    12   101 nt!ObpTraceObjectReferenceIfActive+1a
                                    nt!ObReferenceObjectByPointerWithTag+53
                                    nt!ObOpenObjectByPointer+93
                                    nt!PsOpenProcess+556
                                    nt!NtOpenProcess+23
                                    orange!CProcessTable::OpenProcessHandle+a5
                                    orange!CProcessTable::Update+35
                                    orange!CProcessTable::Remove+c8
                                    orange!ProcessNotifyCallbackRoutineEx+302
                                    nt!PspCallProcessNotifyRoutines+152
                                    nt!PspExitProcess+a7
                                    nt!PspExitLastThread+79
                                    nt!PspExitThread+6cd
                                    nt!NtTerminateProcess+1e4
```

호출부 라인은 다음과 같다.

```
orange!ProcessNotifyCallbackRoutineEx+0x261 [yfilter/Process.cpp @ 561]
orange!AddProcessToTable3+0x372          [yfilter/Misc.cpp @ 245]
orange!CProcessTable::Add3+0x275         [yfilter/CProcessTable.h @ 806]
orange!CProcessTable::OpenProcessHandle+0xa5 [yfilter/CProcessTable.h @ 146]
========================================================
orange!ProcessNotifyCallbackRoutineEx+0x302 [yfilter/Process.cpp @ 593]
orange!CProcessTable::Remove+0xc8        [yfilter/CProcessTable.h @ 974]
orange!CProcessTable::Update+0x35        [yfilter/CProcessTable.h @ 505]
orange!CProcessTable::OpenProcessHandle+0xa5 [yfilter/CProcessTable.h @ 146]
```

두 번째 스택(`PspExitProcess` 경로)이 핵심이다. 프로세스 **종료** 콜백 안에서 `Update()`가 `ZwOpenProcess`로 핸들을 열었는데, 그 핸들이 닫히지 않은 채 남아 있다.

## 분석 — 문제의 함수

문제가 된 함수는 아래처럼 `__try/__finally`로 핸들 닫기를 "보장"하고 있었다.

```cpp
bool Update(PCSTR pCause, HANDLE PID, COUNTERS * p) {
    HANDLE h = NULL;
    bool   bRet = false;
    __try {
        if (OpenProcessHandle(PID, &h)) {
            bRet = _Update(pCause, PID, h, p);
        }
    }
    __finally {
        if (h) CloseProcessHandle(h);   // 반드시 실행될 것이라 기대
    }
    return bRet;
}
```

코드 흐름만 보면 `_Update()` 내부에서 어떤 예외가 나도 결국 바깥 `Update()`의 `__finally`에서 `h`가 닫혀야 맞다. 그런데도 WinDbg 스택에 `ObHn` 참조가 남아 있다는 것은, 단순한 예외가 아니라 **제어가 바깥 `__finally`까지 도달하지 못하는 상황**이 실제로 발생하고 있다는 뜻이다. 즉 "`Update()`가 끝나면서 `CloseProcessHandle`이 호출될 기회 자체가 없었다"로 해석해야 한다.

정상이라면 `_Update()` 내부에서 예외가 발생하더라도 SEH는 `__finally` 블록까지 반드시 도달한다. `STATUS_ACCESS_VIOLATION`, `STATUS_INVALID_HANDLE` 같은 단순 커널 예외는 이 구조에서 핸들 누수로 이어질 수 없다. 그렇다면 단순 예외가 아니라 **커널 상위 스택이 unwind 없이 중단된 상황**이라는 것이다.

### __finally까지 가지 못하는 커널 시나리오

`ProcessNotifyCallbackRoutineEx`는 `PspExitProcess` 내부에서 호출된다. 이 시점에는 해당 프로세스의 스레드와 주소 공간이 이미 해제 중이다.

- **커널 APC / 스레드 강제 중단**: `_Update()` 내부의 `ZwQueryInformationProcess`가 어떤 커널 락을 기다리다 중단되면, 커널이 SEH unwind를 수행하지 않고 스레드를 중단시킨다. SEH unwind가 생략된 "비정상 종료 수준의 중단"이 발생하고, `__finally`는 실행되지 않는다.
- **stack unwind이 중단된 페이지 폴트**: `Remove() → Update()` 경로에서 비페이저블 컨텍스트의 페이지 폴트가 발생하면 SEH 핸들러를 호출하지 못하고 unwind 없이 빠져나온다.
- **EPROCESS 소멸 타이밍 레이스**: `PspExitProcess()`에서 EPROCESS가 deref되는 동안 `ZwOpenProcess`로 얻은 핸들이 내부적으로 `ObDereferenceObject`를 기다리는 상태에 빠질 수 있다.

결과적으로 남는 스택 패턴이 바로 이것이다.

```
nt!ObOpenObjectByPointer
nt!PsOpenProcess
orange!CProcessTable::OpenProcessHandle
orange!CProcessTable::Update
orange!CProcessTable::Remove
orange!ProcessNotifyCallbackRoutineEx
nt!PspExitProcess
```

`Update()` 안에서 열었던 핸들이 "닫히지 못한 채 스레드가 중단된" 흔적이다.

## 커널에서 SEH "보장"이 깨지는 경우

여기서 얻은 교훈은 커널 코드 작성자 대부분이 한 번은 걸려 넘어지는 주제다. SEH(`__try/__except/__finally`)는 유저 모드와 커널 모드 모두에서 동작하지만, **보장 범위가 다르다.**

- `__except`: 예외(Access Violation 등)가 발생했을 때 동작.
- `__finally`: try 블록이 정상 종료되든 예외로 빠지든 무조건 실행되는 블록.
- 컴파일러가 내부적으로 예외 핸들러를 설치하고, 예외 발생 시 stack unwind를 통해 `__finally`를 호출한다.

커널 모드에서 SEH는 trap frame 기반으로 동작한다. 예외가 발생하면 `KiDispatchException → RtlDispatchException → _C_specific_handler` 순서로 드라이버의 SEH 테이블을 스캔해 핸들러를 호출한다. **논리적으로는** `__finally`까지 정확히 호출되는 게 맞다. 그러나 다음 경우에는 그 보장이 깨진다.

**(1) IRQL > APC_LEVEL** — SEH의 unwind 루틴(`RtlUnwind`)은 pageable 코드나 스택 접근을 필요로 한다. `DISPATCH_LEVEL` 이상에서는 인터럽트가 금지돼 이 루틴이 완전하게 실행되지 못한다.

```cpp
KeAcquireSpinLock(&Lock, &OldIrql);
__try {
   AccessPageableMemory();   // DISPATCH_LEVEL에서 page fault → bugcheck/중단
}
__finally {
   KeReleaseSpinLock(&Lock, OldIrql);   // 미실행
}
```

**(2) 비페이저블 컨텍스트에서 페이지 폴트** — NonPaged 코드에서 page fault가 나면 SEH가 잡더라도 memory manager가 rollback을 허용하지 않아 unwind가 생략된다.

**(3) EPROCESS/ETHREAD 해제 중** — `PsSetCreateProcessNotifyRoutineEx` 콜백처럼 커널 내부 객체가 해제되는 시점에 호출되는 루틴에서 예외가 나면, 커널은 unwind를 시도하기보다 "callback execution 중단"만 하고 caller로 복귀한다. 즉 `__finally`까지 들어가지 않는다. **이번 핸들 누수의 전형적인 케이스다.**

**(4) BugCheck, KeBugCheckEx, 스레드 kill** — stack unwind 자체가 발생하지 않는다.

Microsoft WDK 문서 "Exception Handling in Kernel-Mode Drivers"의 입장도 같다: **"커널 모드에서 SEH를 쓸 수는 있지만, `__finally` 블록을 리소스 해제 보장용으로 쓰지 말라."**

| 영역 | SEH 사용 | finally 보장성 |
|---|---|---|
| User mode | 완전 보장 | 100% |
| Kernel mode (PASSIVE_LEVEL) | 대부분 안전 | 높음 (~90%) |
| Kernel mode (DISPATCH_LEVEL 이상) | 위험 | 낮음 |
| Exit/Unload 등 해제 중 컨텍스트 | 불안정 | 매우 낮음 |

커널에서 안전하게 예외를 다루려면 `__finally` 대신 **명시적 cleanup**을 쓴다. `goto cleanup` 패턴으로 실패 시점마다 `ZwClose`를 명시하거나, 아예 핸들 대신 `ObReferenceObjectByHandle`로 커널 객체 참조만 관리하는 것이 확실하다.

## IRQL — 무엇이 허용되는가를 결정하는 실행 레벨

원인을 정확히 짚으려면 IRQL(Interrupt Request Level)을 짚고 가야 한다. IRQL은 현재 CPU가 허용할 수 있는 인터럽트·스케줄링·페이지 폴트의 우선순위를 나타내는 정수 레벨이다. **IRQL이 높을수록 더 많은 인터럽트가 막히고, 더 적은 API만 호출할 수 있다.**

| IRQL | 상수 | 설명 |
|---|---|---|
| 0 | PASSIVE_LEVEL | 일반 스레드 모드, pageable 메모리 접근 가능, 거의 모든 커널 API 사용 가능 |
| 1 | APC_LEVEL | APC 수행 중, 일부 동기화 제한, pageable 접근 가능 |
| 2 | DISPATCH_LEVEL | DPC, SpinLock 사용, pageable 접근 불가 |
| 3~30 | Device IRQL | 하드웨어 인터럽트 처리, 매우 제한적 API |
| 31 | HIGH_LEVEL | 모든 인터럽트 마스크, 커널이 사실상 멈춘 상태 |

IRQL이 높아지면 "무엇을 해서는 안 되는가"가 급격히 늘어난다.

| 구분 | PASSIVE_LEVEL | DISPATCH_LEVEL 이상 |
|---|---|---|
| 페이지 폴트 | 가능 | ❌ (BSOD) |
| Zw 계열 API | 대부분 가능 | ❌ (Ke 계열만) |
| FastMutex | 가능 | ❌ |
| PagedPool 할당 | 가능 | ❌ |
| NonPagedPool 할당 | 가능 | 가능 |
| 스레드 스케줄링 / Wait | 가능 | ❌ |

예를 들어 아래 코드는 `DISPATCH_LEVEL`에서 `Zw` 함수를 호출하므로 `IRQL_NOT_LESS_OR_EQUAL (0xA)` 크래시로 이어진다.

```cpp
KeAcquireSpinLock(&lock, &irql);
ZwQueryInformationProcess(...);   // ❌ DISPATCH_LEVEL에서 Zw 호출 → BSOD
KeReleaseSpinLock(&lock, irql);
```

### 우리 드라이버 루틴별 IRQL

그럼 우리 드라이버의 루틴들은 어떤 IRQL에서 도는가?

| 함수 | 실행 IRQL | 근거 | Zw 호출 |
|---|---|---|---|
| DriverEntry / DriverUnload | PASSIVE_LEVEL | 로드/언로드 스레드 컨텍스트 | ✅ |
| StartProcessFilter / StopProcessFilter | PASSIVE_LEVEL | 등록/해제 시점 | ✅ |
| ProcessNotifyCallbackRoutineEx | PASSIVE_LEVEL | 공식: 항상 PASSIVE | ✅ (단, Exit 시점 위험) |
| ThreadNotifyCallbackRoutine | PASSIVE_LEVEL | 스레드 생성/종료 | ✅ |
| FileCreate / Read / Write | ≤ APC_LEVEL | IRP MajorFunction = Caller IRQL | ✅ |
| DPC / Timer / WorkItem | DISPATCH_LEVEL | 큐 등록 루틴 | ❌ (NonPaged만) |

MSDN 공식 정의는 이렇게 못박는다:

> The CreateProcessNotifyEx callback routine is called at PASSIVE_LEVEL, but the target process may be in any state of initialization or termination.

즉 함수 자체는 `PASSIVE_LEVEL`이라 `Zw` 호출이 형식적으로는 가능하지만, **종료(`CreateInfo == NULL`) 시점에는 대상 프로세스의 EPROCESS가 이미 해제 중**이라 `ZwOpenProcess`/`ZwQueryInformationProcess`가 내부 `ObReferenceObjectByPointer`에서 예외를 낸다.

## 진짜 원인

정리하면, **IRQL이 문제를 일으킨 게 아니다.** 우리 코드 대부분은 `PASSIVE_LEVEL`에서 돈다. 문제는 "PASSIVE_LEVEL이지만 대상 객체가 이미 파괴 중이라 `Zw` 함수가 실패"한 것이고, 더구나 SEH는 IRQL이 높을 때만 skip되는 게 아니라 **현재 스레드가 termination 중이거나 APC cancel 중일 때도 unwind를 중단**한다.

`PspExitProcess()` 내부에서 `ProcessNotifyCallbackRoutineEx`가 호출될 때, 이 "exit thread" 컨텍스트는 스레드 종료 플래그를 이미 세팅한 상태다. 그래서 커널이 unwind 없이 콜백을 강제 종료할 수 있고, 바로 그 순간 `__finally` 미실행이 발생한다. **IRQL은 PASSIVE_LEVEL이지만, 스레드 컨텍스트가 곧 사라질 예정이라 unwind가 생략된** 케이스다.

## 해결 — Exit 콜백을 WorkItem으로 분리

핵심 루틴(`ProcessNotifyCallbackRoutineEx → Remove() → Update() → ZwOpenProcess`)을 IRQL·수명 안전 구조로 리팩터링한다. 목표는 두 가지다.

- Exit 콜백에서 `Zw` 호출 제거 → EPROCESS 해제 중 예외 방지
- WorkItem으로 지연 실행 → 안전한 시스템 워커 스레드(`PASSIVE_LEVEL`)에서 `Update()` 수행

수정 후 흐름:

```
ProcessNotifyCallbackRoutineEx (Exit)
 └─ QueueWorkItem(ProcessExitWorker, ProcessId)   // 등록만

ProcessExitWorker (WorkItem, 시스템 스레드)
 ├─ ProcessTable()->Remove(...)   // Zw 호출 안전
 │   └─ Update()
 └─ CMemory::Free(WorkItem)
```

실제 적용 코드:

```cpp
// ① WorkItem 구조체
typedef struct _PROCESS_EXIT_WORKITEM {
    WORK_QUEUE_ITEM  WorkItem;
    HANDLE           ProcessId;
} PROCESS_EXIT_WORKITEM, *PPROCESS_EXIT_WORKITEM;

// ② WorkItem 실행 함수
VOID ProcessExitWorker(_In_ PVOID Context)
{
    PAGED_CODE();
    PPROCESS_EXIT_WORKITEM pItem = (PPROCESS_EXIT_WORKITEM)Context;
    HANDLE pid = pItem->ProcessId;

    __try {
        // 여기서는 PASSIVE_LEVEL이 보장되므로 Remove()/Update() 안전
        ProcessTable()->Remove(pid, true, NULL,
            [](bool bCreationSaved, PPROCESS_ENTRY pEntry, PVOID pCtx) {
                if (bCreationSaved && pEntry) {
                    COUNTERS c; RtlZeroMemory(&c, sizeof(c));
                    ProcessTable()->Update("ExitWorker", pEntry->PID, &c);
                }
            });
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        __log("ProcessExitWorker exception: %x", GetExceptionCode());
    }
    CMemory::Free(pItem);
}

// ③ ProcessNotifyCallbackRoutineEx 내부 (Exit 분기)
else  // CreateInfo == NULL (Exit)
{
    PPROCESS_EXIT_WORKITEM pItem = (PPROCESS_EXIT_WORKITEM)
        CMemory::Allocate(NonPagedPoolNx, sizeof(PROCESS_EXIT_WORKITEM), 'PXIT');
    if (pItem) {
        ExInitializeWorkItem(&pItem->WorkItem, ProcessExitWorker, pItem);
        pItem->ProcessId = ProcessId;
        ExQueueWorkItem(&pItem->WorkItem, DelayedWorkQueue);  // 시스템 워커, PASSIVE
    }
}
```

이 구조에서는 Exit 콜백은 WorkItem 등록만 하고, 실제 `ZwOpenProcess`/`ZwQueryInformationProcess`와 핸들 닫기는 모두 시스템 워커 스레드의 `PASSIVE_LEVEL` 안전 구간에서 수행된다. `Zw` 호출 안정, `__finally` 보장, 핸들 누수 해소를 한 번에 얻는다.

## 드라이버 전수 점검

이 사건을 계기로 드라이버(yfilter) 전체를 "구조를 바꾸지 않고 최소 수정으로 크래시·핸들 누수·SEH 오작동을 제거한다"는 방침으로 훑었다. 발견된 위험 지점과 우선순위는 다음과 같다.

| 우선순위 | 위치 | 문제 | 수정 |
|---|---|---|---|
| 🟥 1 | Process.cpp (Exit 콜백) | 종료 중 EPROCESS에 Zw 호출 → 예외/SEH 실패/핸들 누수 | WorkItem 분리, 직접 Remove 호출 금지 |
| 🟧 2 | CProcessTable::_Update() | 5개 이상 Zw 호출 중 예외 시 핸들 닫기 누락 가능 | cleanup 라벨 + 명시적 ZwClose |
| 🟧 3 | CProcessTable::Add3() | RtlInsertElementGenericTable 실패 시 hProcess 미닫기 | 삽입 실패 시 ZwClose |
| 🟨 4 | CProcessTable::Remove() | Exit 시 이미 없는 프로세스에 Update() → STATUS_INVALID_CID | Exit 플래그로 Update() 생략 |
| 🟩 5 | Driver.cpp (DriverUnload) | DestroyProcessTable() 보장 불분명 | 언로드 시 테이블/핸들 정리 보장 |
| 🟩 6 | 전체 | Release 빌드에서 ASSERT/PAGED_CODE 무효 → IRQL 검사 소실 | NT_ASSERT로 교체(Release에서도 평가) |

Add3()의 삽입 실패 시 누수 방지 패턴 예시:

```cpp
pEntry = (PPROCESS_ENTRY)RtlInsertElementGenericTable(
    &m_table, &entry, sizeof(PROCESS_ENTRY), &bRet);
if (pEntry == NULL) {
    if (entry.hProcess) ZwClose(entry.hProcess);  // 실패 시 명시적 닫기
    FreeEntryData(&entry, false);
    return false;
}
```

구조 변경 없이 약 5개 함수의 국지적 수정만으로 커널 안정성을 크게 끌어올릴 수 있다.

## 결론

- 표면상 코드는 `Update()`가 `__finally`로 핸들을 닫으니 안전해 보이지만, 프로세스 Exit 콜백은 커널이 객체를 해제 중이라 **SEH unwind 자체가 실패**할 수 있다.
- "커널에서 SEH는 쓸 수 있지만, `__finally`는 믿지 말라. close/free/unlock 같은 cleanup은 항상 코드로 명시하라"가 현실적인 룰이다.
- 종료 콜백처럼 위험한 컨텍스트에서 `Zw` 호출이 꼭 필요하면, **WorkItem으로 지연 실행**해 안전한 `PASSIVE_LEVEL` 스레드 컨텍스트로 옮기는 것이 IRQL·SEH·핸들 누수 문제를 동시에 푸는 가장 확실한 방법이다.

*Orange Platform 커널 드라이버의 실제 핸들 누수 사건을 추적·해결한 분석 리포트입니다.*
