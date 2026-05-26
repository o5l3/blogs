---
title: "dxgmms2.sys CPU 점유의 숨은 원인 — 원격제어 가상 디스플레이(Mirage Driver) 완전 분석"
excerpt: "Intel 내장 그래픽 + Windows 10 구버전 환경에서 반복된 dxgmms2.sys 비정상 CPU 점유. 증상 장비들의 공통점을 추적한 결과 원격제어 프로그램이 남긴 가상 디스플레이 드라이버(DemoForge Mirage Driver)와 WDDM 경합이 원인이었습니다. dxgmms2.sys의 역할, Mirage Driver의 시스템 영향, 블랙스크린·보안 위험, 설치 시점 추적과 안전한 제거까지 현장 분석 그대로 정리합니다."
category: report
date: 2025-06-30
author: Orange Labs
tags: [성능분석, dxgmms2.sys, 원격제어, MirageDriver, WDDM, 보안, Windows, Orange Platform]
---

## 1. 분석 대상 시스템

- **OS**: Windows 10 Pro (21H2, Build 19044)
- **GPU**: Intel(R) UHD Graphics 620 (내장 그래픽)
- The Client가 설치된 PC에서 `dxgmms2.sys`의 CPU 점유 현상 확인

> Build 19044는 Windows 10 21H2를 의미합니다(19045 = 22H2). 출시된 지 오래된 구버전으로, 보안·안정성을 위해 최신 빌드(22H2 이상) 업그레이드가 권장됩니다. 이 장비가 구버전에 머문 이유는 ① 회사 정책으로 Windows Update가 차단됐거나 ② 사용자가 수동으로 업데이트를 중지한 경우로 좁혀집니다.

## 2. 문제 개요

해당 PC에서 `dxgmms2.sys`의 비정상적 CPU 점유를 탐지했습니다. 처음엔 YouTube 시청 등 동영상·UI 렌더링 부하로 추정했으나, 장치 정보를 분석하자 **증상 장비들의 공통점**이 드러났습니다.

- **Mirage Driver(DemoForge)가 존재하거나 Status가 `Degraded`로 등록**
- 메인 그래픽 카드가 Intel 내장 그래픽 시리즈
- Windows 버전이 10이면서 오래된 빌드

## 3. 원인 분석

### 3.1 dxgmms2.sys의 역할

`dxgmms2.sys`는 DirectX Graphics MMS(메모리 관리 서브시스템) 드라이버로, **WDDM(Windows Display Driver Model)** 환경에서 그래픽 자원의 할당·해제를 담당하는 커널 구성요소입니다. GPU 리소스를 쓰는 프로세스들이 DirectX를 통해 자원을 요청·반납할 때 `dxgmms2.sys`가 이를 중재합니다.

이 과정에서 **드라이버 충돌, 가상 디스플레이와의 경합, 잘못된 자원 반환 처리**가 발생하면, `dxgmms2.sys`는 커널 내에서 과도한 루프 또는 실패 재시도를 유발하며 CPU 점유율이 급상승합니다.

### 3.2 Mirage Driver와의 충돌

Mirage Driver는 원격 제어 프로그램이 사용하는 **'가상의 화면'**을 만들어주는 그래픽 드라이버입니다. 사용자가 실제 보는 화면 외에 원격 접속용 별도 화면 공간을 만들고, 그 공간에서 원격 제어자가 작업하도록 돕습니다.

**Mirage Driver를 설치하는 대표 프로그램**

| 프로그램 | 사용 목적 | 설치 방식 |
|---|---|---|
| Remote Utilities | 고객 원격 지원 | 자동 설치 |
| R-HUB Remote Support | 실시간 원격 데스크톱 관리 | 포함 설치 |
| TightVNC / UltraVNC | CPU 사용량 감소 / 다중 화면 지원 | 선택적 설치 |
| Dameware Remote Support | 기업 내 원격 유지보수 | 드라이버 내장 |
| 기타 구형 원격 도구 | 블랙스크린 / 빠른 화면 전송 | 드라이버 번들·수동 추가 |

**설치 시 시스템에 미치는 영향**

| 영향 항목 | 설명 |
|---|---|
| 디스플레이 장치가 하나 더 생김 | 장치 관리자에 'Mirage Driver' 가상 모니터 추가 |
| GPU 자원 공유 | 실제 그래픽카드와 Mirage Driver가 동시에 DirectX 자원 요청 |
| WDDM 충돌 가능성 | Windows·GPU의 화면 처리 순서 조율 중 충돌 발생 가능 |
| 비정상 상태(Degraded) | 드라이버 초기화 실패·자원 할당 불가 시 비정상 표시 |
| dxgmms2.sys 과점유 | 커널 DirectX 모듈이 Mirage Driver 요청 처리 중 과부하 |
| 성능 저하 | CPU 부하·화면 지연·리소스 병목으로 탐지 |

### 3.3 블랙스크린과 보안 위험

블랙스크린(Black Screen)은 화면이 전혀 출력되지 않거나 검은 배경만 표시되는 상태입니다. Mirage Driver는 실제 화면 대신 가상 디스플레이를 활성화할 수 있어, **사용자는 화면을 못 보는데 원격에서는 작업이 진행**되는 상황을 만들 수 있습니다. 특히 화면을 숨기려는 원격 제어 목적에서 의도적으로 쓰입니다.

| 보안 위험 | 설명 |
|---|---|
| 숨겨진 원격 조작 | 사용자가 못 보는 가상 화면에서 외부인이 작업 수행 가능 |
| 탐지 우회 | 실제 화면엔 변화가 없어 악성 행위 탐지가 어려움 |
| 감시·데이터 탈취 | 키 입력 감시·민감 파일 접근이 백그라운드에서 수행 가능 |
| 보안 커뮤니티 평판 | 전문가들은 Mirage Driver를 종종 침해 지표(IOC)로 분류 |

참고로 아래 도구들은 Mirage Driver를 쓰지 않습니다 — 그 존재 자체가 '예외적 상황'일 수 있습니다.

| 프로그램 | Mirage 사용 | 이유 |
|---|---|---|
| TeamViewer | ❌ | 실제 화면 직접 캡처 전송, 드라이버 불필요 |
| Chrome Remote Desktop | ❌ | Chrome·시스템 API로만 구성 |
| AnyDesk(신형) | ❌ | DirectX 기반 경량 전송 엔진 |
| Windows RDP | ❌ | OS 내장 그래픽 세션 기능 |

### 3.4 Windows Update 동작 확인

LiveCMD로 대상 시스템의 업데이트 상태를 점검합니다.

```
sc query wuauserv                              → Update 서비스 실행 여부
wmic qfe list brief /format:table              → 최근 핫픽스·업데이트 내역
wmic qfe list full                             → 누적 업데이트 기록
```

이번 장비는 **Windows Update 서비스가 종료** 돼 있었습니다(기본은 항상 동작이나 사용자가 임의 변경 가능). 구버전에 머문 것이 dxgmms2/Mirage 문제의 배경이 됐습니다.

## 4. Mirage Driver 설치 시점 추적

```
dir /tc dfmirage.sys      → 생성일자 2008년 (신뢰 불가)
pnputil /enum-drivers     → dfmirage.inf 존재 확인
setupapi.dev.log          → dfmirage 관련 기록 없음
```

The Client 수집 정보와 LiveCMD 추가 조사를 종합하면, `dfmirage.sys`는 **The Client 설치 이전부터 존재**했습니다. PE 포맷(.sys/.dll/.exe) 생성 시점과 연계 프로세스를 추적하면 설치 출처를 파악할 수 있으나, 본 파일은 설치 이전 생성분이라 로그에 남지 않았습니다.

## 5. 해결 및 권장 방안

### 5.1 드라이버 제거

```
pnputil /delete-driver dfmirage.inf /uninstall /force
sc delete dfmirage
del /f /q C:\Windows\System32\drivers\dfmirage.sys
```

제거 시 주의점:
- `sc stop dfmirage`는 비정상 드라이버에서 **서비스 타임 1052 오류**를 낼 수 있어, 서비스 등록만 `sc delete`로 제거하는 편이 안전합니다.
- `.sys` 파일은 사용 중이면 잠겨 있어, 서비스 삭제 후 **재부팅 시점에 정리**됩니다.
- `del` 시 "사용 중이라 거부" 메시지가 나오면 재부팅 후 다시 시도합니다.

### 5.2 시스템 업데이트

22H2 이상으로 업데이트하면 `dxgmms2.sys`와 가상 디스플레이 드라이버 간 호환성 문제가 완화됩니다(WDDM 2.9 등). Windows Update가 임의 중지된 경우 재활성화가 선행돼야 합니다.

> **발전 방향** — 증상을 일으킨 파일(dxgmms2.sys·Mirage Driver)에 대한 상세 설명을 시스템이 자동 생성하고, 원인 파일의 설치~삭제 시점과 출처(누가 설치·삭제했는지)까지 추적하는 기능이 다양한 환경의 데이터가 축적되면 구현 가능합니다.

---

*Orange Platform이 현장에서 수집한 데이터를 기반으로 작성한 분석 리포트입니다.*
