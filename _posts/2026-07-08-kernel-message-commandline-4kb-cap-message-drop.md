---
title: "긴 커맨드라인이 프로세스 이벤트를 통째로 삼킨다 — 커널 메시지 4KB 상한으로 12KB 드롭 막기"
excerpt: "커맨드라인이 긴 프로세스의 커널 메시지가 MAX_FILTER_MESSAGE_SIZE(12KB)를 초과해 통째로 드롭되던 문제를, 추가 메모리 할당 없이 UNICODE_STRING view로 커맨드라인만 4KB로 잘라 해결한 커널 드라이버 구현 기록."
category: tech
date: 2026-07-08
author: kim-tigerj
tags: [커널 드라이버, UNICODE_STRING, 메시지 프로토콜, 커맨드라인, 프로세스 이벤트, Windows, Orange Platform]
---

## 배경

커널 드라이버를 테스트하던 중 DebugView에서 아래와 같은 로그를 발견했다.

```
SendMessage nSendDataSize[21572] > MAX_FILTER_MESSAGE_SIZE[12288]
```

에이전트 재시작 시 `Y_COMMAND_GET_PROCESS_LIST` 응답에서, 커맨드라인이 긴 프로세스의 메시지가 `MAX_FILTER_MESSAGE_SIZE`(12KB)를 초과하면 `SendMessage`가 그 메시지를 **통째로 드롭**한다(`ofilter/Message.cpp:283`, 초과 시 return). 그 결과 PID·경로·시간 등 필수 정보까지 담은 프로세스 이벤트가 통째로 유실된다. 실측 커널 로그에서 21,572바이트 메시지가 드롭되는 것을 확인했다.

## 원인

프로세스 메시지의 문자열부는 `ProcPath` + `Command` + `PProcPath` 세 개다.

- 경로 둘(`ProcPath`, `PProcPath`)은 무한정 커지지 않는다.
- 하지만 커맨드라인(`Command`)만 사실상 무제한이다(Windows 상 최대 약 32,767 wchar ≈ 64KB).

즉, 메시지 크기를 좌우하는 것은 사실상 **커맨드라인 하나**다.

## 변경

프로세스 메시지를 빌드할 때 커맨드라인을 4KB로 잘라 메시지 최대 크기를 줄인다. 4KB를 초과하는 커맨드라인을 우리가 굳이 다 보관할 필요가 없다.

- 원본 버퍼를 그대로 가리키되 `Length`만 상한으로 줄인 `UNICODE_STRING` **view**를 쓰므로 추가 메모리 할당이 없다.
- 크기 산정(`GetStringDataSize`)과 복사(`CopyStringData`)에 **동일한 view**를 사용해 할당량과 복사량을 일치시킨다(오버런/미달 없음).
- 버퍼 상수 `MAX_FILTER_MESSAGE_SIZE`는 그대로 유지한다. 버퍼를 키우면 따라오는 배포 스큐(커널·유저 버전 불일치)와 `WORD` 크기 필드의 64KB 천장 리스크를 애초에 만들지 않기 위함이다.
- 기존 드롭 가드(`Message.cpp:283`)는 백스톱으로 존치한다.

## 변경 범위

`ofilter/Message.cpp` 단일 파일:

- 신설: `CapCommand()` 헬퍼 및 `MAX_COMMAND_STRING_SIZE`(4 * 1024) 매크로
- 빌더 A `CreateProcessMessage(subType, pEntry, pOut)`: cap 적용
- 빌더 B `CreateProcessMessage(subType, PID, PPID, …, pCommand, …)`: 동일 적용

핵심 헬퍼:

```cpp
#define MAX_COMMAND_STRING_SIZE   (4 * 1024)   // bytes

static UNICODE_STRING CapCommand(PUNICODE_STRING pSrc)
{
    UNICODE_STRING v = { 0, 0, NULL };
    if (pSrc && pSrc->Buffer && pSrc->Length) {
        USHORT cap = pSrc->Length;
        if (cap > MAX_COMMAND_STRING_SIZE)  cap = MAX_COMMAND_STRING_SIZE;
        cap &= ~1;                 // WCHAR 경계 방어(홀수 Length 대비)
        v.Buffer        = pSrc->Buffer;
        v.Length        = cap;
        v.MaximumLength = cap;
    }
    return v;
}
```

버퍼를 새로 잡지 않고 원본을 가리키는 view의 `Length`만 줄이는 것이 요점이다. 크기 산정과 복사 양쪽에서 같은 view를 쓰므로 "얼마를 잡고 얼마를 복사할지"가 항상 일치한다.

## 리뷰 포인트

- **WCHAR 경계**: `cap &= ~1`로 홀수 `Length`를 방어한다(4096은 이미 짝수지만, 상한이 아닌 원본이 홀수일 때를 대비).
- 두 빌더 모두 커버한다(ProcessStart/Stop/Start2/dummy 경로 포함).
- Codex 교차검증 완료: 설계 정상, `cap &= ~1` 보강 반영.

## 주의 / 잔여

- 커맨드라인 4KB 초과분은 잘린다(매니저 표시 공간상 무의미하여 수용). 필요 시 "잘림" 표시 플래그는 추후 검토.
- `WORD` 크기 필드(`wStringSize`/`wOffset`) 오버플로는 `ProcPath` 경유로 이론상 잔존하나, 실행 이미지 경로가 64KB를 넘는 것은 비현실적이라 별개 사안으로 둔다.
- 레거시 쌍둥이 `yfilter/Message.cpp`는 제품 빌드·런타임 대상이 아니므로 미변경.

*Orange Platform 커널 드라이버의 메시지 드롭 문제를 진단·해결한 구현 리포트입니다.*
