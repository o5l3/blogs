---
title: "PID 재사용을 이긴 프로세스 고유번호 — 커널 드라이버 PUID를 Windows StartKey로 전환"
excerpt: "KillProcess 탐지 로그에서 발견한 TargetProcessStartKey를 실마리로, 경로·부팅ID·PID 조합 32비트 해시로 만들던 PUID를 Windows가 프로세스마다 부여하는 64비트 StartKey로 바꿔 단명 프로세스 식별 실패를 해결한 커널 드라이버 구현 기록."
category: tech
date: 2026-07-02
author: kim-tigerj
tags: [커널 드라이버, PUID, PsGetProcessStartKey, PID 재사용, 단명 프로세스, Windows, Orange Platform]
---

## 배경

이 작업은 `Agent.error.log`에 남은 두 종류의 로그를 분석하다 시작됐다. 하나는 프로세스 강제 종료(KillProcess) 탐지 후 발생 프로세스를 찾지 못한 Agent Error 로그, 다른 하나는 단명 다발 프로세스의 핸들을 얻지 못하는 sprocess 처리 문제였다.

그 이벤트(req) 안에 `TargetProcessStartKey`라는 값이 들어 있는 것을 발견했다. 이 StartKey가 PID 재사용과 무관한 Windows의 프로세스 고유번호임을 확인해, 커널 드라이버의 PUID 생성에도 같은 방식을 쓰기로 했다.

발견 당시 로그 (KillProcess 감지 이벤트):

```
CETW::EventRecordCallback_2_Is_Good
req {
 "ReturnCode" : 3221225738,
 "TargetProcessId" : 129008,
 "TargetProcessStartKey" : "18577348463116243"   ← 이 구절에서 출발
}
```

## 개요

커널 드라이버가 프로세스 고유 번호(PUID)를 만드는 방식을 바꾼다.

- **기존**: 경로 · 부팅ID · 생성시간 · PID 를 조합한 32비트 해시
- **변경**: Windows가 프로세스마다 부여하는 64비트 고유번호(StartKey)를 그대로 사용
- StartKey를 지원하지 않는 구형 OS(Windows 10 1703 미만)에서는 기존 해시 방식으로 자동 전환

## 바꾼 이유

단명 다발 프로세스의 경우, 윈도 이벤트에 기록된 PID 값으로 우리 프로세스 캐시에서 검색이 안 된다.

- `ProcessStart`를 처리할 때 이미 사망했기에 해당 프로세스의 핸들을 얻을 수 없다.
- 1분간 캐시를 유지해도 커널에서 프로세스 객체가 유지되지 않는다. PID가 재사용되면 에이전트에서 PID로 구분하기 어렵다.

StartKey는 Windows가 보장하는 고유값이라 PID가 재사용돼도 프로세스를 정확히 구분한다. 아주 짧게 살았다 사라지는(단명) 프로세스도 정확히 식별할 수 있다.

## 핵심 변경 코드

### 1. PUID 자료형 32 → 64비트 — `include/yagent.define.h`

```c
-typedef UID       PROCUID;
+typedef ULONGLONG PROCUID;
```

### 2. StartKey 함수 동적 연결 — `ofilter/Config.h`, `ofilter/Config.cpp`

```c
// Config.h — 함수 포인터 타입과 멤버 추가
typedef ULONGLONG (NTAPI *FN_PsGetProcessStartKey)(PEPROCESS Process);
FN_PsGetProcessStartKey  pPsGetProcessStartKey;

// Config.cpp — 드라이버 시작 시 함수 주소 확보 (없으면 NULL)
pConfig->pPsGetProcessStartKey =
    (FN_PsGetProcessStartKey)GetProcAddress(L"PsGetProcessStartKey");
```

### 3. PUID 생성 로직 — `ofilter/Misc.cpp` (GetPUID)

```c
// StartKey를 쓸 수 있으면 그것으로 PUID 생성
if (Config() && Config()->pPsGetProcessStartKey) {
    PEPROCESS Process = NULL;
    if (NT_SUCCESS(PsLookupProcessByProcessId(PID, &Process))) {
        if (pPUID) *pPUID = Config()->pPsGetProcessStartKey(Process);
        ObDereferenceObject(Process);          // 참조 해제
        return STATUS_SUCCESS;
    }
}
// 못 쓰면 기존 방식: machineGuid.bootId.생성시간.PPID.PID.경로 → 해시
```

기존 `GetProcUID` 함수는 `GetPUID`로 통합하며 제거했다.

### 4. PUID를 쓰는 타입 64비트로 일괄 정리

- `ofilter/ofilter.h` — `CreateCounterMessage` 인자, `PROCESS_ENTRY.PUID`
- `ofilter/CProcessTable.h` — `MakeCountersMessage` 인자
- `ofilter/Message.cpp` — `CreateCounterMessage` 정의
- `ofilter/File.Delete.h`, `File.Filter.h`, `File.Failed.h`, `FilterContext.h` — 각 구조체의 PUID 필드 `UID` → `PROCUID`

### 5. 드라이버 버전 올림 — `ofilterctrl/OFILTER.rc`

```
FileVersion  0.3.1.23 → 0.3.1.25
```

## 참고

- StartKey는 살아있는 프로세스에서만 얻을 수 있다. 그래서 PUID는 프로세스 생성 시점에 한 번 계산해 캐시에 저장하고, 이후에는 PID로 캐시를 조회한다.
- `GetPUID`가 불리는 경로(프로세스 생성 콜백 · 드라이버 초기화 · 레지스트리/포트 명령 콜백)는 모두 `PASSIVE_LEVEL`이라 `PsLookupProcessByProcessId` 사용에 문제가 없다.

*Orange Platform 커널 드라이버의 프로세스 식별 방식 개선 기록입니다.*
