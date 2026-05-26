---
title: "dxgmms2.sys CPU 점유의 숨은 원인 — 원격제어 가상 디스플레이(Mirage Driver) 추적"
excerpt: "Intel UHD 그래픽 + Windows 10 구버전 환경에서 반복된 dxgmms2.sys 비정상 CPU 점유. 공통점을 추적한 결과 원격제어 프로그램이 남긴 가상 디스플레이 드라이버(DemoForge Mirage Driver)와 WDDM 경합이 원인이었습니다. 탐지부터 안전한 제거까지 정리합니다."
category: report
date: 2025-06-30
author: Orange Labs
tags: [성능분석, dxgmms2.sys, 원격제어, 보안, Windows, Orange Platform]
---

## 문제 개요

Orange The Client로 모니터링 중인 한 PC에서 `dxgmms2.sys`의 비정상적인 CPU 점유가 반복 탐지됐습니다. 처음엔 동영상·UI 렌더링 부하로 추정했으나, 같은 증상을 보인 장비들의 **공통점**이 드러났습니다.

- 메인 GPU가 Intel 내장 그래픽(예: UHD Graphics 620)
- Windows 10의 비교적 오래된 빌드(21H2, Build 19044 등)
- 장치에 **Mirage Driver(DemoForge)가 존재하거나 상태가 `Degraded`로 등록**

## dxgmms2.sys란

`dxgmms2.sys`는 DirectX Graphics MMS(메모리 관리 서브시스템) 드라이버로, WDDM(Windows Display Driver Model) 환경에서 GPU 자원의 할당·해제를 중재하는 커널 구성요소입니다. 드라이버 충돌·가상 디스플레이와의 경합·잘못된 자원 반환이 생기면 커널 내부에서 과도한 루프나 실패 재시도가 발생해 CPU 점유가 급상승합니다.

## 진짜 원인 — Mirage Driver와 WDDM 경합

Mirage Driver는 원격제어 프로그램이 쓰는 **가상 화면**을 만드는 그래픽 드라이버입니다. 사용자가 보는 실제 화면 외에 원격 접속용 별도 화면을 구성합니다. Remote Utilities, R-HUB, 일부 구형 VNC·원격 지원 도구가 번들로 설치합니다.

설치 시 시스템에는 가상 모니터가 하나 더 생기고, 실제 GPU와 Mirage Driver가 **동시에 DirectX 자원을 요청**하면서 WDDM 처리 순서 조율 중 충돌이 발생합니다. 드라이버 초기화 실패로 `Degraded` 상태가 되면, 커널 DirectX 모듈인 `dxgmms2.sys`가 그 요청을 처리하다 과부하에 빠집니다.

## 보안 관점

가상 디스플레이는 "사용자가 보지 못하는 화면에서 외부인이 작업"할 수 있는 통로가 되기도 합니다. 실제 화면엔 변화가 없어 악성 행위 탐지가 어렵고, 보안 업계에선 Mirage Driver 흔적을 종종 침해 지표(IOC)로 봅니다. 참고로 TeamViewer·Chrome Remote Desktop·AnyDesk(신형)·Windows RDP는 Mirage Driver를 쓰지 않으므로, **그 존재 자체가 예외적 상황**일 수 있습니다.

## 조치

LiveCMD로 설치 시점을 추적(`pnputil /enum-drivers`로 `dfmirage.inf` 확인)한 뒤, 불필요하면 안전하게 제거합니다.

```
pnputil /delete-driver dfmirage.inf /uninstall /force
sc delete dfmirage
del /f /q C:\Windows\System32\drivers\dfmirage.sys
```

`sc stop`은 비정상 드라이버에서 오류 1052를 낼 수 있어, 서비스 등록만 `sc delete`로 제거한 뒤 `.sys`는 재부팅 후 정리하는 편이 안전합니다. 더불어 Windows Update가 임의로 중지돼 구버전에 머문 경우가 많아, 최신 빌드(22H2 이상) 적용을 함께 권장합니다.

---

*Orange Platform이 현장에서 수집한 데이터를 기반으로 작성한 분석 리포트입니다.*
