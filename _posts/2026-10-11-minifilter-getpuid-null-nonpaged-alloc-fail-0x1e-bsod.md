---
title: "메모리 부족일 때 프로세스 생성이 블루스크린을 내던 커널 드라이버 — NULL 버퍼를 확인 없이 읽은 0x1E"
excerpt: "NonPaged 메모리 할당이 실패해 버퍼가 NULL인데도 다음 줄이 그 버퍼를 읽어 0x1E KMODE_EXCEPTION_NOT_HANDLED 블루스크린이 났다. PsGetProcessStartKey가 없는 Windows Server 2016에서만 밟히던 경로를, Driver Verifier 할당 실패 주입으로 재현해 고쳤다."
category: tech
date: 2026-10-11
author: kim-tigerj
tags: [Windows, BSOD, 커널드라이버, 미니필터, DriverVerifier, NonPaged, C++, Orange Platform]
---

## 증상

orange.sys 0.3.1.46이 프로세스가 만들어질 때 블루스크린을 냈다. `0x1E KMODE_EXCEPTION_NOT_HANDLED`, 폴트 지점은 `orange!GetPUID+0x175`(Misc.cpp:311), NULL 포인터 읽기였다.

## 조건

두 가지가 겹쳐야만 밟혔다.

- **커널에 `PsGetProcessStartKey`가 없는 Windows.** 이 함수가 있으면 `GetPUID`가 그 함수로 끝나 문제의 줄까지 오지 않는다. Windows Server 2016(빌드 14393)에 이 함수가 없음을 확인했다.
- **NonPaged 메모리 할당이 실패하는 상황**(메모리 부족).

평상시에는 할당이 실패하지 않으니 드러나지 않고, 구형 커널 + 메모리 고갈이 동시에 성립할 때만 터지는 경로였다.

## 원인

`GetPUID`는 프로세스 식별자를 문자열로 조립하려고 `CWSTRBuffer proc`를 할당한다. 이 할당이 실패하면 버퍼가 NULL이 된다. 뒤이은 `RtlStringCbPrintfW`는 버퍼가 NULL이므로 `0xC000000D`(STATUS_INVALID_PARAMETER)로 돌아오는데, 코드가 이 반환값을 확인하지 않고 다음 줄의 루프에서 그 NULL 버퍼를 읽었다. 커널에서 NULL을 읽으면 그대로 블루스크린이다.

## 발견

OR-2331의 0.3.1.46 안정성 시험에서 잡았다. Windows Server 2016 가상 머신에서 orange.sys에 Driver Verifier를 켜고(standard 플래그 + 저수준 메모리 할당 실패 흉내), 메모리를 가득 채운 채 파일·프로세스 부하를 걸었다. 할당 실패 주입은 이렇게 "평소에는 실패하지 않는" 경로를 강제로 밟게 해, 실제 메모리 부족을 기다리지 않고 재현하게 해 준다.

## 수정

버퍼가 NULL이면 PUID를 0으로 두고 `STATUS_INSUFFICIENT_RESOURCES`로 함수를 끝낸다. 부모 프로세스가 이미 없을 때 0을 주던 기존 처리와 같은 방식이다. 이 함수를 호출하는 쪽은 반환값을 보지 않으므로, PUID가 0이 되는 것 외에 동작 변화는 없다. 드라이버 0.3.1.47로 반영했다.

## 검증

0.3.1.47로 같은 가상 머신에서 같은 시험(메모리 고갈 + 할당 실패 주입 + 파일·프로세스 부하)을 다시 돌려, 더 이상 같은 지점에서 블루스크린이 나지 않는지 확인했다.

---

*Orange Platform 에이전트 커널 미니필터(orange.sys)의 블루스크린 분석 리포트입니다.*
