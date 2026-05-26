---
title: "EPROCESS SignatureLevel은 왜 0인가 — Medium IL 프로세스의 MS 서명 판별 한계와 Authenticode 우회"
excerpt: "커널 드라이버에서 Microsoft 서명 프로세스를 필터링하려 SignatureLevel을 읽으면 code.exe·Teams.exe 같은 MS 서명 앱조차 0이 나옵니다. Windows 11 26100에서 신규 프로세스 86개를 실측해 확인한 SE_SIGNING_LEVEL과 Integrity Level의 상관관계, LoadImage 콜백·PsGetProcessSignatureLevel의 한계, 그리고 PE Authenticode에서 서명자 CN을 직접 추출하는 2단계 대안을 정리합니다."
category: tech
date: 2026-05-20
author: wychoi-orangelabs
tags: [Windows, 커널드라이버, 코드서명, Authenticode, SignatureLevel, 보안]
---

## 배경

커널 드라이버에서 Microsoft 서명 프로세스(`Microsoft Corporation`, `Microsoft Windows Publisher` 등)를 필터링하려면, 부하를 줄이기 위해 **파일 이벤트마다가 아니라 프로세스 시작(ProcessNotify) 시점에 1회 판정**하고 결과를 캐시하는 구조가 효율적입니다. 자연스러운 후보는 `EPROCESS->SignatureLevel` 또는 `PsGetProcessSignatureLevel`입니다. 그런데 실측하면 **이 값이 대부분의 일반 앱에서 0**입니다.

## 진단 — 세 가지 발견

### 1. SignatureLevel과 Integrity Level의 상관관계

Windows 11 26100.8493 실측 결과, `EPROCESS->SignatureLevel`은 **모든 프로세스에 채워지지 않습니다.**

| Integrity Level | OS의 CI 강제 검증 | SignatureLevel 채워짐 |
|---|---|---|
| Untrusted / Low / AppContainer | 강제 | YES |
| Medium (일반 user-mode 앱) | 생략 | **NO (영원히 0)** |
| High (UAC elevated) | 생략 | NO |
| System / Protected (PPL) | 강제 | YES |

OS는 Code Integrity 강제 검증을 통과해야 하는 프로세스(PPL·sandbox 등)에만 SignatureLevel을 부여합니다. `code.exe`·`Teams.exe`처럼 **MS 서명을 받은 서드파티 앱이라도 Medium IL이면 영원히 0**입니다. 이는 race나 버그가 아니라 **OS 설계**입니다.

### 2. LoadImage 콜백(PsSetLoadImageNotifyRoutineEx)도 0

Ex 변형으로 등록해 `ImageInfo->ImageSignatureLevel`을 읽어도, Medium IL 대상은 값 자체가 **0**입니다. 코드적으로는 옳지만 실효가 없어, 시그너 전용 LoadImage 콜백 자체를 제거하는 게 낫습니다(매 DLL 로드마다 발사되던 불필요 콜백 비용 제거 + 콜백 슬롯 회수).

### 3. PsGetProcessSignatureLevel 직접 호출도 한계

파일 이벤트 시점에 `PsGetProcessSignatureLevel`을 직접 호출해도 Medium IL은 여전히 0입니다. **드라이버 시작 시 이미 실행 중이던 프로세스(pre-created)**만 정상값을 반환합니다.

> 신규 프로세스 **86개를 실측한 결과 전부 SL=0**으로, SignatureLevel 기반 판별이 신규 프로세스에 무력함이 확인됐습니다.

## 대안 — PE Authenticode CN 직접 추출 (2단계)

SignatureLevel이 0인 영역(Medium/High IL 일반 앱)에 한해, **PE 파일의 임베디드 서명에서 서명자 CN을 직접 추출**해 MS 화이트리스트와 매칭합니다.

```
ProcessNotify (PASSIVE_LEVEL, 프로세스당 1회)
  Stage 1: PsGetProcessSignatureLevel → SignatureLevel
  Stage 2: if SignatureLevel < 8:
              GetProcessIntegrityLevel → IL
              if IL not in (Medium, High): skip      // PPL 등은 Stage1에서 이미 처리
              PE Authenticode에서 서명자 CN 추출
              CN ∈ MS 화이트리스트 ? → bMsSigned = true

파일 이벤트 (캐시 조회만):
  허용 = (SignatureLevel >= 8) || bMsSigned || bSystemBinary || bOrangeBinary
```

**CN 화이트리스트**
- Microsoft Windows
- Microsoft Corporation
- Microsoft Windows Publisher
- Microsoft 3rd Party Application Component

핵심은 **2단 구조**입니다. Stage 1(SignatureLevel)로 PPL·sandbox를 싸게 거르고, 값이 비어 있는(SL<8) 일반 IL 프로세스만 Stage 2(Authenticode CN 파싱)로 확정합니다. CN 매칭은 프로세스 시작 시 1회만 수행해 캐시하고, 이후 파일 이벤트에서는 캐시 조회만 하므로 매 파일 I/O 부하가 없습니다.

## 정리

"이 프로세스가 MS 서명인가?"를 커널에서 판별할 때 `SignatureLevel`만 믿으면 **일반 IL의 MS 서명 앱을 전부 놓칩니다.** Integrity Level을 게이트로 두고, SL이 비어 있는 영역은 **PE Authenticode 서명자 CN**으로 보강하는 2단계 접근이 실효적입니다. Windows의 SignatureLevel은 "보안 검증 대상 프로세스에만 채워지는 값"이라는 설계 전제를 이해하는 것이 출발점입니다.

---

*Orange The Client 드라이버 연구에서 정리한 기술 노트입니다.*
