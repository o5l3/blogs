---
title: "wasClean의 함정 — WebSocket 야간 유실과 close code별 재연결·로그아웃 정책"
excerpt: "야간에 WebSocket 한 개가 조용히 사라집니다. 서버 로그엔 에러가 없고 클라이언트 에러 로그에도 흔적이 없습니다. 원인은 클라이언트의 onclose 핸들러가 wasClean === true면 무조건 정상 종료로 가정하기 때문. 서버가 WS_1011로 닫아도 핸드셰이크만 정상이면 wasClean=true가 떨어집니다. close code별 재연결/로그아웃 정책과 인스턴스 가드 패턴을 정리합니다."
category: tech
date: 2026-05-26
author: kim-tigerj
tags: [WebSocket, FastAPI, React, 재연결, 모니터링, 트러블슈팅, Orange Platform]
---

## 배경

매니저 상태 패널의 WebSocket 연결 수 모니터링에서 발견된 현상. 정상 상태에서 매니저는 두 개의 WebSocket을 유지해야 합니다.

| 연결 | URL 예시 | 용도 |
|---|---|---|
| 노드 통계 | `wss://<host>:3181/api/v3/ws/node/stats?token=...&interval=1` | 전체 노드 접속 현황 위젯 |
| 메인 MQTT | `wss://<host>:3183/` | 노드 목록, 실시간 상태 |

야간(장시간 유휴) 후 노드 통계 WebSocket이 1개로 줄어듭니다. 메인 MQTT는 끊기면 로그아웃 처리되므로 야간에도 살아있으면 정상입니다.

## 사실 확인

탭 전환·서버 로그·nginx 프록시·서버 push 주기를 차례로 검증했습니다.

| 확인 항목 | 결과 |
|---|---|
| 현황 탭이 안 보여도 언마운트되지 않음 | 상태 탭 활성화 상태에서도 WebSocket 2개 유지 확인 |
| 서버 로그 에러 | `docker logs rest-api --since 12h`에 `[accepted]`만 존재, disconnect 관련 0건 |
| nginx 프록시 | 3181 포트는 nginx 프록시 없이 uvicorn 직접 연결, timeout 무관 |
| 서버 idle 여부 | `while True` + 1초마다 `send_json` → 네트워크 유휴 종료 아님 |

## 코드 분석

### 클라이언트 — wasClean의 함정

```ts
// nodesConnectionStatus/index.tsx:513
webSocket.current.onclose = (event) => {
  if (event.wasClean) {
    // errorLog(errorData.message, errorData);  ← 주석 처리됨
  } else {
    errorLog(errorData.message, errorData);  // 비정상 끊김만 기록
  }
};
```

**`wasClean === true`일 때 에러 로그를 남기지 않는 것이 함정**입니다. `wasClean`은 close 핸드셰이크가 정상 완료되었는지를 나타낼 뿐, 종료 원인이 정상인지를 나타내지 않습니다. 서버가 `WS_1011`(내부 에러)로 닫아도 close 핸드셰이크가 완료되면 `wasClean === true`이므로 에러가 조용히 묻힙니다.

| 상황 | `event.code` | `wasClean` | 에러 기록 |
|---|---|---|---|
| 클라이언트가 `close()` 호출 (로그아웃 등) | 1005 | true | X |
| 서버 정상 종료 | 1000 | true | X |
| **서버 내부 에러 (WS_1011)** | **1011** | **true** | **X ← 문제** |
| 네트워크 단절 | 1006 | false | O |

### 서버 — 1회 예외로 영구 종료

```python
# rest-api/app/api/v3/node.py:51-75
@router.websocket("/ws/node/stats")
async def websocket_node_stats(websocket, interval, token, redis):
    await websocket.accept()
    try:
        while True:
            stats = await Node.get_stats_count()  # MongoDB 집계
            await websocket.send_json(stats)
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        raise e
```

문제는 두 가지입니다.

- `Node.get_stats_count()`가 예외를 던지면(MongoDB 연결 불안정·타임아웃 등) → WS_1011로 닫고 종료.
- **재시도 없이 1회 예외로 WebSocket 영구 종료**. `raise e`만 있고 명시적 `logger.error` 없음.

### 추정 시나리오

야간에 서버 측 집계 호출 시 일시 예외 발생 → WS_1011로 종료 → 클라이언트는 `wasClean === true`로 수신하여 에러 로그 없이 조용히 종료 → 재연결 없음 → WebSocket 1개로 감소.

## 1차 조치 — close 이력 기록

원인 특정을 위해 WebSocket 종료 시점의 `event.code`, `reason`, `wasClean`, URL, 시각을 기록합니다. 이미 전역으로 모든 WebSocket을 래핑하는 인터셉터가 있으므로, 거기에 close 이벤트 이력만 추가했습니다.

```ts
interface WsCloseRecord {
  url: string;
  code: number;        // 1000=정상, 1005=클라이언트 close(), 1006=비정상, 1011=서버 내부 에러
  reason: string;
  wasClean: boolean;
  timestamp: number;
}
```

다음 재현 시 상태 패널에서 `event.code`만 보면 정확한 원인을 좁힐 수 있습니다.

## 본 조치 — close code별 분기

원인 가설을 유지하면서, **클라이언트가 끊김에 스스로 대응**하도록 정책을 분기했습니다.

| 종료 코드 | 동작 |
|---|---|
| **1006**(네트워크 끊김), **1011**(서버 내부 오류) | 지수 백오프 재연결 (1s → 2s → … → 최대 30s) |
| **1000**(정상), **1005**(코드 없음) | 무동작 |
| 그 외 예상외 코드 + **1008**(인증/정책 위반) | 강제 로그아웃 (`force-sign-out`) |

추가로 다음 두 가드를 넣었습니다.

- **플래핑 방지**: 정상 메시지 수신 시 백오프 시도 횟수 리셋 + 예약된 재연결 취소 → "수락 직후 끊김"이 1초마다 반복되는 무한 루프 차단.
- **인스턴스 가드**: 각 핸들러(`onopen`/`onmessage`/`onerror`/`onclose`)는 "지금도 내가 현재 소켓일 때만" 동작 → **늦게 도착한 옛 소켓 이벤트가 새 연결을 덮어쓰는 것 방지**.
- 빈 host/token이면 연결 시도 안 함(로그아웃 직후 등).

### 로그아웃 시 정리

```ts
// auth/AuthContext.tsx
auth.logout()  // → useNodeStatsStore.getState().reset() 호출

// nodeStats.store.ts reset():
//   재연결 타이머 취소 + 소켓 핸들러 분리 후 종료 + host/token·통계값 초기화
```

→ 로그아웃(특히 MQTT 끊김 강제 로그아웃) 후 node-stats가 옛 토큰으로 좀비 재연결하는 것을 차단합니다.

## 설계 결정 / 원칙

### 메인 MQTT는 끊기면 무조건 로그아웃

메인 MQTT 웹소켓은 node-stats와 별개이며, 끊기면 **재연결하지 않고 로그아웃**합니다.

- 서버가 이상하면 더 붙어봐도 소용없고, 동일 ID 관리자가 다른 곳에서 접속하면 서버가 일부러 끊으므로(중복 세션 차단) 로그아웃이 맞습니다.
- 예외: 최초 연결이 한 번도 성공하지 못한 경우는 로그아웃하지 않습니다 — 실시간은 못 해도 REST API로 이전 데이터 조회·설정 변경은 가능해야 하기 때문(degraded). 별도 ref(`isBeforeConnectedMqttRef`)로 이 케이스를 가립니다.

### 서버 재시작·점검도 로그아웃이 맞다

B2C 서비스가 아니므로 점검 중 서비스를 유지할 필요 없음 → node-stats도 1006/1011 외(서버 재시작 1001 등)는 재연결하지 않고 로그아웃합니다.

### MQTT 로직 자체는 고위험 영역

MQTT 연결/로그아웃 로직은 잘못 수정하면 전체 관리자 로그아웃·세션 문제로 이어지므로 변경 전 충분히 확인. 이번 작업은 node-stats(REST API ws)만 수정했고 MQTT(Mosquitto)는 손대지 않았습니다.

## 핵심 정리

- WebSocket `onclose`에서 `wasClean === true`를 정상 종료로 단정하면 안 됩니다. 반드시 `event.code` 기반으로 분기하세요.
- 1회 예외로 영구 종료되는 서버 + `wasClean=true`로 조용히 묻는 클라이언트가 만나면 "야간에 한 개가 사라진다" 같은 비명시적 회귀가 만들어집니다.
- 재연결 정책을 코드별로 명시하고, **플래핑 방지**와 **인스턴스 가드**를 같이 넣어야 옛 소켓이 새 연결을 덮어쓰는 사고를 피할 수 있습니다.

*Orange Platform 매니저의 야간 WebSocket 유실 원인 분석과 클라이언트 정책 개선 리포트입니다.*
