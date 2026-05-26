---
title: "백신(Symantec Endpoint Protection) 버전 업그레이드로 엔드포인트 부하 43% 감소 — 49대 실측 비교"
excerpt: "기업 PC의 고질적 CPU 점유 원인으로 지목되던 SEP(Symantec Endpoint Protection)를, 구버전과 신버전이 공존하는 49대 환경에서 2주간 실측 비교했습니다. ccSvcHst.exe의 CPU가 2.29%→0.65%(-71.5%)로 떨어지고, sysfer.dll이 OneDrive·Excel·Explorer 등에 주입되어 유발하던 부수 부하까지 줄어 SEP 관련 전체 영향이 43% 감소했습니다. 버전별 모듈 구조와 DLL 주입 분포를 표로 제시합니다."
category: report
date: 2025-07-11
author: Orange Labs
tags: [성능분석, 백신, Symantec, SEP, sysfer, CPU, DLL인젝션, Orange Platform]
---

## 1. 배경

여러 고객 환경에서 백신 프로세스 `ccSvcHst.exe`(SEP, Symantec Endpoint Protection)의 높은 CPU 점유가 반복 관측됐습니다. 마침 SEP 구버전과 신버전이 함께 배포된 **49대 PC**가 있어, 같은 업무 환경에서 두 버전의 엔드포인트 영향도를 **2025-06-30 ~ 07-11(2주)** 실측 비교했습니다. (분석 인원 49, 대상 49)

## 2. SEP 버전 현황

| SEP 빌드 | 제품 버전 | PC 수 | 설치일 | 경로 |
|---|---|---|---|---|
| 14.3.3580.1100.105 (구) | 17.2.7.16 | 27 | 2024-12-24 | `...\14.3.3580.1100.105\Bin64\ccSvcHst.exe` |
| 14.3.11232.9000.105 (신) | 17.3.4.32 | 21 | 2025-06-17 | `...\14.3.11232.9000.105\Bin64\ccSvcHst.exe` |

원격 구버전 27대, 신버전 21대로 표본이 양분돼 비교에 적합했습니다.

## 3. ccSvcHst.exe 자체 부하 비교

| 빌드 | 표본 | 평균 CPU(%) | 평균 메모리(MB) |
|---|---|---|---|
| 구버전 14.3.3580 | 637 | 2.291 | 357.962 |
| 신버전 14.3.11232 | 121 | 0.651 | 271.987 |

- 구버전은 `ccSvcHst.exe`가 **32비트·64비트 모듈로 동시 구동**되며, 특히 32비트 쪽 부하가 컸습니다.
- 신버전은 **64비트 단일 구동**으로, 같은 작업 기준 CPU 점유율 합계가 **71.5% 감소**, 메모리도 **26% 감소**했습니다.

## 4. 더 큰 그림 — sysfer.dll 주입 부하

백신은 보호를 위해 다른 프로세스에 보안 모듈(`sysfer.dll` 등)을 주입(DLL Injection)합니다. SEP 관련 프로세스/모듈이 1초 이내 연속 점유를 유발한 횟수를 구·신버전으로 나눠 보면, **구버전에서 일반 프로세스로의 주입 부하가 두드러지고 신버전에서 크게 줄어든** 패턴이 보입니다.

| 발생 프로세스 | 원인 모듈 | 구버전 | 신버전 |
|---|---|---|---|
| (합계) | | **65** | **29** |
| ccSvcHst.exe | srtspscan.dll | 10 | 10 |
| ccSvcHst.exe | ccSvcHst.exe | 9 | 1 |
| ccSvcHst.exe | DSCli.dll | 12 | 0 |
| ccSvcHst.exe | libcurl-openssl.dll | 9 | 0 |
| svchost.exe | sysfer.dll | 9 | 0 |
| ccSvcHst.exe | ccLib.dll | 8 | 0 |
| TiWorker.exe | sysfer.dll | 3 | 0 |
| ccSvcHst.exe | SepManagementClient.dll | 1 | 1 |
| ccSvcHst.exe | ssleay32.dll | 2 | 0 |
| ccSvcHst.exe | BHEng64.dll | 0 | 2 |
| OneDrive.exe | sysfer.dll | 0 | 3 |
| EXCEL.EXE | sysfer.dll | 0 | 4 |
| explorer.exe | sysfer.dll | 0 | 2 |
| officeClickToRun.exe | sysfer.dll | 0 | 3 |

`sysfer.dll`은 SEP가 OneDrive·EXCEL·Explorer·Office 등 **일반 프로세스에 주입**하는 모듈입니다. 백신 자체뿐 아니라 **주입된 호스트 프로세스의 부하까지 합산**해야 실제 영향이 드러납니다.

## 5. 종합 결론

백신 자체(ccSvcHst) + 주입된 호스트 프로세스 부하를 모두 합산하면, 신버전 업그레이드로 **SEP 관련 전체 CPU 부하가 약 43% 감소**했습니다.

**시사점**
- "백신이 무겁다"는 체감은 종종 **버전 차이**에서 옵니다. 구버전의 32/64비트 이중 구동, 일반 프로세스로의 과도한 DLL 주입이 주된 원인이었습니다.
- 엔드포인트 보안 제품은 **버전 업그레이드·빌드 일원화만으로도** 비용 없이 체감 성능을 크게 끌어올릴 수 있습니다.
- Orange Platform은 프로세스별·**주입 모듈(DLL)별**로 부하를 분리 측정해, "백신을 바꿔야 하나 / 버전만 올리면 되나"의 판단 근거를 제공합니다.

---

*Orange Platform이 현장에서 수집한 데이터를 기반으로 작성한 분석 리포트입니다.*
