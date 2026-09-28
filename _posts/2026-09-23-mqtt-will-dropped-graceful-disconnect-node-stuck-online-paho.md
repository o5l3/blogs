---
title: "정상 종료인데 MQTT WILL이 폐기돼 노드가 online으로 굳는다 — paho 이유코드와 재인증 중 끊김"
excerpt: "에이전트가 서버에 다시 등록하는 도중 접속을 끊으면, MQTT CONNECT가 아직 진행 중이라 offline을 보내지 못한 채 끊긴다. 기다리는 사이 접속이 끝나 online이 나가고, 마지막에 MQTTAsync_destroy가 이유코드 0(정상 종료)으로 끊어 브로커가 WILL을 버린다. 서버에는 online만 남는다. paho 소스와 브로커 실험으로 원인을 좁힌 과정을 정리한다."
category: tech
date: 2026-09-23
author: kim-tigerj
tags: [MQTT, paho, WILL, mosquitto, 이유코드, 노드상태, C++, Orange Platform]
---

## 요약

에이전트가 서버에 다시 등록하는 도중 `DisconnectFromServer`가 불리면, 그 순간 MQTT 접속(CONNECT)이 아직 진행 중이라 offline을 보내지 않고 끊는다. 기다리는 사이 접속이 끝나 online이 나가고, 마지막에 `MQTTAsync_destroy`가 이유코드 0(정상 종료)으로 끊어 브로커가 WILL을 버린다. 서버에는 online만 남는다.

운영 서버에서 6일간(09-13~09-18) 27건, 노드 7대가 이렇게 굳었다. 가장 길게는 15.4시간, 이 건은 7.8시간이다. 에이전트가 다시 붙기 전까지 풀리지 않는다.

## 현상

에이전트 로그와 브로커 로그를 맞춘 시간표다.

| 시각 | 내용 |
|------|------|
| 10:38:03.301 | IP_CHANGED_EVENT → 재등록 시작 |
| 10:38:04.288 | POST /api/v3/node 200 (문서는 offline으로 씀) |
| 10:38:04.365 | DisconnectFromServer(POST) → ConnectToServer |
| 10:38:04.367 | MQTTAsync_connect 발행 (bConnecting = true) |
| 10:38:04.379 | DisconnectFromServer(REGISTER)가 12ms 뒤 끼어듦. IsConnected() = false라 offline 발행 생략, MQTTAsync_disconnect는 rc -3(미연결) |
| 10:38:04.952 | ON_CONNECT → online 발행 (서버에 남는 online) |
| 10:38:05.041 | MQTTAsync_destroy → 이유코드 0으로 DISCONNECT → 브로커 로그 `disconnected.`, WILL 없음 |
| 10:38:05.888 | 절전 진입. 이후 재접속 없음 |

브로커 로그 문구의 뜻(mosquitto 실측, 평문·TLS 동일):

| 문구 | 뜻 | WILL |
|------|-----|------|
| `disconnected.` | 정상 DISCONNECT 패킷 수신 | 발행 안 함 |
| `disconnected: connection closed by client.` | 소켓 사망 | 발행 |

## 원인

두 가지가 겹친다.

**끊는 쪽** — `CServer2.cpp`의 `DisconnectFromServer`가 같은 함수 안에서 「연결 여부」 판단을 뒤집는다.

- `IsConnected()` — CONNECT 진행 중이라 false → `SendStatus(offline)` 건너뜀
- `Disconnect()` → `MQTTAsync_disconnect` rc -3, 패킷 안 나감
- `IsPending()` 대기 — 이 사이 접속 완료, online 발행
- `MQTTAsync_destroy` → paho `closeSession(MQTTREASONCODE_SUCCESS)` → 연결돼 있으니 이유코드 0 DISCONNECT 전송 → 브로커가 WILL 폐기

노드를 offline으로 만들 세 수단이 모두 막힌다: 에이전트 offline(생략), WILL(폐기), keepalive 초과(깨끗이 닫혀 감시할 연결 없음).

**끊으라고 하는 쪽** — 접속을 시작하는 것은 ManagerThread 하나뿐인데, 그 루프가 자기가 띄운 접속을 같은 반복에서 끊는다. SETTINGS 분기에 `continue`가 없어 루프 하단으로 내려오고, 거기서 `IsConnected()`가 false(CONNACK 전)라 5분 넘게 못 붙어 있었으면 `LONG_DISCONNECTION`으로 재등록을 걸고, 그 재등록이 `DisconnectFromServer("REGISTER")`를 부른다. 판정은 최대 22ms, TLS 핸드셰이크는 최소 29ms라 조건이 걸리면 반드시 일어난다. 로그 전수(09-02~09-18): 접속 210회 중 31회(15%). 28회는 바로 뒤 재시도가 살아나 티가 안 났고, 3회는 재시도가 오지 못해 굳었다.

다만 「접속 중에 끊으라는 요청」 자체는 막을 대상이 아니다. 에이전트는 멀티스레드라 IP 변경·SUSPEND·서버 응답 등 다른 경로에서도 같은 순서가 나온다. 그래서 끊는 쪽이 어느 시점에 불리든 올바르게 처리하는 것이 먼저고, Manager 루프는 자기가 띄운 접속을 자기가 끊지 않게만 한다.

## 조치

| 위치 | 내용 |
|------|------|
| `CServer2.cpp` DisconnectFromServer | 진입 시 bConnecting이면 최대 3초 결과를 기다린 뒤 IsConnected 판단 |
| 같은 함수 | destroy 직전 IsConnected를 다시 보고, 연결돼 있으면 offline 발행 → bSending 대기 → Disconnect → IsPending 대기 |
| `CServer2.cpp` Disconnect | `disconnect.opts.reasonCode = MQTTREASONCODE_DISCONNECT_WITH_WILL_MESSAGE(4)`. 정상 종료라도 브로커가 WILL을 발행 |
| paho.mqtt.c `MQTTAsync_destroy` | `closeSession` 이유코드 SUCCESS → DISCONNECT_WITH_WILL_MESSAGE (벤더 패치) |
| `CServer2.h` | `IsConnecting()` 추가 — CONNECT를 띄우고 CONNACK를 기다리는 중인지. IsConnected() 자체는 그대로 |
| `CAgentHelper3.Manager.cpp` 루프 하단 | IsConnecting()이면 LONG_DISCONNECTION 판정을 하지 않음. 접속이 실패하면 다음 틱부터 예전 판정 그대로 |
| DisconnectFromServer(종료 시) | `IsAgentShutdown()`이면 대기를 건너뜀. 서비스 정지를 미루지 않기 위한 것. 서버 offline은 이유코드 4 WILL이 대신함 |

이유코드 4는 브로커에서 실측했다. 정상 DISCONNECT(로그 `disconnected.`)인데 WILL `{status: offline, cause: WILL}`이 발행된다.

부수 효과: 정상 종료 때 offline이 두 번(자체 발행 + WILL) 간다. status 서비스는 `status == online`인 문서만 바꾸므로 두 번째는 갱신이 없고, WILL 알림만 한 번 더 나갈 수 있다.

## 증거 — 반영본 node 문서 (개인정보 제외 발췌)

에이전트가 다시 붙으면 서버 서비스가 덮으므로 그 전에 떠 둔 것이다. 재접속 전 상태 그대로다.

```
{
  "status": "online",
  "ticket":  "6d5a7689-…",
  "ticketb": "9d4560e8-…",
  "guid":    "1-8480ce83-…",
  "@restapi": [
    "POST", "2026-09-18T01:38:04",
    "cause = CAgentHelper3::ApplySettings",
    "status = online",
    "agent sent: ticket='9d4560e8-…', ticket2='6d5a7689-…'",
    "matching: ticket='9d4560e8-…', guid='1-8480ce83-…'",
    "FOUND by ticket",
    "UPDATE(POST) updated:True"
  ],
  "@status": {
    "status": "online",
    "updated": "2026-09-18T01:38:05"
  }
}
```

## 서버 안전장치

브로커의 끊김 사실만으로 offline을 내리는 별도 안전망(OR-1837)이 최종 보루다. 설계 시 주의할 점: 사유 없는 `disconnected.`를 제외 목록에 넣지 말 것. 이번 27건이 전부 그 문구다. MQTT client id에 `node-` 접두사를 붙이는 항목은 이미 적용돼 있다.

## 관련 정정

앞선 조사(OR-1828)에서 세운 「offline 발행이 생략돼도 WILL이 대신한다」는 전제는 이번에 무효로 확인됐다. 정상 종료 경로에서는 paho가 이유코드 0으로 끊어 WILL 자체가 폐기되기 때문이다.

---

*Orange Platform 에이전트의 MQTT 종료 경로에서 발견한 노드 상태 고착 문제 분석 리포트입니다.*
