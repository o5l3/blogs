---
title: "Windows 커널 드라이버 MS 서명(Attestation) 받기 — 빌드부터 Partner Center 제출까지"
excerpt: "Windows 10/11에서 커널 드라이버를 정식 로드하려면 Microsoft의 서명이 필요합니다. INF DriverVer·버전 리소스 수정, Release 빌드 시 카탈로그(.cat) SHA-256 다이제스트 검증, .cab 생성, Partner Center(Hardware) 제출까지의 절차를 정리합니다."
category: tech
date: 2026-03-25
author: wychoi-orangelabs
tags: [Windows, 커널드라이버, 코드서명, PartnerCenter, Attestation, 빌드]
---

Windows 10/11은 커널 모드 드라이버(.sys)를 로드할 때 Microsoft의 서명을 요구합니다. 자체 EV 코드서명만으로는 부족하고, **Partner Center를 통한 Microsoft Attestation 서명**을 받아야 합니다. 절차를 단계별로 정리합니다.

## 1. 프로젝트 빌드

### 1.1 INF 수정
드라이버 INF의 `DriverVer`를 `mm/dd/yyyy,x.x.x.x` 형식으로, 빌드 시점 날짜·버전으로 맞춥니다.

```
DriverVer = 03/25/2026,0.3.0.9
```

### 1.2 버전 리소스 수정
`.rc`의 `VS_VERSION_INFO` → `FILEVERSION`을 INF와 일치시킵니다.

### 1.3 Release 빌드 + 카탈로그 다이제스트 검증
빌드 후 카탈로그(.cat)가 INF·SYS의 SHA-256 다이제스트를 올바르게 포함하는지 검증합니다. 빌드 스크립트가 마지막에 `[PASS]`를 출력해야 성공입니다.

```
[EVIDENCE] Computed catalog SHA-256 digests:
  - INF(.inf): 6c03f253...0768951c
  - SYS(.sys): 1f4cf321...24ffb721
[EVIDENCE] INF digest found at offset 0x2c1
[EVIDENCE] SYS digest found at offset 0x7c
[EVIDENCE] UTF-16LE '<driver>.inf' present ... (distance to digest: 143 bytes)
[PASS] CAT includes correct catalog digests for INF and SYS
```

> 카탈로그가 INF·SYS의 실제 다이제스트를 담고 있어야 서명이 유효합니다. 빌드 산출물과 .cat의 다이제스트가 어긋나면 제출 단계에서 거부됩니다.

## 2. .cab 생성

빌드 결과물(드라이버 x64)을 지정 위치로 복사한 뒤 cab 생성 스크립트를 실행합니다. EV 서명 클라이언트가 설치돼 있으면 서명 암호를 요구하며, 성공 시 `<driver>.x64.[version].cab`가 생성됩니다.

## 3. Microsoft 서명 신청 (Partner Center)

1. [Partner Center](https://partner.microsoft.com/) 접속
2. **Workspaces → Hardware**
3. **Submit new hardware**
4. 2단계에서 만든 `.cab` 파일을 드래그&드롭
5. Product name 입력
6. **Requested Signatures**: 대상 OS 선택 (예: Windows 10 Client x64). 불필요한 항목은 선택하지 않음
7. **Submit**

제출이 승인되면 Microsoft가 서명한 드라이버 패키지를 내려받아 배포에 사용합니다.

## 정리

커널 드라이버 서명의 핵심은 **(1) INF/버전 정합 → (2) 카탈로그 다이제스트가 실제 INF·SYS와 일치 → (3) .cab 제출**의 사슬이 끊기지 않는 것입니다. 빌드 단계에서 카탈로그 다이제스트를 자동 검증(`[PASS]`)해 두면, Partner Center 제출 후 거부로 시간을 버리는 일을 막을 수 있습니다.

---

*Orange The Client 드라이버 빌드·서명 절차를 정리한 기술 노트입니다.*
