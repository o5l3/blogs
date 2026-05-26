---
title: "백신(SEP) CPU 과다 점유 집중 분석 — 41대 중 17대(41.5%)에서 반복, 모듈별 분포와 대응 권고"
excerpt: "Orange The Client 설치 단말 41대 중 17대(41.5%)에서 Symantec Endpoint Protection 관련 모듈이 CPU 1코어 이상을 반복 Full 점유했습니다. DSCli.dll·ccLib.dll·libcurl-openssl.dll·sysfer.dll·Teefer.sys 등 모듈별 탐지 분포와 각 모듈의 역할, 그리고 버전 업그레이드·정책 최적화 권고를 정리합니다."
category: report
date: 2025-05-20
author: SungWoo824
tags: [성능분석, 백신, Symantec, SEP, CPU, Orange Platform]
---

## 1. 개요

2023-12 Orange The Client 최초 설치 후 1차 리뷰에서 SEP 관련 모듈(`ccSvcHst.exe`·`ccLib.dll`·`DSCli.dll` 등)의 CPU 과다 점유가 다수 단말에서 확인됐고, 2025-05-15~20 추가 데이터에서도 동일 양상이 반복됨이 확인됐습니다.

| 구분 | 수량 | 비율 |
|---|---|---|
| 전체 사용자 | 41대 | 100% |
| SEP 관련 CPU 과점 탐지 | 17대 | 약 41.5% |

(일부 PC는 다른 백신 사용) Orange The Client 설치 단말의 약 40% 이상에서 일정 기간 **CPU 1코어 이상을 Full 점유**하는 상태가 반복 감지됐습니다.

## 2. 모듈별 탐지 분포

| 모듈 | 단말 수 | 비율 |
|---|---|---|
| DSCli.dll | 15 | 88.2% |
| ccLib.dll | 8 | 47.1% |
| libcurl-openssl.dll | 7 | 41.2% |
| sysfer.dll | 6 | 35.3% |
| BHEngine.dll | 3 | 17.6% |
| SepManagementClient.dll | 2 | 11.8% |
| srtpsscan.dll | 2 | 11.8% |
| Teefer.sys | 2 | 11.8% |
| Tse.dll | 1 | 5.9% |

대부분 SEP 자체 프로세스(`ccSvcHst.exe`)를 통해 로드됐고, 일부는 `explorer.exe`·Windows 커널 등 시스템 프로세스에 로드되어 동작했습니다. **표면적으로는 윈도우 프로그램 문제처럼 보였지만, 분석 결과 모두 SEP 구성요소**였습니다.

## 3. 탐지 로직

- 일정 시간 동안 CPU 1코어 이상을 Full 점유하는 프로세스를 식별
- 해당 시점 프로세스 내부에서 **가장 많은 CPU를 소모한 모듈**을 분석으로 추출
- 오탐이 아닌, 정량 기준 기반 실시간 분석 결과

## 4. 모듈별 역할·알려진 사례

| 모듈 | 역할 | 과점 맥락 |
|---|---|---|
| DSCli.dll | 디바이스 제어 | 외부 저장장치 사용 시 과점 |
| ccLib.dll | 실시간 보호 파일 감시 | 대용량 파일 스캔 시 |
| libcurl-openssl.dll | TLS 통신 | 반복 연결 시 |
| sysfer.dll | CMC 방화벽 모듈 | 프로세스 수준 반복 과점 |
| Teefer.sys | 네트워크 필터 드라이버 | 드라이버 레벨 패킷 처리 과점 |
| SepManagementClient.dll | 정책 적용 | 정책 적용 시점 부하 |

사용 중 버전은 **14.3.3580.1100.105 (2021-03 출시)**로 오래된 빌드였습니다.

## 5. 권장 대응

| 항목 | 내용 |
|---|---|
| SEP 업그레이드 | 최신 기능본(RU10) 또는 안정 패치본(RU9 Patch 1)으로 |
| 정책 최적화 | 실시간 보호 제외 조건 재조정(대용량 파일·네트워크 드라이브) |
| 예외 정책 | 반복 탐지 단말에 한해 정책 예외·모듈 배포 제어 검토 |
| 로그 병행 분석 | SEP 자체 Event/통계 로그와 리소스 사용 상관관계 파악 |

> 후속 실측에서 신버전 업그레이드로 SEP 관련 CPU 부하가 약 43% 감소함을 49대 비교로 확인했습니다(별도 리포트 참고).

---

*Orange Platform이 현장에서 수집한 데이터를 기반으로 작성한 분석 리포트입니다.*
