---
title: "Windows 터미널 서비스가 멈추자 에이전트가 통째로 오프라인 — sc start 1053과 ncalrpc 무기한 대기"
excerpt: "프로세스는 살아 있는데 서버로는 아무것도 못 보내고, 다시 올리려 해도 sc start가 1053으로 실패했다. WTSEnumerateSessions가 타는 로컬 RPC(ncalrpc)에는 타임아웃 인자가 없어, 터미널 서비스가 굳으면 부른 스레드가 무기한 선다. 덤프 분석으로 멈춘 자리를 찾고, 생존 경로에서 WTS 호출을 걷어낸 과정을 정리한다."
category: tech
date: 2026-09-26
author: kim-tigerj
tags: [Windows, WTSEnumerateSessions, ALPC, RPC, 터미널서비스, 덤프분석, C++, Orange Platform]
---

## 현상

한 PC에서 에이전트가 서버에는 오프라인으로 보였다. 프로세스는 살아 있었고 로컬 수집과 DB 기록은 계속 돌았지만 서버로는 아무것도 보내지 못했다. 같은 시각 이 PC의 작업관리자도 창이 뜨지 않고 트레이 아이콘만 늘어났다. 에이전트를 다시 올리려 해도 `sc start`가 **1053(서비스가 제때 응답하지 않음)**으로 실패했다.

## 원인

Windows 터미널 서비스(TermService)가 응답을 멈췄다. 에이전트는 세션 ID와 사용자 이름을 얻으려고 WTS 계열 함수를 부르는데, 이 함수들은 그 서비스에 로컬 RPC로 묻는다. 응답이 오지 않자 그대로 대기했다. 덤프를 뜬 시점 기준 5시간 4분째였다.

덤프에서 멈춰 있던 스레드는 둘이다.

```
[스레드 1] 서비스 메인 루프
CAgent2::RunLoop -> CAgent2::RunUser -> YAgent::GetUserSessionId
  -> WTSEnumerateSessionsW -> NtAlpcSendWaitReceivePort

[스레드 6] Manager
CAgentHelper3::ApplySettings -> RegisterToServer2 -> RegisterToServer
  -> GLOBAL -> YAgent::BeTheCurrentUser -> YAgent::GetActiveSessionId
  -> WTSEnumerateSessionsW -> NtAlpcSendWaitReceivePort
```

두 번째 스레드는 `m_doc`의 `CRITICAL_SECTION`을 쥔 채 멈췄다. 그래서 `m_doc`을 쓰는 다른 스레드까지 함께 섰다. 그 자리에는 「시간 걸리는 건 이 안에서 하지 말 것」이라는 주석이 이미 있었다.

## 타임아웃을 걸 수 없는 이유

MSDN 「Preventing Client-side Hangs」가 내놓는 수단은 두 가지인데 둘 다 이 경우에 쓸 수 없다.

- **TCP keep-alive(`RpcMgmtSetComTimeout`)**: 문서에 ncalrpc 전송은 keep-alive를 쓰지 않는다고 적혀 있다.
- **호출 타임아웃(`RPC_C_OPT_CALL_TIMEOUT`)**: 문서 주석에 `ncacn_ip_tcp`와 `ncacn_http`에서만 동작한다고 적혀 있다.

우리 스택은 `NtAlpcSendWaitReceivePort`로 로컬 ALPC(ncalrpc)다. 서버 프로세스가 죽으면 RPC 런타임이 즉시 실패로 처리하지만, termsrv가 살아 있는 채 스레드만 물리면 포트가 열려 있어 영원히 기다린다.

## 대체 수단 실측

터미널 서비스가 멈춘 상태의 같은 PC에서 쟀다.

| 수단 | 소요 | 비고 |
|------|------|------|
| `WTSGetActiveConsoleSessionId()` | 0.035 ms | 콘솔 세션 번호. kernel32, RPC 아님 |
| `ProcessIdToSessionId()` | 마이크로초 | 커널 직접 호출 |
| `HKEY_USERS` 열거 | 0.17 ms | 로그온 사용자 SID |
| Volatile Environment 읽기 | 0.38 ms | USERNAME, 세션 번호, SESSIONNAME |
| `CreateToolhelp32Snapshot` + 순회 | 8.94 ms | 프로세스 374개. 비싸서 기각 |
| `WTSEnumerateSessions()` | 응답 없음 | 5시간 경과 |

## 쓸 수 없던 것

- `OpenInputDesktop`의 데스크톱 이름으로 화면 잠김을 가리려 했으나 안 된다. 잠긴 동안에도 297 표본 전부 `Default`였다. Windows 10/11의 Win+L은 입력 데스크톱을 Winlogon으로 바꾸지 않는다.
- `LogonUI.exe` 존재 여부도 잠김과 무관하다. 잠기지 않은 상태에서도 떠 있었다.
- 커널 프로세스 이벤트에서 세션 번호를 기억해 두는 방식은 단명 프로세스가 섞이면 엉뚱한 세션을 잡는다.

## 조치

에이전트가 살아 있어야 하는 경로에서 그 호출을 걷어냈다.

- **main.cpp**: 서비스 시작 갈래에서 `RunUserApp` 호출을 없앴다. `sc start`를 막던 자리다.
- **CAgentParams 생성자**: 시작할 때 화면 잠김을 조회하던 것을 없앴다.
- **CAgentHelper3::GLOBAL**: 사용자 이름을 사용자로 가장해 읽던 것을, 락 밖에서 레지스트리(`HKEY_USERS`의 Volatile Environment)를 읽도록 바꿨다. 이름을 못 읽으면 성공과 실패가 뒤바뀔 때만 한 번 남긴다.
- **CAgent2::RunLoop**: 로그온한 사용자를 찾아 user.exe를 띄우던 갈래를 통째로 없앴다. 그 시점에는 OS가 HKLM Run으로 이미 띄우므로, 에이전트가 띄운 쪽은 단일 인스턴스 뮤텍스에 걸려 바로 죽으면서 터미널 서비스만 한 번 더 불렀다.
- **CAgentHelper3::ManagerThread**: `log.cdb` 정리 조건에서 잠김 값을 뺐다. UI 미연결과 유휴 시간으로 판단한다.
- **CAgent2::RunUser**: user.exe를 띄우는 일을 전용 스레드로 옮겼다. 여기에만 `WTSQueryUserToken`이 남는다. 앞 시도가 끝나지 않았으면 새로 만들지 않는다. 내려가는 중이면 띄우지 않고, 스레드 몸통은 `try/catch`와 `__try/__except`로 감쌌다.
- **CAgent2.Service.cpp**: `SERVICE_CONTROL_STOP`과 `USER_SHUTDOWN`으로 내려갈 때 기록이 없어 종료 출처를 가릴 수 없었다. 어느 제어로 내려가는지 한 줄 남긴다.
- **yagent.common.h**: `HasLoggedOnUser`와 `IsSessionLocked`에 어디서 부르면 안 되는지 적었다. 라이브러리라 함수는 남긴다.

## 재현과 확인

멈춤은 서비스를 중지(stop)해서는 만들 수 없다. 중지하면 WTS 호출이 즉시 에러로 돌아온다. TermService가 든 svchost를 통째로 재우면(suspend) 포트는 열린 채 응답만 없어져 사고 때와 같은 상태가 된다. 이 PC에서는 그 svchost가 TermService 단독이었다.

재운 상태에서 `sc start`를 걸어 1053을 재현했고, 시작 직후 덤프를 떠서 자리를 찾았다.

```
orange!CAgentParams::RunUserApp+0x177
orange!wmain+0x3c21
```

서비스 ImagePath에 인자가 없어 SCM이 인자 없이 실행하고, 그러면 `wmain`의 `__argc < 2` 갈래를 탄다. 그 갈래가 `StartByUser` 앞에서 `RunUserApp`을 부르고, 그 안의 `GetUserSessionId`가 터미널 서비스를 물어 거기서 섰다. `StartServiceCtrlDispatcher`에 닿지 못하니 SCM이 1053으로 판정한다. 앞서 이 함수를 「사람이 직접 실행할 때만 불린다」고 본 판단이 틀렸고, 덤프 스택이 그것을 뒤집었다.

고친 뒤 같은 PC에서 서비스가 정상 기동했다. 시작 직후 로그가 바로 찍히고(전에는 24초 공백), INITIALIZED를 지나 MQTT 구독 7개와 업로드 256건까지 평소대로 돌았다. `orange.user.exe`도 떴다.

재현 시험에는 뒷정리 비용이 있다. 프로세스를 재우면 SCM이 그 서비스에 보낸 제어 요청이 쌓여, 풀어도 `sc query`가 한동안 정상으로 돌아오지 않는다. 시험 PC는 재부팅을 각오해야 한다.

## 남은 것

- 터미널 서비스가 멈춘 채로 있으면 user.exe를 띄우는 전용 스레드 하나가 영구 대기하고, 트레이는 다음 로그온까지 뜨지 않는다. 잡 풀(스레드 상한 4개)을 쓰지 않은 것은 하나를 잃는 값이 크기 때문이다.
- 종료 중에 그 스레드가 이미 멈춰 있으면 정리된 객체를 만질 수 있다. 기다리게 하면 종료가 막히므로, 죽지 않게 막는 데까지만 했다.
- 명령 처리(DISPLAY, PRINTER, LiveResponse, @session)와 원격 접속자 정보 수집 10곳은 여전히 WTS를 쓴다. 잡 스레드와 이벤트 처리에서만 돌아 서비스 생존과 무관해 이번 범위에서 뺐다.

---

*Orange Platform 에이전트가 겪은 터미널 서비스 무응답 장애 분석 리포트입니다.*
