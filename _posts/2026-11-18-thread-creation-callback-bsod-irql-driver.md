---
title: "아침 부팅 직후 반복된 블루스크린, 원인은 스레드 생성 콜백의 안 쓰는 호출이었다"
excerpt: "쓰지도 않는 부모 프로세스 ID를 얻으려고 스레드가 생길 때마다 커널 호출을 세 번씩 하던 코드가 IRQL_NOT_LESS_OR_EQUAL 블루스크린으로 이어졌다. 크래시 덤프의 심볼 풀이 스택과 드라이버 소스를 맞춰 원인을 좁힌 과정을 정리한다."
category: tech
date: 2026-11-18
author: kim-tigerj
tags: [Windows드라이버, 커널, 블루스크린, IRQL, 크래시분석, Orange Platform]
---

## 증상

한 PC(노트북)에서 모니터링 드라이버(`orange.sys`) 0.3.1.37 버전이 원인으로 지목된 `IRQL_NOT_LESS_OR_EQUAL` 블루스크린이 두 번 있었다. 두 번 모두 아침 부팅 직후에 보고됐다.

이 PC는 5월부터 `ntoskrnl`·`win32kbase`·`win32kfull`이 원인으로 찍히는 IRQL 블루스크린도 거의 매달 두 번씩 있어, 처음에는 하드웨어나 메모리 쪽 가능성도 함께 봐야 하는 PC였다. 다만 이번 두 건은 원인 모듈이 우리 드라이버로 명확히 찍혀 있었다.

덤프 파일 자체는 보관 기간이 지나 서버에서 이미 지워진 상태였다. 분석은 블루스크린 당시 자동으로 남은 분석 결과(스택, 심볼 풀이 결과)로 진행했다.

## 스택

0.3.1.37의 PDB로 풀어낸 스택은 다음과 같았다.

```
orange+0xdfed  → CreateThreadNotifyRoutine+0x39
orange+0x8e71  → GetParentProcessId+0x1f5 → ZwClose → nt!NtClose → … → KeBugCheckEx
```

스레드가 생성될 때 커널이 호출하는 알림 콜백(`CreateThreadNotifyRoutine`) 안에서, 부모 프로세스 ID를 얻는 함수(`GetParentProcessId`)가 `ZwClose`를 거쳐 `NtClose`까지 내려갔다가 그대로 버그체크로 이어졌다.

## 코드 확인

드라이버 소스(`ofilter/Thread.cpp:240`)를 보면 `CreateThreadNotifyRoutine`이 `flag.nThread` 설정값을 확인하기도 전에 `GetParentProcessId()`를 먼저 부르고 있었다. 이 함수 안에서는 스레드가 하나 생길 때마다 `ZwOpenProcess`, `ZwQueryInformationProcess`, `ZwClose`가 매번 호출된다.

문제는 이렇게 얻은 부모 프로세스 ID(PPID)를 그 뒤에서 아무도 쓰지 않는다는 점이다. 코드에는 `UNREFERENCED_PARAMETER(PPID)`라고 그대로 적혀 있었다. 즉 스레드 생성 콜백이라는, 시스템에서 매우 자주 호출되고 제약이 많은 자리에서, 결과를 쓰지도 않는 커널 호출 세 번을 매번 부르고 있었던 셈이다.

이 부분은 0.3.1.37(7월 23일 빌드)부터 지금의 개발 버전(0.3.1.54)까지 바뀐 적이 없다.

## 왜 위험한가

스레드 생성 알림 콜백은 커널이 임의의 문맥에서 호출할 수 있는 자리다. 이런 자리에서 `ZwOpenProcess`류의 호출을 매번 수행하면, 특정 조건(예: 상승된 IRQL, 특정 프로세스 생명주기 타이밍)에서 `IRQL_NOT_LESS_OR_EQUAL`로 이어질 수 있는 호출 경로가 된다. 이번 크래시의 스택이 정확히 이 경로(`GetParentProcessId` → `ZwClose` → `NtClose`)를 가리켰다.

## 조치

쓰지 않는 값을 얻기 위해 콜백마다 커널 호출을 세 번씩 거는 구조 자체가 문제이므로, 다음을 확인한 뒤 수정안을 올리기로 했다.

- 스레드 생성 콜백 문맥에서 `GetParentProcessId`(`ZwOpenProcess`/`ZwQueryInformationProcess`/`ZwClose`)를 부르는 것이 블루스크린을 낼 수 있는 경로인지 코드 차원에서 확정한다
- 같은 파일의 다른 호출 지점(`Thread.cpp:413` 등)에도 같은 위험이 있는지 전수 확인한다
- 고침안을 diff로 올리고, 승인 뒤 반영한다

쓰지 않는 값을 얻기 위한 커널 호출이었던 만큼, 가장 간단한 수정 방향은 이 호출 자체를 제거하는 것이다. 같은 드라이버의 다른 경로에서도 비슷한 패턴의 수정이 이어지고 있다.

---

*Orange Platform 커널 드라이버의 블루스크린 원인 분석 사례입니다.*
