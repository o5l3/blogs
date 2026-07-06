---
title: "FastAPI WebSocket 인증 실패 시 1006/1011 무한 재시도 — close-before-accept 함정과 1008 정상 송신"
excerpt: "/v3/ws/node/stats에서 토큰 만료가 발생하면 rest-api가 `AttributeError: 'WebSocket' object has no attribute 'method'`로 2차 폭발합니다. 원인은 (1) WS 라우터가 HTTPException만 catch하고 AppException을 못 잡는 것, (2) 공통 예외 핸들러가 첫 인자를 Request로 가정하는 것, (3) accept 전 close 호출이 HTTP 403으로 떨어져 close frame이 전달되지 않는 것. 세 함정과 그 패턴 fix를 정리합니다."
category: tech
date: 2026-05-26
author: smahn9123
tags: [FastAPI, WebSocket, Starlette, Uvicorn, 예외처리, 트러블슈팅, Orange Platform]
---

## 개요

`/v3/ws/node/stats` WebSocket 연결 시 토큰 누락·만료로 인증 실패가 발생하면 rest-api 컨테이너에서 다음 에러가 찍히며 ASGI 핸들러가 2차 폭발합니다.

```
AttributeError: 'WebSocket' object has no attribute 'method'
```

원인은 세 가지가 겹친 결과입니다.

1. WebSocket 엔드포인트가 `HTTPException`만 catch하고 실제로 던져지는 `AppException`(`UnauthorizedError`)을 못 잡음.
2. 공통 예외 핸들러 `app_exception_handler`가 첫 인자를 `Request`로 가정해 `.method`를 참조.
3. 라우터의 reject 경로가 `accept` 이전에 `close`를 호출 → uvicorn이 HTTP 403으로 핸드셰이크를 거절 → 클라이언트는 close code 없이(브라우저 1006) **무한 재시도 루프**.

## 재현 스택트레이스

```
File "/srv/app/api/v3/node.py", line 66, in websocket_node_stats
    await get_current_manager_by_param(token, redis=redis)
File "/srv/app/core/deps/dependencies.py", line 156, in get_current_manager_by_param
    raise UnauthorizedError()
app.exceptions.auth_exceptions.UnauthorizedError: 인증이 필요합니다.

During handling of the above exception, another exception occurred:
  File "/srv/app/exceptions/error_handlers.py", line 80, in app_exception_handler
    _req.method,
    ^^^^^^^^^^^
AttributeError: 'WebSocket' object has no attribute 'method'
```

## 근본 원인 분석

### 1) 라우터가 잘못된 예외 타입을 catch

```python
# app/api/v3/node.py:66-69 (수정 전)
try:
    await get_current_manager_by_param(token, redis=redis)
except HTTPException:                              # ← 못 잡음
    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    return
```

`get_current_manager_by_param`은 `UnauthorizedError(= AppException ← Exception)`를 던지지만 `HTTPException`이 아니므로 안 잡히고 위로 전파됩니다.

### 2) `app_exception_handler`가 WebSocket을 받지 못함

```python
# app/exceptions/error_handlers.py:67-86 (수정 전)
async def app_exception_handler(_req: Request, exc: Exception):
    ...
    logger.warning(
        "[%d] %s %s — %s: %s%s",
        exc.status_code,
        _req.method,            # ← WebSocket에는 .method 없음
        path_with_query,
        ...
```

`_save_error_to_redis`(line 28의 `request.method`)와 `http_exception_handler`도 동일한 가정을 하고 있어 동일하게 터집니다.

### 3) accept 전 close 호출 시 uvicorn이 HTTP 403으로 거절

uvicorn `websockets_impl.py:278-286` — `application_state=CONNECTING` 상태에서 `websocket.close` ASGI 메시지를 받으면 **HTTP 403 Forbidden으로 처리하고 close frame을 전달하지 않습니다**. 브라우저는 `onclose(code=1006)`를 받습니다.

### 트리거 빈도가 늘어난 배경

다른 작업으로 manager-web의 node-stats WS가 1006/1011 끊김 시 백오프로 자동 재연결하도록 바뀌었고, 토큰이 만료·제거된 상태에서 재연결이 반복되면서 매 시도마다 위 크래시가 찍히기 시작했습니다. 클라이언트 변경 자체가 잘못된 것이 아니라, **클라이언트가 어떻게 행동하든 서버가 크래시하면 안 되는 것**이 본 버그의 본질입니다.

### 영향 범위

`/v3/ws/node/stats` 외에도 인증 의존성을 직접 호출하는 다른 WebSocket 엔드포인트(`/v3/ws/command/{id}`, `/v3/ws/command/{id}/results`, `/v3/ws/health/system`, `/v3/mqtt/subscribe/...`)가 동일 패턴으로 터질 수 있습니다.

사용자 영향: 클라이언트는 1011/abnormal close를 받게 되어 정상 동작에 가깝지만, **서버 로그에 ERROR가 반복 적재되어 모니터링·알람 오탐**이 발생합니다.

## 해결 — 두 단계 커밋

### 커밋 1 — WS 인증 실패 시 예외 핸들러 크래시 수정

| 파일 | 변경 |
|---|---|
| `app/api/v3/node.py` | `except` 절에 `AppException` 추가 → `UnauthorizedError`가 framework로 새지 않음. `AppException` import 추가 |
| `app/exceptions/error_handlers.py` | `_save_error_to_redis` / `app_exception_handler` / `http_exception_handler` 시그니처를 `Request \| WebSocket`으로 확장. WS면 `method="WS"`로 로깅·기록, 안전망으로 `close(1008)` 호출 |

### 커밋 2 — WS 인증 거부 시 accept 후 close(1008) 송신

커밋 1만 적용한 상태에서 클라이언트가 HTTP 403 → `onclose(1006)` 백오프 재시도 루프에 빠지는 부작용이 발견됐습니다.

| 파일 | 변경 |
|---|---|
| `app/api/v3/node.py` | `websocket.accept()`를 auth 체크보다 **앞으로 이동** → 핸드셰이크 완료 후 reject되어 close frame이 1008로 클라이언트에 전달 |
| `app/exceptions/error_handlers.py` | `_ws_safe_close()` 헬퍼 도입. `application_state=CONNECTING`이면 `accept()` 시도 후 `close(code)`, 이미 `DISCONNECTED`면 no-op. accept/close 자체 실패도 swallow (클라이언트 단절 등 정상 시나리오) |

### 패턴 코드 (요약)

```python
# 라우터
@router.websocket("/v3/ws/node/stats")
async def websocket_node_stats(websocket, ...):
    await websocket.accept()                     # ← auth 체크보다 앞으로
    try:
        await get_current_manager_by_param(token, redis=redis)
    except (HTTPException, AppException):        # ← AppException 추가
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    # ... 정상 처리
```

### 동작 비교

| 단계 | 수정 전 | 커밋 1 적용 후 | 커밋 2 적용 후 (최종) |
|---|---|---|---|
| 만료 토큰 → `UnauthorizedError` | 핸들러 `AttributeError` 크래시 | 라우터 자체 catch → `close(1008)` 호출 | 동일 |
| uvicorn 응답 | ASGI 에러로 1006/1011 결과 | accept 전 close → HTTP 403 거절 | accept 후 close → close frame 1008 정상 송신 |
| 브라우저 `onclose` code | 1006 / 1011 | 1006 (close frame 미수신) | **1008** |
| manager-web 동작 | 백오프 재시도 → 무한 루프 | 백오프 재시도 → 무한 루프 | `force-sign-out` → 로그아웃 → 재시도 차단 |

## 검증

### 단위 시나리오 (수동 작성, 임시 검증)

- 원본 `AttributeError` 재현 시도 → 발생하지 않고 `close(1008)` 호출됨.
- `application_state=DISCONNECTED`일 때 헬퍼가 `accept`/`close` 호출 안 함.
- `application_state=CONNECTING`일 때 `accept` → `close(1008)` 순서 보장.
- `application_state=CONNECTED`(라우터가 이미 accept한 후 예외)일 때 `accept` 스킵, `close`만.
- `accept()`가 `RuntimeError`로 실패해도 헬퍼가 swallow 후 `close` 시도.
- `http_exception_handler`도 WS 받을 때 동일 분기.
- HTTP(Request) 경로 회귀 없음 — `JSONResponse(401)` 정상 반환.

### ASGI 시퀀스 검증

수정 후 송신되는 ASGI 메시지:

```python
{'type': 'websocket.accept', 'subprotocol': None, 'headers': []}
{'type': 'websocket.close', 'code': 1008, 'reason': ''}
```

### 회귀

`pytest tests/` → 121/121 PASS.

### 실서버 로그

```
INFO:     <internal-ip>:58767 - "WebSocket /api/v3/ws/node/stats?token=...&interval=1" [accepted]
INFO:     connection open
INFO:     connection closed
```

수정 전의 `403 Forbidden` / `connection rejected`가 사라지고 정상 `accept → close` 흐름으로 전환됐습니다.

## 후속 작업 후보

다음은 동일한 근본 원인을 가지지만 안전망(`app_exception_handler`의 WS 분기)으로 커버되므로 즉시 위험은 아닙니다. 후속 정리 권장.

| 파일 | 패턴 | 영향 |
|---|---|---|
| `app/api/v3/mqtt.py:77` | `except HTTPException` + close-before-accept | `AppException` 누락 + 클라이언트 1006 재시도 |
| `app/api/v3/command.py:333` | 동일 | 동일 |
| `app/api/v3/health.py:154` | 동일 | 동일 |
| `app/exceptions/error_handlers.py` `general_server_exception_handler` | WebSocket 인자 받을 때 무조건 `JSONResponse` 반환 | WS scope에서 잘못된 응답 송신 시도 |

> 후속 정리 후 추가 확인: WS scope의 일반 `Exception`은 Starlette `ServerErrorMiddleware`가 HTTP scope에서만 동작하기 때문에 `general_server_exception_handler`에 **도달하지 않습니다**. WS는 uvicorn 기본 `close(1011)`로 처리됩니다. 우리 핸들러로 잡고 싶다면 별도 ASGI 미들웨어가 필요합니다.

## 핵심 정리

- WebSocket 라우터에서는 **`accept()`를 auth 체크보다 먼저** 호출해야 reject 시 `close frame`이 정상적으로 클라이언트에 전달됩니다.
- 인증 의존성이 `HTTPException`이 아닌 도메인 예외(`AppException`)를 던진다면 `except` 절에 반드시 같이 적어야 합니다.
- 공통 예외 핸들러는 첫 인자를 `Request | WebSocket`로 받도록 시그니처를 열어두세요. `.method` 같은 HTTP 전용 필드를 무조건 참조하면 WS 경로에서 2차 폭발이 납니다.
- 클라이언트가 1006/1011 백오프를 켜는 순간, **서버 안정성 기준선이 한 단계 올라갑니다**. 한 번의 인증 거부도 무한 재시도로 증폭되기 때문입니다.

*Orange Platform REST API의 WebSocket 인증 거부 경로를 안정화한 버그 분석·수정 리포트입니다.*
