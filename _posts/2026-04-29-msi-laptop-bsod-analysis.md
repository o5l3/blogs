---
title: "노트북 블루스크린 두 건의 진짜 원인 — Intel 이더넷 D3 전환(0x9F)과 WSL2 메모리(0x7E)"
excerpt: "같은 노트북에서 4시간 간격으로 터진 두 종류의 블루스크린을 windbg로 끝까지 추적했습니다. 하나는 Intel NIC 드라이버(e1dnexpress.sys)의 D3 절전 전환 실패(DRIVER_POWER_STATE_FAILURE 0x9F), 다른 하나는 Windows 11 24H2의 WSL2 메모리 백킹(vmmemWSL) 커널 어서션(0x7E)이었습니다."
category: report
date: 2026-04-29
author: Orange Labs
tags: [블루스크린, BSOD, windbg, 드라이버, Windows11, Orange Platform]
---

## 개요

한 노트북에서 최근 블루스크린 4건이 발생했고, Agent가 두 유형으로 집계했습니다. windbg로 덤프를 분석해 각각의 **진짜 원인**을 짚었습니다.

## ① DRIVER_POWER_STATE_FAILURE (0x9F) — Intel 이더넷 D3 전환 실패

- 의미: 디바이스가 전원 IRP를 제한 시간 안에 완료하지 못해 시스템이 강제 종료
- 충돌 모듈: `netadaptercx.sys` (Microsoft NetAdapterCx 프레임워크 — 네트워크 미니포트의 베이스)
- windbg `!irp` 분석으로 드러난 실제 원인: **`e1dnexpress.sys`** (Intel 이더넷 드라이버, `PCI\VEN_8086&DEV_550F`)

시스템이 NIC에 "D3로 내려가라(SetPower → D3)" IRP를 보냈는데, 드라이버가 이를 받아놓고 시한 내 완료하지 못했습니다. 내부적으로 NetAdapterCx의 RX 핸들러 분리 단계(`SetRxHandler` → rundown wait)에서 멈췄고, Windows가 타임아웃을 감지해 0x9F를 발생시켰습니다. 해당 드라이버는 2024년 9월 빌드로, Windows 11 24H2(빌드 26100)에서 D3 전환 시 RX 핸들러 분리 실패 사례가 보고된 버전입니다.

**조치**
- NIC 드라이버를 벤더 최신본으로 업데이트(Windows Update 자동본보다 벤더본 권장)
- 임시 회피: 장치 관리자 → 네트워크 어댑터 → 전원 관리 → "전원 절약을 위해 끌 수 있음" 해제

## ② SYSTEM_THREAD_EXCEPTION_NOT_HANDLED (0x7E) — WSL2 메모리

- 예외: `STATUS_ASSERTION_FAILURE (0xC0000420)` — 커널 내부 어서션 실패
- 충돌 모듈: `ntkrnlmp.exe` (Windows 11 24H2, build 26100.8246), 함수 `nt!VmpInvalidateSingleGpaRange`
- 프로세스: `vmmemWSL` ← WSL2 가상머신의 메모리 백킹 프로세스

Windows 11 24H2 26100 빌드에서 WSL2 + 메모리 압축/large page 관련 이슈가 보고된 적이 있어, 누적 업데이트에서 완화될 가능성이 큽니다.

**조치**
- `wsl --update`로 WSL 커널 최신화
- Windows Update로 26100.8246 이후 빌드 적용, BIOS/UEFI 펌웨어 업데이트
- 반복 시 `.wslconfig`에 메모리 한도(`memory=`) 명시 + `pageReporting=false` 시도

## 시사점

블루스크린은 "충돌 모듈"이 곧 원인이 아닙니다. 0x9F의 표면 모듈은 Microsoft 프레임워크(`netadaptercx.sys`)였지만 실제 범인은 서드파티 NIC 드라이버였습니다. 덤프의 IRP 스택을 끝까지 따라가야 진짜 원인(벤더 드라이버·특정 빌드 조합)에 도달합니다.

---

*Orange Platform이 수집한 덤프·장치 정보를 기반으로 작성한 분석 리포트입니다.*
