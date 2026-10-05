---
title: "프로세스 강제 종료 이벤트 하나에 에이전트 ETW 수신이 통째로 멈추다 — 빌드별 필드 차이와 TdhGetProperty 예외"
excerpt: "새 빌드를 배포하자 Windows 10 노드 일부에서 에이전트의 ETW 수신 스레드가 예외로 끝났다. 프로세스 강제 종료 이벤트의 필드가 Windows 빌드마다 달라 TdhGetProperty가 실패했고, 콜백에 catch가 없어 TCP·DNS·방화벽 감시까지 한꺼번에 멈췄다. 콜스택으로 멈춘 자리를 짚고 원인을 정리한다."
category: tech
date: 2026-10-04
author: kim-tigerj
tags: [Windows, ETW, TdhGetProperty, Kernel-Audit-API-Calls, C++, 에이전트, Orange Platform]
---

## 현상

새 에이전트 빌드(1.6.242.735)를 사내 노드에 배포하고 30분 안에, 노드 3대에서 주 ETW 수신 스레드(`CETW::TraceThread`)가 예외로 끝났다. 온라인 16대 중 3대다. 세 대 모두 `agent.error.log`에 같은 줄이 남았다.

| 노드 | Windows 빌드 | 시각 | agent.error.log |
|------|------|------|------|
| PC A | 19045 | 13:16:37 | `CETW::TraceThread / CETW.cpp:2290 / exception Unexpected error from TdhGetProperty.` |
| PC B | 19045 | 13:20:33 | 같음 |
| PC C | 19045 | 13:22:04 | 같음 |

`agent.event.log`의 `CETW::TraceThread` 줄은 정상 노드에 1개(시작)뿐인데, 이 3대에는 2개(시작·끝)였다. 수신 스레드가 끝났다는 뜻이다.

## 영향

주 ETW 세션 `OrangeAgentKernelTracer` 하나에 Kernel-Audit-API-Calls(프로세스 강제 종료), TCPIP, DNS Client, WFP 네 공급자를 켜고, 수신 스레드 하나(`TraceThread`의 `ProcessTrace`)가 네 공급자의 이벤트를 모두 받는다.

강제 종료 이벤트 처리에서 난 예외가 `ProcessTrace`를 끝내면 TCP·DNS·WFP 이벤트도 함께 끊긴다. 수신 스레드를 다시 여는 코드가 없어, 에이전트가 다시 시작할 때까지 네 가지 감시가 모두 멈춘 채로 간다.

Windows 10과 Windows 11 22631 노드에서는 다른 프로세스를 강제 종료해 성공한 이벤트가 처음 들어오는 순간 이렇게 된다. 2026-07-03(OR-1566) 이후 버전이 모두 해당한다.

## 원인

Kernel-Audit-API-Calls 이벤트 2(다른 프로세스 강제 종료)의 필드는 Windows 빌드마다 다르다. 19045(Windows 10)·22631(Windows 11)은 v0(`TargetProcessId`, `ReturnCode`) 하나뿐이고, 26200에만 v1(`TargetProcessStartKey`, `TargetProcessCreationTime` 추가)이 있다.

콜백 `CETW::EventRecordCallback_2_Is_Good`은 `ReturnCode`가 0이면 `TargetProcessId` 다음에 `TargetProcessStartKey`를 `GetData<>()`로 읽는다. 이 코드는 OR-1566 커밋(2026-07-03)에서 들어왔다.

v0에는 `TargetProcessStartKey`가 없어 `TdhGetProperty`가 실패하고, `CETW::GetData`가 `std::exception`을 던진다. ETW 콜백 진입점(`CETW::EventRecordCallback`)에는 catch가 없다. 예외가 `ProcessTrace`를 지나 `CETW::TraceThread`의 catch까지 올라오고, 그 자리에서 수신이 끝난다.

```
ProcessTrace
  -> CETW::EventRecordCallback            (catch 없음)
    -> EventRecordCallback_2
      -> EventRecordCallback_2_Is_Good
        -> ReturnCode == 0
        -> GetData<DWORD64>(TargetProcessStartKey)  -> v0 에 없음 -> TdhGetProperty 실패 -> throw
  <- 예외가 ProcessTrace 를 뚫고 나옴
CETW::TraceThread catch -> AGENT_EXCEPTION_LOG -> 스레드 종료 (TCP·DNS·WFP 도 같이 멈춤)
```

v1에만 있는 필드를 빌드 구분 없이 읽은 것이 1차 원인이고, 콜백 진입점에 예외를 가두는 catch가 없어 이벤트 하나의 실패가 세션 전체를 끄는 것이 2차 원인이다.

## 확인하지 못한 것

- 같은 19045인데 왜 일부 노드만 30분 안에 멈췄는지. 한 Windows 10 PC에서 `ping`을 다섯 가지 방법으로 강제 종료했을 때 별도 수집 세션에는 이벤트 2가 들어오지 않았다. 19045에서 이벤트 2가 어떤 종료에 기록되는지는 밝히지 못했다.
- 735 이전 버전에서 실제로 멈춘 기록. `agent.error.log`는 에이전트가 시작할 때 지워져 과거 기록이 남지 않는다.

## 대응 방향

- 이벤트 2는 버전을 보고 읽는다. `TargetProcessStartKey`는 v1에만 있으므로 v0에서는 읽지 않는다. Windows 10·22631에서는 PID로만 대상을 찾는다.
- ETW 콜백 진입점에서 예외를 잡아 그 이벤트 하나만 버린다. COM 플러그인 세션(`CComRpcSession::OnEventStatic`)이 같은 이유로 이미 이렇게 한다.
- 실패한 이벤트의 공급자·ID·버전·필드 이름·오류 코드를 로그에 남긴다.
- 수신 스레드가 끝나면 세션을 다시 여는 감시를 둔다. COM 플러그인의 `WatchSession`과 같은 방식이다.

Windows 10에서 강제 종료 대상을 PID만으로 찾을 때의 PID 재사용 처리는 아직 정하지 못했다.

---

*Orange Platform 에이전트의 ETW 수신 스레드 중단 장애 분석 리포트입니다.*
