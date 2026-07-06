---
title: "Mosquitto에서 무관 노드가 끊긴다 — OpenSSL 3.0.x record layer 버그(0A000123)와 abrupt close 우회"
excerpt: "위젯 하나를 닫았을 뿐인데 무관한 다른 노드가 매니저 그리드에서 사라집니다. 추적해 보면 broker 로그에 OpenSSL 에러 0A000123이 떨어지고, 끊긴 노드 타임스탬프와 1:1로 일치합니다. 크롬 148 업데이트가 노출시킨 OpenSSL 3.0.x record layer 버그를 분석하고, 클라이언트 측 abrupt close로 즉시 회피하는 방법을 정리합니다."
category: tech
date: 2026-05-25
author: kim-tigerj
tags: [Mosquitto, OpenSSL, MQTT, WebSocket, TLS, Chrome, 트러블슈팅, Orange Platform]
---

## 배경

매니저 UI에서 nodeInfo 위젯(노드 상세 팝업)을 열고 닫을 때마다 **그 팝업과 무관한 다른 온라인 노드**가 그리드에서 사라지는 현상이 보고됐습니다. 사라지는 노드는 매번 다르고 비결정적이며, 약 60초 후 스스로 재접속됩니다. 위젯을 반복해서 여닫으면 그때마다 다른 노드가 하나씩 사라집니다.

증상의 원인은 위젯이 글로벌 MQTT 외에 별도의 보조(aux) MQTT 연결을 만들고, 위젯을 닫을 때 그 연결을 graceful close하는 데 있었습니다.

## 1차 가설 검증 — 라이브러리·구조가 아니다

처음에는 클라이언트 측 mqtt.js 사용 패턴을 의심했습니다. 두 가지 시도가 모두 실패했습니다.

### 시도 A — 글로벌 MQTT 모듈이 보조 연결을 단독 관리

위젯이 mqtt.js를 여러 곳에서 쓴 것이 원인이라는 가설로, 글로벌 모듈이 노드별 will 연결을 connect/graceful end() 일임하도록 일원화했습니다.

**결과**: 크롬에서 재발. connection close 행위 자체가 트리거이므로 누가 관리하든 무관.

### 시도 B — mqtt.js 5.10.2 → 5.15.1 업그레이드

라이브러리 변수만 격리한 채 라이브러리만 올렸습니다.

**결과**:

| 환경 | 결과 |
|---|---|
| 엣지 148.0.3967.70 + 운영 매니저 | 정상 (재현 안 됨) |
| 크롬 148.0.7778.180 + 로컬 dev 매니저 | 재발 |

둘 다 동일 broker에 접속 — **변수는 broker가 아니라 브라우저**였습니다. 클라이언트 라이브러리 버그가 아님이 확정됐습니다.

## 근본 원인 — broker OpenSSL 3.0.x record layer 버그

broker 로그를 디버그 모드로 띄워(`log_type all` + `connection_messages true`) 크롬으로 graceful close 상태에서 재현했습니다.

### broker 디버그 로그

```
0A000126 (unexpected eof): 0건 → 사전 적용된 shim이 막고 있음
0A000123 (application data after close notify): 6건
  → 6건 전부 직후 무관 에이전트가 끊김 (타임스탬프 1:1 일치)
  → 매니저 UI 온라인 노드 수 감소로 직접 확인
  → ~60초 후 재연결 복귀
```

### 원인과 브라우저 차이

0A000123은 사전 검토 보고서가 "운영 로그상 0건이라 100% 커버"라고 적었던 잔여 경로입니다. **크롬 148의 WebSocket close 시퀀스가 이 경로를 유발**합니다 — 크롬 148 업데이트로 0건이 아니게 됐습니다.

- 크롬은 잘못이 없습니다. close_notify 생략·직후 데이터 전송은 RFC 허용 범위이며, 정상 서버(OpenSSL 3.2+)에선 무해합니다.
- 버그는 OpenSSL 3.0.x record layer의 corruption이 **무관한 다른 SSL 연결로 전파**되는 것입니다(openssl#19854).
- 엣지는 "안전"이 아니라 빌드 차이로 "아직 안 터지는" 것일 뿐입니다.

### 기존 shim을 확장할 수 없는 이유

기존에는 `SSL_OP_IGNORE_UNEXPECTED_EOF`를 주입하는 shim으로 0126만 흡수하고 있었습니다. 이 옵션은 0126 전용이고, **0123을 무시하는 `SSL_OP` 옵션은 OpenSSL 3.0.13에 존재하지 않습니다**. shim은 옵션 주입 방식이라 끌 옵션이 없으면 확장할 수 없습니다.

## 단기 우회안 — aux 연결 abrupt close

graceful close가 0123을 트리거하는 것이 핵심이므로, will 보조 연결을 **abrupt close**로 전환합니다.

| close 방식 | broker가 보는 에러 | shim 커버 | 결과 |
|---|---|---|---|
| `graceful end()` | 0A000123 (close_notify 후 데이터) | 미커버 | 무관 노드 끊김 |
| `abrupt end(true)` = `stream.destroy()` | 0A000126 (unexpected eof) | 커버 | 안전 |

abrupt close는 close_notify를 생략하므로 0123이 원천 불가능하고, 대신 발생하는 0126은 기존 shim이 흡수합니다. **shim 미커버 0123을 shim 커버 0126으로 전환**하는 것입니다. 동시에 abrupt close가 broker의 WILL을 즉시(~1ms) 발사시켜 통지 역할도 수행합니다.

### 변경 (manager-web 2곳)

```ts
// components/dashboard/Mqtt.tsx — aux-disconnect 경로
// Before:
entry.client.end();
// After:
entry.client.end(true);  // abrupt close (stream.destroy)
```

```ts
// components/widgets/nodeInfo/WidgetMqtt.tsx — unmount 경로
// 명시 publish(cause:'unmount') 제거 → WILL로 일원화
// (agent STATUS 핸들러는 cause 필드를 읽지 않으므로 unmount/WILL 동일 처리)
```

agent 측 변경 없음. 두 곳 모두 향후 잘못된 graceful 복귀를 막기 위한 **상세 경고 주석 + 비활성 publish 백업 코드**를 박아 둡니다.

## 실측 검증 (크롬 148.0.7778.180, 위젯 10회+ 반복 여닫이)

| 지표 | 우회 전 (graceful) | 우회 후 (abrupt) |
|---|---|---|
| 0A000123 (broker 로그) | 6건 → 노드 끊김 | 0건 |
| 0A000126 | (해당 없음) | 0건 (shim 흡수, 로그 미기록) |
| agent Protocol error drop | 발생 | 0건 |
| 매니저 UI 노드 사라짐 | 있음 | 없음 |
| broker 소켓 CLOSE-WAIT 누적 | — | 0건 (ESTAB baseline 동일) |

aux 보조 연결은 정상 connect → CONNACK → close 동작. CLOSE-WAIT 누적 우려는 기우로 확정됐습니다(broker가 끊김 즉시 정리).

## 트레이드오프

모든 위젯 종료가 broker 입장에선 abrupt(WILL)로 도착 → 로그에서 정상 닫기 vs 비정상 죽음 구분 불가. 단 매니저의 위젯 종료는 broker 전체 연결 해제 중 극소수(대부분 broker-agent 끊김)라 진단성 영향은 미미하며, agent 동작·통지 속도엔 전혀 영향 없습니다.

## 근본 처방 (예정) — broker OpenSSL 교체

우회안은 즉효지만 record layer 버그 자체는 잔존하므로, 다른 브라우저·다른 에러 경로로 재발할 여지가 있습니다. 최종적으로는 mosquitto의 OpenSSL을 교체해야 합니다.

| 옵션 | 비고 |
|---|---|
| OpenSSL **3.2+ 업그레이드** (권장 3.4+) | 3.2.0 record layer refactor에서 corruption fix, 보안 패치 지속 |
| OpenSSL **1.1.1 다운그레이드** | 0123/0126을 에러로 분류하지 않고 버그 코드 자체가 없음. 단 EOL(2023-09)로 보안 패치 부재 |

둘 다 mosquitto만 격리하며 OS 업그레이드는 불필요합니다(호스트 Ubuntu 24.04·시스템 OpenSSL 그대로). eclipse-mosquitto 최신 Docker(alpine = OpenSSL 3.x) 또는 `/opt` 커스텀 OpenSSL + mosquitto만 `LD_LIBRARY_PATH` 링크.

OpenSSL 교체 후에는 abrupt 우회를 걷어내고 graceful close + 명시 publish의 정상 설계로 복귀할 수 있습니다.

## 유지보수 시 주의 — 종료 통지 코드를 함부로 고치지 말 것

위 두 곳을 graceful close(`end()`)로 되돌리면 다음 두 문제가 **컴파일·런타임 에러 없이 조용히 동시 발생**합니다.

- 0A000123 재발 → broker OpenSSL 3.0.x 버그로 무관한 다른 노드 연결이 끊김.
- WILL 미발사 → 통지 누락 → agent가 nodeInfo 전용 패킷을 계속 보내 부하 누적.

"graceful이 정상적인 종료"라는 단순한 웹 개발 상식으로 고치기 쉬운 함정이라, 두 파일 모두에 경고 주석을 박아 두었습니다. 근본 해결(broker OpenSSL 교체) 전까지 abrupt close 유지는 필수입니다.

또한 `set.STATUS offline` 신호는 위젯이 열렸을 때 Agent가 발생시키는 추가 실시간 데이터(상세 detect / process / system 등)를 멈추는 **유일한 신호**입니다. 이 신호가 없으면 위젯을 여닫을수록 Agent 부하가 누적·증가하며, 엔드포인트(고객 PC) 실시간 부하와 직결되므로 절대 비활성화해서는 안 됩니다.

*Orange Platform 매니저 UI에서 발생한 broker 끊김 현상을 추적·해결한 분석 리포트입니다.*
