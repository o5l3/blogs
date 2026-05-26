---
title: "어떤 프로세스가 내 프로그램을 죽였나 — ETW Kernel-Audit-API로 강제 종료 추적하기"
excerpt: "프로그램이 갑자기 종료될 때 '누가 죽였는지'를 알아내는 방법. Windows의 Microsoft-Windows-Kernel-Audit-API-Calls 프로바이더가 내보내는 TerminateProcess(Event 2)를 ETW 실시간 세션으로 구독해, 가해자(원인)·피해자(대상) 프로세스를 짝지어 식별하는 구현을 정리합니다."
category: tech
date: 2026-04-17
author: Orange Labs
tags: [ETW, Windows, 커널, 프로세스, 트러블슈팅]
---

## 문제

"프로그램이 다른 프로그램에 의해 강제 종료됐다"는 증상은 흔하지만, **누가 종료시켰는지**를 사후에 알아내긴 어렵습니다. 종료 시점엔 이미 프로세스가 사라져 있기 때문입니다.

## 단서 — Kernel-Audit-API-Calls 프로바이더

Windows는 `Microsoft-Windows-Kernel-Audit-API-Calls` ETW 프로바이더에서 `TerminateProcess` 호출을 **Event 2**로 내보냅니다.

```xml
<event value="2" symbol="KERNEL_AUDIT_API_TERMINATEPROCESS" .../>
<template tid="KERNEL_AUDIT_API_TERMINATEPROCESSArgs">
  <data name="TargetProcessId" inType="win:UInt32"/>
  <data name="ReturnCode" inType="win:UInt32"/>
</template>
```

이벤트 헤더의 `ProcessId`가 **호출자(가해자)**, 페이로드의 `TargetProcessId`가 **대상(피해자)**입니다. 이 둘을 짝지으면 "누가 누구를 종료했는지"가 나옵니다.

## 구현 핵심

ETW 실시간 세션을 열고(`StartTrace` → `EnableTraceEx2` → `OpenTraceW` → `ProcessTrace`), 콜백에서 Event 2를 처리합니다.

```cpp
VOID CETW::EventRecordCallback(PEVENT_RECORD EventRecord) {
    DWORD PID = EventRecord->EventHeader.ProcessId;          // 가해자
    if (EventRecord->EventHeader.EventDescriptor.Id == 2) {
        DWORD TargetPID = GetData<uint32_t>(EventRecord, L"TargetProcessId"); // 피해자
        // PID, TargetPID 각각의 프로세스 정보를 캐시에서 조회해 짝짓기
    }
}
```

## 실전에서 부딪히는 두 가지

**1. 종료된 프로세스는 이미 없다** — 이벤트를 받는 시점에 가해자/피해자 프로세스가 이미 종료됐을 수 있습니다. 따라서 프로세스 종료 정보도 일정 시간 **캐시에 보관**해야 사후 조회가 됩니다.

**2. 정상 종료를 걸러야 한다** — 로그오프 시 `csrss.exe`·`smss.exe`·`svchost.exe`·`LogonUI.exe`·`WerFault.exe` 등이 프로그램들을 정상적으로 대량 종료합니다. 이들을 필터링하지 않으면 "강제 종료" 노이즈가 폭증합니다. OS 구성요소(서명·경로 기준)는 가해자에서 제외합니다.

## 정리

`TerminateProcess` 감사 이벤트 + 프로세스 캐시 + OS 정상 종료 필터링을 조합하면, "다른 프로그램에 의한 강제 종료"를 가해자–피해자 쌍으로 정확히 보고할 수 있습니다. 백신·그룹정책·작업 관리자 등이 업무 앱을 종료시키는 현장 문제를 정량으로 잡는 토대가 됩니다.

---

*Orange The Client 에이전트 구현에서 정리한 기술 노트입니다.*
