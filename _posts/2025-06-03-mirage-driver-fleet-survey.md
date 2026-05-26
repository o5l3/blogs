---
title: "44대 중 28대에서 발견된 Mirage Driver — 원격제어 잔재가 dxgmms2.sys 부하를 만드는 현황 조사"
excerpt: "한 고객 환경 44대를 WMI VideoCard 기준으로 조사한 결과 28대에서 Mirage Driver(DemoForge, XPDM 기반 가상 디스플레이)가 Degraded 상태로 발견됐습니다. 구버전 TeamViewer·AnyDesk가 남긴 잔재가 WDDM 환경에서 dxgmms2.sys의 불필요한 polling·진단 부하를 유발합니다. 기종·GPU·OS 분포와 함께 정리합니다."
category: report
date: 2025-06-03
author: SungWoo824
tags: [성능분석, MirageDriver, dxgmms2.sys, 원격제어, WDDM, Orange Platform]
---

## 개요

| 항목 | 값 |
|---|---|
| 전체 노드 | 44 |
| Mirage Driver 발견 노드 | 28 |
| 기준 | WMI VideoCard 항목 |

"Mirage Driver + Intel 그래픽 + 구버전 Windows/그래픽 드라이버" 조합에서, Orange The Client 분석 결과 `dxgmms2.sys`에 의한 커널 CPU 점유 이슈가 발견됐습니다. (PC명·IP 등 식별 정보는 비공개)

## 공통 특성

Mirage Driver가 설치된 28노드는 WMI 상 다음 특성을 공유했습니다.

| 항목 | 값 |
|---|---|
| Status | **Degraded (비정상)** |
| PNPDeviceID | `ROOT\DISPLAY\0000` |
| AdapterCompatibility | **DemoForge** |
| InstalledDisplayDrivers | 없음(None) |

28노드의 GPU는 대부분 Intel 내장(Iris Xe / UHD 620 / HD 6xx)이었고, OS는 Windows 10 19045 ~ Windows 11 26100까지 폭넓게 분포했습니다. 노트북 기종도 LG·Lenovo·Samsung·Acer 등 다양해, **특정 기종 문제가 아니라 "과거 원격제어 도구 설치 이력"의 공통점**임을 시사했습니다.

## Mirage Driver / DemoForge란

- **Mirage Driver**: XPDM(XP Display Driver Model) 기반 "미러 드라이버(가상 디스플레이 어댑터)". GPU 프레임 버퍼를 미러링해 화면을 추출, 원격제어·녹화에 사용. XP/7/8 시절 핵심 기술이었으나 Windows 10/11은 **WDDM** 기반으로 표준 전환됨.
- **DemoForge**: 2000년대 초 미러 드라이버 기술. 유지보수 종료 상태.

최신 TeamViewer·AnyDesk·RealVNC는 Mirage Driver 없이 자체 캡처 엔진(DirectX·DWM API)을 쓰며, 공식적으로 "Mirage Driver 불필요"를 명시합니다. 즉 **지금 Device Manager에 Mirage Driver가 보인다면 구버전 원격제어 솔루션의 설치 잔재**일 가능성이 높습니다.

## 왜 dxgmms2.sys 부하가 생기나

- `dxgmms2.sys`는 시스템 내 모든 디스플레이 드라이버(가상 포함)를 관리하는 Windows 커널 드라이버입니다.
- XPDM 기반 미러 드라이버가 WDDM 환경에 남아 있으면 **비정상(Degraded) 상태로 인식**되고, `dxgmms2.sys`가 부팅·화면 갱신·자원 초기화 때마다 호환성 검사·상태 확인을 반복합니다.
- 사용하지 않는 미러 드라이버가 남을수록 커널 이벤트 대기가 증가하고, IRQ·메모리 매핑 시도 중 불필요한 polling loop에 빠지는 것으로 추정됩니다.
- 미러 드라이버 제거 시 `dxgmms2.sys` CPU 점유가 즉시 감소한 사례가 다수 보고됩니다.

## 결론·대응

- Windows 10/11 환경에서 **Mirage Driver(DemoForge)는 불필요한 잔재이므로 제거 권장**.
- 향후 Orange The Client에 Mirage Driver 설치 탐지 및 자동 조치를 추가할 계획입니다.

> 관련: dxgmms2.sys CPU 점유의 숨은 원인 — 원격제어 가상 디스플레이(Mirage Driver) 완전 분석

---

*Orange Platform이 현장에서 수집한 데이터를 기반으로 작성한 현황 조사 리포트입니다. 고객·PC 식별 정보는 비공개 처리했습니다.*
