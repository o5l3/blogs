---
title: "서비스 정지가 끝나지 않고 멈춰 강제 종료로 이어진 경우"
excerpt: "비동기 I/O를 취소한 뒤 완료를 기다리는 코드 한 줄이 서비스 종료를 영원히 멈추게 했다. IOCP에 묶인 핸들은 취소 완료를 누군가 완료 포트에서 꺼내야 풀린다는 사실을 놓쳤던 두 번의 회귀와, 크래시 덤프로 원인을 좁혀 간 과정을 정리한다."
category: tech
date: 2026-11-14
author: kim-tigerj
tags: [Windows, IOCP, GetOverlappedResult, 서비스종료, 비동기IO, Orange Platform]
---

## 증상

에이전트 서비스를 정지하거나 업데이트할 때 가끔 종료가 끝나지 않았다. `sc stop` 뒤 상태가 STOP_PENDING에 머물렀고, 일정 시간(30초)이 지나면 강제 종료가 걸렸다. 어떤 PC는 걸리지 않고 바로 끝났고, 같은 PC에서도 어떤 종료 시도는 걸리고 어떤 시도는 걸리지 않았다.

## 시작은 코드 리뷰였다

이 작업은 다른 회사의 비슷한 사고(스레드를 강제로 죽이다 생긴 문제) 분석에서 나온 질문으로 시작했다. 우리 에이전트의 스레드 종료 코드를 읽기만 해서 비슷한 약점이 있는지 찾는 조사였다.

조사 결과 우리 코드에는 `TerminateThread` 호출이 없어 그 사고와 같은 유형은 날 수 없었다. 대신 두 가지 다른 약점이 나왔다.

1. 핸들을 닫은 뒤 변수를 NULL로 비우지 않는 곳이 있어, 특정 실패 경로에서 남의 핸들을 닫을 수 있었다.
2. 스레드를 기다리다 시간이 초과돼도 정리를 계속 진행해, 아직 그 메모리를 쓰고 있을 스레드가 있는데 메모리를 해제하는 곳이 있었다.

필터 드라이버와 통신하는 포트를 정리하는 `DestroyPortInfo` 함수가 두 번째 약점의 대표적인 경우였다. 포트를 닫기 전에 메시지 버퍼를 먼저 `free`하고 있었고, 그 버퍼는 아직 콜백을 실행 중인 스레드가 참조할 수 있었다.

## 1차 수정과 첫 번째 회귀

`DestroyPortInfo`를 고쳤다. 핸들 배열을 미리 0으로 채워 쓰레기 값을 닫는 경로를 막고, 스레드가 제때 안 나가면 메모리를 해제하지 않고 그대로 버리도록(해제된 메모리를 쓰는 것보다 누수가 낫다는 판단) 바꿨다. 순서도 `CancelIoEx`로 걸린 I/O를 취소하고 `GetOverlappedResult`로 취소 완료를 확인한 뒤에 포트를 닫고 메모리를 해제하도록 바꿨다.

리뷰 세 차례와 디버그 빌드 확인을 마치고 반영했는데, 배포 사흘 뒤 같은 PC에서 종료가 멈추는 회귀가 나타났다. 크래시 덤프로 멈춘 위치를 확인했다.

```
thread 1 (서비스 제어 스레드)
 → CAgent2::Shutdown
 → CFilterCtrl::Shutdown
 → DestroyPortInfo
 → GetOverlappedResult(hPort, &ov, &dwBytes, TRUE)
 → WaitForSingleObjectEx(INFINITE)
```

덤프 안의 `OVERLAPPED` 값은 `Internal = 0x103`(STATUS_PENDING), `hEvent = 0`이었다. `GetOverlappedResult`는 `hEvent`가 NULL이면 포트 핸들 자체가 신호될 때까지 기다리는데, 그 포트는 이벤트 스레드가 이미 빠져나가 아무도 신호를 주지 않는 상태였다. 마지막으로 걸려 있던 비동기 읽기(`FilterGetMessage`)가 `ERROR_IO_PENDING`이 아닌 오류로 동기적으로 실패했을 가능성이 컸다 — 이 경우 커널은 완료 패킷을 만들지 않으므로 `Internal`은 호출 직전에 써 둔 PENDING 값 그대로 남는다. 즉 `CancelIoEx`로 취소할 "걸린 I/O"가 처음부터 없었는데, 수정한 코드는 그 경우를 가리지 않고 무조건 기다렸다.

수정은 `CancelIoEx`의 반환값을 보는 것으로 좁혔다.

```cpp
// 전
CancelIoEx(p->hPort, NULL);
if (bExited && p->pMessage) {
    ...
    GetOverlappedResult(p->hPort, &p->pMessage[i].ymsg.ov, &dwBytes, TRUE);

// 후 — 걸린 I/O가 없으면(CancelIoEx 실패, ERROR_NOT_FOUND) 기다리지 않는다
if (CancelIoEx(p->hPort, NULL) && bExited && p->pMessage) {
    ...
    GetOverlappedResult(p->hPort, &p->pMessage[i].ymsg.ov, &dwBytes, TRUE);
```

운영 환경에 배포한 뒤 17대 중 16대가 정지 걸림 없이 올라왔고(1대는 절전 중이라 제외), 이후 며칠 간 추가 배포에서도 멈춤이 재현되지 않았다.

## 재발 — 진짜 원인은 IOCP 완료 큐였다

사흘 뒤 같은 PC에서 종료가 다시 멈췄다. 이번엔 `CancelIoEx`가 성공(TRUE)했는데도 `GetOverlappedResult`가 풀리지 않았다. 덤프를 다시 봤다.

```
pMessage[0].ymsg.ov: Internal 0x103(STATUS_PENDING), hEvent NULL
dwThreadCount 1, hThreads[0] NULL(이벤트 스레드는 이미 종료, 스레드 목록에도 없음)
남은 스레드 8개 중 필터 포트를 쓰는 스레드 없음
```

이번엔 `CancelIoEx`가 실제로 성공했다. 문제는 그 다음이었다. 포트가 IOCP(I/O Completion Port)에 묶여 있으면, 취소된 I/O의 완료 통지는 `GetOverlappedResult`로 직접 받을 수 없다. 그 통지는 완료 포트의 큐에 쌓이고, 누군가 `GetQueuedCompletionStatus`로 그 큐에서 꺼내 가야 비로소 `OVERLAPPED.Internal`이 최종 상태로 바뀐다. 이 PC는 완료를 꺼내야 할 이벤트 스레드가 종료 과정에서 먼저 빠져나가 있었다. 꺼낼 사람이 없으니 `Internal`은 영원히 PENDING에 머물렀고, `GetOverlappedResult(..., TRUE)`도 영원히 풀리지 않았다.

같은 구조를 파이프 시험 프로그램으로 재현해 확인했다. 취소 0.5초 뒤 `Internal`은 여전히 0x103이었고, `GetOverlappedResult(TRUE)`는 5초가 넘어도 돌아오지 않았다. 반면 `GetQueuedCompletionStatus`로 완료 포트에서 직접 꺼내면 0ms에 즉시 반환됐다(에러 코드 0xC0000120, 취소된 I/O를 뜻함). `CloseHandle`만 호출해도 걸려 있던 I/O는 0ms에 끝났다.

## 최종 수정 — 기다리지 않는다

`CancelIoEx` 뒤에 `GetOverlappedResult`로 완료를 기다리는 코드 자체를 없앴다. 포트를 닫는 동작은 이 조사 이전(올해 2월)의 코드와 같게 되돌렸다. 완료를 받을 스레드가 이미 없는 상황에서는 기다리지 않고 핸들만 정리하는 것이 맞는 설계였다.

Release 빌드로 반복 정지 시험을 했다.

| 버전 | 횟수 | 결과 |
|---|---|---|
| 수정 전 | 2회 | 2회 모두 60초 넘게 STOP_PENDING (덤프에서 같은 스택 확인) |
| 수정 후 | 30회 | 30회 모두 1.69~10.23초 안에 정상 종료, 덤프 없음 |

## 비슷한 패턴이 또 있었다 — 고치다가 또 한 번 회귀

같은 "취소 뒤 무조건 기다림" 패턴이 클라이언트-서비스 간 파이프 통신 코드(`PIPE_INFO` 소멸자)에도 있었다. 파이프 접속을 기다리다 서비스가 종료되는 경우, 비동기 접속 요청이 동기적으로 실패하면 똑같이 `Internal = PENDING`인 채로 이벤트가 꺼져 있는 상태가 됐다.

이 코드는 `CancelIoEx`가 `ERROR_NOT_FOUND`로 실패하면(걸린 I/O 없음) 기다림을 건너뛰도록 처음 고쳤다. 그런데 이 수정 자체가 또 다른 경합을 만들었다. 접속 완료 처리가 진행 중인 바로 그 순간에 종료가 겹치면, `CancelIoEx`가 NOT_FOUND로 실패해 기다림을 생략하고 객체를 바로 해제해 버릴 수 있었다 — 커널이 그 사이에 이미 해제된 메모리에 결과를 쓸 수 있는 창이 생긴 것이다.

경쟁 상황을 흉내 낸 부하 시험으로 실제로 확인했다. 60초 동안 86만 회 접속을 반복해 그중 5.5만 회가 걸렸는데, 그중 5회에서 "취소는 NOT_FOUND인데 `Internal`은 아직 PENDING"인 상태가 잡혔다. 이 수정은 커밋 전 리뷰 세 차례에서는 걸러지지 않았고, 커밋 뒤 교차검증과 코드 추적에서 각각 따로 발견됐다.

최종 수정은 두 가지였다. 소멸자의 대기는 원래대로(항상 기다림)로 되돌리고, 비동기 접속이 동기적으로 실패하는 경로에 `SetEvent`를 추가해 이벤트를 직접 신호하도록 했다 — 다른 정상 실패 경로(`ERROR_PIPE_CONNECTED`)가 이미 쓰던 방식과 같다. 이 수정은 같은 경쟁 시험을 75만 회 반복해 타임아웃 0건, 걸린 접속 전부가 이벤트 대기 뒤 정상 완료로 돌아오는 것을 확인한 뒤에야 반영했다.

## 마무리

처음 발견한 약점은 실제로 사고를 낸 적이 없는 이론적인 위험이었지만, 그 약점을 "안전하게" 고치는 과정에서 두 번의 실제 서비스 종료 멈춤을 만들었다. 두 번 모두 원인은 비동기 I/O의 완료 통지가 어디로 가는지(이벤트냐, 완료 포트냐)를 가정으로 두고 기다림을 넣은 데 있었다. IOCP에 묶인 핸들은 완료 포트에서 통지를 꺼내 줄 스레드가 있어야만 대기가 풀린다. 그 스레드가 먼저 빠져나간 상태라면, 기다리지 않는 것이 유일하게 안전한 선택이었다.

수정 반영 뒤에는 17대 운영 환경에서 여러 차례 배포를 거치는 동안 종료 멈춤이 재현되지 않았다.

---

*Orange Platform의 Windows 서비스 종료 멈춤 원인 진단 사례 정리입니다.*
