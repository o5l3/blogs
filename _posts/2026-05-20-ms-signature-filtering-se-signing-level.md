---
title: "EPROCESS SignatureLevel은 왜 0인가 — Medium IL 프로세스의 MS 서명 판별 한계와 우회"
excerpt: "드라이버에서 Microsoft 서명 프로세스를 필터링하려 SignatureLevel을 읽으면 code.exe·Teams.exe 같은 MS 서명 앱조차 0이 나옵니다. Windows 11 26100에서 86개 신규 프로세스를 실측해 확인한 SE_SIGNING_LEVEL과 Integrity Level의 상관관계, 그리고 PE Authenticode에서 서명자 CN을 직접 추출하는 대안을 정리합니다."
category: tech
date: 2026-05-20
author: Orange Labs
tags: [Windows, 커널드라이버, 코드서명, Authenticode, 보안]
---

## 배경

커널 드라이버에서 Microsoft 서명 프로세스(`Microsoft Corporation`, `Microsoft Windows Publisher` 등)를 필터링하려면 프로세스 시작 시점에 1회 판정해 캐시하는 구조가 효율적입니다. 자연스러운 후보는 `EPROCESS->SignatureLevel` 또는 `PsGetProcessSignatureLevel`입니다. 그런데 실측 결과 **이 값이 대부분의 일반 앱에서 0**으로 나옵니다.

## 실측 — SignatureLevel과 Integrity Level의 상관관계

Windows 11 26100.8493에서 확인한 결과, `SignatureLevel`은 **모든 프로세스에 채워지지 않습니다.**

| Integrity Level | OS의 CI 강제 검증 | SignatureLevel 채워짐 |
|---|---|---|
| Untrusted / Low / AppContainer | 강제 | YES |
| Medium (일반 user-mode 앱) | 생략 | **NO (영원히 0)** |
| High (UAC elevated) | 생략 | NO |
| System / Protected (PPL) | 강제 | YES |

OS는 Code Integrity 강제 검증을 통과해야 하는 프로세스(PPL·sandbox 등)에만 SignatureLevel을 부여합니다. `code.exe`·`Teams.exe`처럼 **MS 서명을 받은 서드파티 앱이라도 Medium IL이면 영원히 0**입니다. 이는 race나 버그가 아니라 **OS 설계**입니다. `PsSetLoadImageNotifyRoutineEx`의 `ImageSignatureLevel`도, 파일 이벤트 시점의 `PsGetProcessSignatureLevel` 직접 호출도 Medium IL에선 0입니다. (드라이버 시작 전부터 실행 중이던 프로세스만 정상값을 반환)

신규 프로세스 **86개를 실측한 결과 전부 SL=0**으로, SignatureLevel 기반 판별은 실효가 없음이 확인됐습니다.

## 대안 — PE Authenticode에서 서명자 CN 직접 추출

SignatureLevel이 0인 영역(Medium/High IL 일반 앱)에 한해, **PE 파일의 임베디드 서명에서 서명자 CN을 직접 추출**해 MS 화이트리스트와 매칭합니다.

```
ProcessNotify (PASSIVE_LEVEL, 1회)
  Stage 1: PsGetProcessSignatureLevel → SignatureLevel
  Stage 2: if SL < 8 → IL 확인
              if IL in (Medium, High):
                 PE Authenticode에서 서명자 CN 추출
                 CN ∈ {Microsoft Windows, Microsoft Corporation,
                       Microsoft Windows Publisher,
                       Microsoft 3rd Party Application Component} ?
```

CN 매칭은 프로세스 시작 시점에 1회만 수행하고 결과를 캐시해, 이후 파일 이벤트에서는 캐시 조회만 합니다(부하 최소화). SignatureLevel(Stage 1)로 빠르게 거르고, 0인 것만 Authenticode(Stage 2)로 확정하는 2단 구조입니다.

## 정리

"MS 서명 프로세스인가?"를 커널에서 판별할 때 `SignatureLevel`만 믿으면 일반 IL 앱을 전부 놓칩니다. **IL을 게이트로 두고, SL이 비어 있는 영역은 PE Authenticode CN으로 보강**하는 것이 실효적인 방법입니다.

---

*Orange The Client 드라이버 연구에서 정리한 기술 노트입니다.*
