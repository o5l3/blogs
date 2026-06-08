---
title: "Windows 커널 좀비 프로세스 탐지 — EPROCESS 잔존 여부 판정과 PID 재사용 안전성"
excerpt: "프로세스가 종료된 뒤에도 누군가 OpenProcess 핸들을 닫지 않으면 커널의 EPROCESS 구조체가 그대로 남습니다. Agent에서 종료 1분 후 PsLookupProcessByProcessId로 PEPROCESS를 재조회해 좀비 여부를 판정하는 방법, 그리고 좀비 상태일 때 PID 재사용이 차단되는 Windows 내부 규칙을 정리합니다."
category: tech
date: 2026-06-06
author: kim-tigerj
tags: [Windows 커널, EPROCESS, 좀비 프로세스, PsLookupProcessByProcessId, PID 재사용, Orange Platform]
---

## 문제

프로세스가 종료됐는데도 커널 내 프로세스 정보를 담고 있는 거대한(?) 구조체 `EPROCESS`가 메모리에 남아 있는 상태가 있습니다.

이유는 단순합니다 — 누군가 이 프로세스의 정보(`EPROCESS`)를 가리키는 핸들을 열고(`OpenProcess`) **닫지 않았기 때문**입니다. 커널 객체는 참조 카운트로 관리되므로, 마지막 핸들이 닫힐 때까지 객체가 해제되지 않습니다. 이렇게 종료됐지만 커널 구조체가 남아 있는 상태를 흔히 "좀비 프로세스"라고 부릅니다.

## 탐지 아이디어

Agent에서 다음 절차로 좀비 여부를 판정합니다.

- Agent에서 종료된 프로세스 정보를 1분 간 보관 (이미 그렇게 동작 중)
- 1분 후 Kernel로 종료된 프로세스의 `PID + CreateTime` 전송
- `PsLookupProcessByProcessId(PID)`로 `PEPROCESS`를 얻고 `CreateTime` 일치 여부 확인
- `PsGetProcessExitStatus != STATUS_PENDING` 으로 확실히 종료된 상태인지 확인
- 확실히 종료된 프로세스의 `EPROCESS`가 여전히 존재 → **좀비 프로세스**

`CreateTime` 매칭이 중요합니다. PID만 일치한다고 같은 프로세스라고 단정하면 안 됩니다. `CreateTime`까지 일치해야 "그때 그 프로세스의 EPROCESS가 정말로 남아 있다"고 결론낼 수 있습니다.

## 관련 지식 조사

탐지 로직을 설계하면서 자연스럽게 따라붙는 의문들을 정리했습니다.

### Q1. 좀비 상태에서 같은 PID가 재사용될까

> PID = x 인 프로세스가 좀비 상태로 커널에 존재한다. 이후 새 프로세스가 PID = x 인 상태로 또 실행될까?

추론: `PsLookupProcessByProcessId` 함수는 단일 포인터만 리턴합니다. 동일 PID의 EPROCESS가 둘 이상 공존 가능하다면 이 API 자체가 성립할 수 없습니다. 따라서 가정이 맞을 리 없습니다.

조사 결과:

> Windows는 EPROCESS 객체가 완전히 정리될 때까지 PID를 재사용하지 않습니다.
>
> PID 재사용 조건:
> 1. 프로세스 종료
> 2. 모든 핸들(참조) 닫힘
> 3. EPROCESS 객체 메모리 해제

세 조건이 **모두** 충족돼야 PID가 재사용 풀로 돌아갑니다. 좀비 상태에서는 #2 조건이 성립하지 않으므로 PID가 재사용되지 않습니다. 즉, 좀비를 탐지한 시점에 같은 `PID + CreateTime`을 다시 조회하면 그것은 반드시 같은 프로세스의 잔재입니다.

### Q2. Agent가 보관한 핸들도 EPROCESS를 유지시키나

> Agent에서 Kernel을 통해 PID = x 인 프로세스 핸들을 복제해 보관 중이라면, 이 핸들을 유지하는 한 커널에는 해당 EPROCESS가 유지될까?

유지됩니다.

### Q3. 일반 어플리케이션의 핸들도 마찬가지인가

> 일반 어플리케이션에서 PID = x 인 프로세스를 OpenProcess 해서 핸들 `h`로 보관했다. 이후 PID = x 인 프로세스는 종료됐지만 `h`를 닫지 않고 유지한다면 커널에서도 PID = x 인 프로세스의 EPROCESS는 유지될까?

유지됩니다.

핸들의 출처(커널 드라이버, 사용자 어플리케이션)는 무관합니다. 참조 카운트만이 EPROCESS 수명을 결정합니다.

### Q4. 좀비를 일으킨 범인을 찾을 수 있나

좀비 프로세스를 찾았다면, 누가 이 프로세스를 OpenProcess 한 채로 닫지 않았는지가 다음 관심사가 됩니다.

- 커널 단에서 참조한 것은 직접 알기 어렵습니다 (커널 내부 객체 참조 추적은 별도 기제 필요)
- 어플리케이션 단에서 Open한 것은 찾을 수 있습니다 (시스템 전체 핸들 테이블을 열람하면 어떤 프로세스의 핸들 테이블에 해당 EPROCESS를 가리키는 항목이 있는지 추적 가능)

## 핸들 수 vs. 참조 수

`EPROCESS`의 수명을 좌우하는 카운트는 두 종류가 있습니다.

- **핸들 수 (Handle Count)** — 사용자/커널 모드에서 `OpenProcess` 등으로 열린 핸들 개수
- **참조 수 (Reference Count)** — 핸들에 더해 커널 내부에서 직접 포인터를 들고 있는 횟수까지 포함

핸들 수가 0이 돼도 참조 수가 0이 아니면 객체는 해제되지 않습니다. 좀비 탐지·정리 시 "핸들만 닫으면 끝"이 아닐 수 있다는 점을 기억해야 합니다.

## 정리

- 종료 후 1분 그레이스 기간 → `PsLookupProcessByProcessId(PID) + CreateTime` 매칭 → `PsGetProcessExitStatus != STATUS_PENDING` 으로 좀비 판정
- Windows의 PID 재사용 정책 덕분에 `PID + CreateTime` 조합은 좀비 탐지 시점에 충돌 위험이 없음
- 핸들의 출처와 무관하게 모든 참조가 EPROCESS를 살려둠
- 범인 추적은 사용자 모드까지가 한계 — 시스템 전체 핸들 테이블 열람으로 추적 가능

*Orange Platform Agent의 커널 모듈(`orange.sys`) 좀비 프로세스 탐지 기능 설계 노트입니다.*
