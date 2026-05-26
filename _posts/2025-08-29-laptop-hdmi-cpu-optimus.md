---
title: "회의실 HDMI 연결 시 노트북 CPU 과부하·Wi-Fi 끊김 — Optimus(iGPU/dGPU) 전환과 배터리 전력 제한"
excerpt: "전원 없이 회의실 HDMI에 연결하면 노트북이 버벅이고 Wi-Fi가 끊기는 현상. RTX 4060 + Intel iGPU를 쓰는 고성능 노트북에서 HDMI 포트가 dGPU 직결이라 배터리 모드의 전력 제한과 맞물려 CPU 점유가 치솟습니다. Optimus 구조, 배터리 성능 제한(CPU -40%), HDMI-Wi-Fi 간섭까지 원인을 정리합니다."
category: report
date: 2025-08-29
author: SungWoo824
tags: [성능분석, Optimus, dGPU, HDMI, WiFi, 노트북, Orange Platform]
---

## 문제

전원 연결 없이 회의실 HDMI에 연결하면 CPU 과부하로 동작이 버벅이고 Wi-Fi 연결이 끊기는 현상.

## 대상 사양

- Manufacturer: LENOVO / Model: 21N5 (ThinkBook 16p Gen5 IRX 급)
- CPU: Intel Core i7-14650HX (Raptor Lake-HX, 14세대)
- GPU: NVIDIA GeForce RTX 4060 Laptop (8GB) + Intel UHD Graphics (iGPU)
- 메모리 32GB / Windows 11 Pro

내장 그래픽 외에 RTX 4060 dGPU가 탑재된 고성능·고전력 모델로, **전원이 연결되지 않으면 성능 저하가 크게 발생**하는 부류입니다.

## 원인 분석

### 1) 배터리 전력 제한

이 기종은 AC 전원 대비 배터리 사용 시 성능이 크게 제한됩니다. 리뷰 기준 배터리 모드에서 **CPU 성능 약 40%, GPU 약 20% 감소**합니다. 배터리만으로는 고성능 CPU(HX 시리즈)와 RTX 4060을 풀로 구동하기 어려워 전력 제한(Power Limit)이 걸리기 때문입니다.

### 2) Optimus와 HDMI 포트의 dGPU 직결

**NVIDIA Optimus**는 iGPU(내장)와 dGPU(외장)를 자동 전환·협업시키는 기술입니다. 가벼운 작업은 iGPU만, 고성능이 필요하면 dGPU를 켜 처리하며, 화면 출력은 기본적으로 iGPU를 통해 나갑니다(dGPU는 렌더링만 하고 결과를 iGPU 메모리로 복사).

| | iGPU | dGPU |
|---|---|---|
| 위치 | CPU 패키지 내장 | 별도 칩 + 전용 VRAM |
| 전력 | 적음 | 큼 |
| 예 | Intel UHD/Iris Xe | RTX 4060 (8GB) |

문제는 **이 기종의 HDMI 포트가 dGPU(RTX 4060)에 직결**돼 있다는 점입니다. 외부 모니터를 연결하면 dGPU가 상시 활성화되어 Optimus 경유를 못 쓰고, 배터리 모드의 부족한 전력으로 dGPU를 구동하느라 CPU 점유가 치솟고 마우스가 끊깁니다. 외부 모니터를 분리해도 dGPU가 꺼지지 않아 소모가 지속되는 버그도 Legion 계열에서 보고됩니다(Windows 11·드라이버로 일부 개선되나 Optimus 구조의 근본 한계).

> 참고: 일부 기종은 **MUX 스위치**로 BIOS/Vantage에서 Hybrid(Optimus) ↔ dGPU 전용 모드를 선택할 수 있습니다. Hybrid는 배터리 효율↑·성능↓, dGPU 전용은 성능↑·배터리↓.

### 3) HDMI-Wi-Fi 간섭

배터리 구동 중 HDMI로 외부 디스플레이를 연결하면 무선랜이 끊기는 증상은 두 요인이 거론됩니다.

- **전력 관리**: 배터리 절감을 위해 무선 어댑터 전원을 차단할 수 있는데, 외부 디스플레이로 부하가 오르며 Wi-Fi 모듈 전원을 순간 차단.
- **전자기 간섭(EMI)**: HDMI 신호가 5GHz Wi-Fi에 간섭. 802.11ac(5GHz)를 끄고 2.4GHz만 쓰거나, 케이블 교체, 리프레시레이트 조정(59.94→75Hz)으로 해결된 사례들이 보고됩니다.

## 권장 시도

- 외장 모니터 연결 시 **인텔 내장 그래픽 출력 모드**로 설정(가능한 경우)
- Wi-Fi 전력 관리 설정 변경, 필요 시 802.11ac 비활성
- **HDMI 케이블 교체**(차폐 불량 의심), 리프레시레이트 조정
- 가능하면 회의실에서는 **전원 연결** 사용

> 정확한 재현을 위해 "전원 미연결 + 외부 모니터" 조합이 필요한데, 대상 장비는 평소 전원 연결 상태라 원격 분석에 한계가 있습니다. 이에 유사 사양·동일 Optimus 적용 장비(Legion Pro 5i 16IRX)를 확보해 재현 테스트를 진행 중입니다.

---

*Orange Platform이 현장에서 수집한 데이터를 기반으로 작성한 분석 리포트입니다(중간 분석).*
