---
title: "기업 PC 45대 IT 장애 종합 분석 — CPU 점유·강제 종료·블루스크린의 실제 원인 (2025년 5월)"
excerpt: "한 고객사 45대 PC를 9일간 상시 모니터링해 CPU 주기적 점유 289건, 비정상 종료 147건, 강제 종료 140건, 파일시스템 22건, 블루스크린 3건을 수집·분석했습니다. OS 빌드·기종별 발생률, 증상별 발생/원인 Top10, 백신(ccSvcHst)·OneDrive의 SharePoint 강제 종료·.NET 런타임 충돌·네트워크 드라이버 BSOD까지 정량 데이터로 제시합니다."
category: report
date: 2025-05-23
author: SungWoo824
tags: [성능분석, IT장애, 블루스크린, 강제종료, CPU점유, 고객사보고서, Orange Platform]
---

## 1. 개요

| 항목 | 내용 |
|---|---|
| 분석 기간 | 2025-05-15 ~ 2025-05-23 (9일) |
| 전체 대상 PC | 45대 |
| 증상 발생 PC | 36대 |

> 고객사명·PC명·내부 IP 등 식별 정보는 비공개 처리했습니다. 하드웨어 모델명은 동일 증상의 기종 편향을 보여주기 위해 유지합니다.

### OS 버전별

| 윈도우 | 버전 | PC 수 | 증상 PC |
|---|---|---|---|
| Windows 10 Enterprise | 22H2 | 3 | 1 |
| Windows 10 Home | 22H2 | 1 | 1 |
| Windows 10 Home | 23H2 | 1 | 0 |
| Windows 10 Pro | 21H2 | 1 | 1 |
| Windows 10 Pro | 22H2 | 12 | 10 |
| Windows 10 Pro | 23H2 | 11 | 5 |
| Windows 10 Pro | 24H2 | 16 | 16 |

24H2 장비는 **16대 전부** 증상이 발생해 빌드 편향이 뚜렷했습니다.

### 제조사·모델별

| 제조사 | 모델명 | 메모리 | PC 수 | 증상 PC | 발생률 |
|---|---|---|---|---|---|
| LG Electronics | 15U50P-GP75ML | 16GB | 10 | 4 | 40% |
| LG Electronics | 15Z90Q-EA56K | 16GB | 4 | 3 | 75% |
| LG Electronics | 15ZD90Q-GX56K | 16GB | 3 | 2 | 66.7% |
| LG Electronics | 15U530-GR3LK | 8GB | 2 | 1 | 50% |
| LENOVO | 81SX | 8GB | 3 | 1 | 33.3% |
| LENOVO | 21FDS43M00 | 16GB | 2 | 1 | 50% |
| LENOVO | 21N5 | 8GB | 2 | 1 | 50% |
| LENOVO | 20T0S00E00 | 8GB | 2 | 1 | 50% |
| SAMSUNG | NT950QDB-K71A | 16GB | 2 | 0 | 0% |
| SAMSUNG | NT750XDA-X71A | 16GB | 2 | 0 | 0% |
| Acer | A515-56 | 8GB | 1 | 0 | 0% |

## 2. 증상별 발생 분포

| 증상 | 발생 PC | 발생 횟수 |
|---|---|---|
| CPU 코어 1개 이상 주기적 점유 | 27 | 289 |
| 프로그램 비정상 종료 | 29 | 147 |
| 다른 프로그램에 의한 강제 종료 | 31 | 140 |
| 파일시스템 지연·오류 | 6 | 22 |
| 블루스크린 | 3 | 3 |

## 3. 증상별 상세 원인

### ▶ 블루스크린 (3건)

| 원인 모듈 | OS | 제조사 | 모델 |
|---|---|---|---|
| ntoskrnl.exe | 10 Pro 24H2 | LG | 15U50P-GP75ML |
| System | 10 Pro 22H2 | LG | 15Z90Q-EA56K |
| netadaptercx.sys | 10 Pro 24H2 | LG | 15ZD90Q-GX56K |

`netadaptercx.sys`(네트워크 드라이버 프레임워크)發 BSOD는 표면 모듈일 뿐 실제 원인은 NIC 벤더 드라이버인 경우가 많습니다(별도 BSOD 사례 리포트 참고).

### ▶ CPU 코어 주기적 점유

| 발생 | 원인 모듈 | 발생 PC | 횟수 |
|---|---|---|---|
| ccSvcHst.exe | DSCli.dll | 20 | 74 |
| ccSvcHst.exe | ccSvcHst.exe | 14 | 36 |
| ccSvcHst.exe | ccLib.dll | 8 | 21 |
| ccSvcHst.exe | libcurl-openssl.dll | 6 | 10 |
| chrome.exe | chrome.exe | 5 | 10 |
| ccSvcHst.exe | SepManagementClient.dll | 4 | 4 |
| MsMpEng.exe | MpClient.dll | 3 | 8 |
| TiWorker.exe | rpcrt4.dll | 3 | 4 |
| ccSvcHst.exe | srtspscan.dll | 3 | 4 |
| eclipse.exe | jvm.dll | 3 | 4 |

백신 SEP(`ccSvcHst.exe`)가 압도적입니다. (관련: SEP 버전 업그레이드로 부하 43% 감소 리포트)

### ▶ 프로그램 비정상 종료

| 발생 | 원인 모듈 | 발생 PC | 횟수 |
|---|---|---|---|
| (사내 ERP 클라이언트) | clr.dll | 10 | 41 |
| (사내 ERP 런타임호스트) | clr.dll | 6 | 16 |
| (사내 ERP) | clr.dll | 4 | 13 |
| Set-up.exe | Set-up.exe | 3 | 10 |
| igfxEMN.exe | libapr_tsvn.dll | 3 | 4 |
| (보안 에이전트 UI) | 자기 자신 | 2 | 4 |
| KakaoTalk.exe | KakaoTalk.exe | 2 | 2 |

.NET 런타임(`clr.dll`) 위에서 도는 사내 업무 클라이언트의 충돌이 다발 — 단일 라이브러리 원인으로 14대에서 종료됐습니다.

### ▶ 다른 프로그램에 의한 강제 종료

| 발생 | 원인(가해) | 발생 PC | 횟수 |
|---|---|---|---|
| Microsoft.SharePoint.exe | OneDriveSetup.exe | 22 | 24 |
| gpupdate.exe | (보안 에이전트 UI) | 16 | 27 |
| gpupdate.exe | (보안 에이전트) | 5 | 7 |
| (사내 ERP Shell) | Taskmgr.exe | 3 | 3 |
| ONENOTEM.EXE | OfficeClickToRun.exe | 3 | 3 |
| cmd.exe | taskkill.exe | 2 | 5 |

`OneDriveSetup.exe`가 `Microsoft.SharePoint.exe`를 종료시키는 패턴이 22대로 1위, 그룹정책 갱신(`gpupdate.exe`)이 보안 에이전트 UI를 종료시키는 사례가 그 뒤입니다.

### ▶ 파일시스템 (요약)

디스크 포화(드라이브 꽉 참)·파일시스템 처리 지연/오류로 일부 PC에서 작업 실패가 누적됐습니다(최다 9건/대).

## 4. 증상별 Top 10

**발생 기준** — Microsoft.SharePoint.exe(강제종료, 22대), ccSvcHst.exe(CPU점유, 21대), gpupdate.exe(강제종료, 16대), 사내 ERP 클라이언트(비정상종료, 10대) …

**원인 기준** — OneDriveSetup.exe(강제종료, 22대), DSCli.dll(CPU점유, 20대), 보안 에이전트 UI(강제종료, 17대), ccSvcHst.exe(CPU점유, 14대), clr.dll(비정상종료, 14대) …

## 5. 시사점

장애의 상당수는 "특정 앱이 느리다"가 아니라 **백신·동기화 클라이언트·그룹정책·런타임이 서로를 종료시키거나 자원을 다투는** 상호작용에서 나옵니다. 개별 PC가 아니라 전사 단위로 "발생↔원인" 쌍을 집계하면, 소수의 공통 원인(백신 버전, OneDrive 정책, 특정 .NET 런타임)을 잡는 것만으로 광범위한 체감 개선이 가능합니다.

---

*Orange Platform이 현장에서 수집한 데이터를 기반으로 작성한 분석 리포트입니다. 고객·PC 식별 정보는 비공개 처리했습니다.*
