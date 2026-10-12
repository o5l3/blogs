---
title: "미니필터가 FAST_MUTEX를 쥔 채 돌아와 터진 0x4A 블루스크린 — __leave 예외 경로의 락 누수"
excerpt: "메모리 부족으로 경로 문자열 할당에 실패하자 커널 미니필터가 테이블 락(FAST_MUTEX)을 놓지 않고 IRQL 1인 채로 사용자 모드로 돌아갔다. IRQL_GT_ZERO_AT_SYSTEM_SERVICE(0x4A) 덤프에서 소유 스레드를 짚고, __finally에서 락을 놓도록 고친 과정을 정리한다."
category: tech
date: 2026-10-06
author: kim-tigerj
tags: [Windows, BSOD, 커널드라이버, 미니필터, FAST_MUTEX, IRQL, C++, Orange Platform]
---

## 증상

2026-09-14 개발 PC에서 블루스크린 `0x4A IRQL_GT_ZERO_AT_SYSTEM_SERVICE`가 났다. `PerfWatson2.exe`의 `NtCreateFile` 시스템 콜이 IRQL 1(APC_LEVEL)인 채로 사용자 모드로 돌아가려 하자 커널이 정지시킨 것이다. 시스템 콜은 PASSIVE_LEVEL(IRQL 0)로 돌아와야 한다. IRQL이 올라간 채로 돌아왔다는 것은, 누군가 IRQL을 올리는 동기화 객체를 잡고 놓지 않았다는 뜻이다.

## 원인

`CFileTable::Add`가 테이블 락(FAST_MUTEX)을 잡는다. FAST_MUTEX를 획득하면 IRQL이 APC_LEVEL로 올라간다. 이 함수는 경로 문자열 할당에 실패하면 `__leave`로 본문을 빠져나가는데, `Unlock`이 정상 경로에만 있고 `__finally` 블록에는 없었다. 그래서 할당 실패로 `__leave`하면 락을 쥔 채, 즉 IRQL 1인 채로 함수가 반환됐다.

```
AllocateUnicodeString() 실패  →  Lock()을 건 채로 __leave  →  Unlock()이 호출되지 않은 채 리턴
```

`CRegTable::Add`도 같은 구조였다. 레지스트리 경로와 값 이름을 각각 할당하는 두 곳에서 똑같이 락을 쥔 채 빠져나갈 수 있었다.

이 결함이 평소에 드러나지 않은 이유는 할당이 거의 실패하지 않기 때문이다. 부하지수 개발 과정에서 메모리 부족 상태를 극한으로 유지하자 `AllocateUnicodeString()`이 실패하기 시작했고, 그제야 락 누수 경로가 밟혔다.

## 덤프 근거

전체 메모리 덤프에서 orange.sys 전역 FAST_MUTEX를 짚었다.

| 항목 | 값 |
|------|------|
| FAST_MUTEX Owner | 크래시를 낸 스레드 |
| Count | 0 (잠긴 상태) |
| OldIrql | 0 (락을 잡기 전 IRQL이 PASSIVE였음) |

소유자가 크래시 스레드 자신이고, 그 스레드가 IRQL 1인 채로 시스템 콜 복귀 지점에 도달했다는 것이 들어맞았다.

## 함께 드러난 문제: 언로드 뒤 옛 등록 잔존

같은 덤프에서 Filter Manager에 orange.driver가 두 번 등록되어 있었다. 하나는 이미 언로드된 옛 orange.sys의 등록(ZOMBIED)이었다. 옛 서버 포트(`orange_event`)에 붙은 클라이언트 연결 핸들 하나가 닫히지 않아, 연결 → 서버 포트 → 필터 순으로 참조가 남아 필터 객체가 해제되지 못한 것이다. 그 핸들에만 Protected(닫기 금지) 속성이 붙어 있었다. 언로드 코드가 클라이언트 포트 포인터를 NULL로만 만들고 `FltCloseClientPort`를 부르지 않은 탓이었다.

## 수정

`CFileTable::Add`와 `CRegTable::Add`에서 락 해제를 `__finally` 블록으로 옮겨, 정상 경로든 `__leave`든 반드시 `Unlock`이 불리도록 했다. 커널 코드에서 IRQL을 올리는 락은 획득과 해제를 예외 경로까지 묶어야 한다는 원칙을, 구조적 예외 처리(`__try`/`__finally`)로 강제한 셈이다.

---

*Orange Platform 에이전트 커널 미니필터(orange.sys)의 블루스크린 분석 리포트입니다.*
