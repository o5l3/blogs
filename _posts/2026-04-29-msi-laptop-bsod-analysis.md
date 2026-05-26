---
title: "노트북 블루스크린 두 건의 진짜 원인 — Intel 이더넷 D3 전환(0x9F)과 WSL2 메모리(0x7E) windbg 분석"
excerpt: "같은 노트북에서 4시간 47분 간격으로 터진 두 종류의 블루스크린을 windbg로 끝까지 추적했습니다. 하나는 Intel NIC 드라이버(e1dnexpress.sys)의 D3 절전 전환 실패(DRIVER_POWER_STATE_FAILURE 0x9F), 다른 하나는 Windows 11 24H2의 WSL2 메모리 백킹(vmmemWSL) 커널 어서션(0x7E)이었습니다. !irp·lmvm 출력과 원인 판정 과정을 그대로 공개합니다."
category: report
date: 2026-04-29
author: kim-tigerj
tags: [블루스크린, BSOD, windbg, 드라이버, NetAdapterCx, WSL2, Windows11, Orange Platform]
---

## 개요

한 노트북에서 최근 블루스크린 4건이 발생했고, Agent가 두 유형으로 집계했습니다. 덤프를 windbg로 분석해 각각의 **표면 모듈이 아닌 진짜 원인**을 짚었습니다.

---

## ① DRIVER_POWER_STATE_FAILURE (0x9F) — Intel 이더넷 D3 전환 실패

- **의미**: 디바이스 객체가 전원 IRP를 제한 시간 안에 완료하지 못해 시스템이 강제 종료
- **충돌 모듈**: `netadaptercx.sys` (Microsoft NetAdapterCx 프레임워크 — 네트워크 미니포트의 베이스)
- **충돌 위치**: `NxNblDatapath::SetRxHandler+30` (nxnbldatapath.cpp:92)
- **시각**: 2026-04-29 13:33 (뒤의 WSL 크래시보다 4시간 47분 전)

표면 모듈은 Microsoft 프레임워크지만, windbg `lmvm`으로 실제 적재된 드라이버를 보면 범인이 드러납니다.

```
3: kd> lm m e1d*
start             end                 module name
fffff802`57a60000 fffff802`57c05000   e1dn   (no symbols)
    Image path: \SystemRoot\System32\DriverStore\FileRepository\e1dn.inf_amd64_f231293945024b44\e1dn.sys
    Image name: e1dn.sys
    Timestamp:  Thu Sep 12 23:43:57 2024 (66E2FE2D)
```

- **디바이스**: `PCI\VEN_8086&DEV_550F` — Intel 이더넷 컨트롤러(최신 칩셋 내장 NIC)
- **서비스명**: `e1dnexpress` — Intel의 NetAdapterCx 기반 이더넷 드라이버
- **빌드**: 2024년 9월 — Windows 11 24H2(26100)에서 D3 전환 시 RX 핸들러 분리 실패로 0x9F를 일으키는 사례가 보고된 버전

### IRP 분석

```
3: kd> !irp ffff920fc6603920
Irp is active with 8 stacks 7 is current
>[IRP_MJ_POWER(16), IRP_MN_SET_POWER(2)]
   0 e1 ffff920fc5ca9c60 ... fffff802bd55b320  Success Error Cancel pending
       \Driver\e1dnexpress   nt!PopRequestCompletion
       Args: 00000000 00000001 00000004 00000000
```

흐름을 풀면:
1. 시스템이 Intel 이더넷 NIC에 "D3로 내려가라(SetPower → D3)" IRP를 보냄
2. `e1dn.sys`가 이 IRP를 받아놓고 **시한 내에 완료하지 못함**
3. 내부적으로 NetAdapterCx의 RX 핸들러 분리 단계(`SetRxHandler` → rundown wait)에서 멈춤
4. Windows가 타임아웃을 감지해 0x9F 발생

### 조치

- **NIC 드라이버 업데이트** — 장치 관리자에서 어댑터 제조사/모델 확인 후 벤더 사이트 최신본 적용(Windows Update 자동본보다 벤더본 권장)
- **임시 회피(효과 큼)** — 장치 관리자 → 네트워크 어댑터 → 속성 → 전원 관리 → "전원을 절약하기 위해 컴퓨터가 이 장치를 끌 수 있음" **해제**

---

## ② SYSTEM_THREAD_EXCEPTION_NOT_HANDLED (0x7E) — WSL2 메모리

최근 처음 등장한 유형입니다.

- **예외**: `STATUS_ASSERTION_FAILURE (0xC0000420)` — 커널 내부 어서션 실패
- **충돌 모듈**: `ntkrnlmp.exe` (Windows 11 24H2, build 26100.8246)
- **충돌 함수**: `nt!VmpInvalidateSingleGpaRange+0x44`
- **프로세스**: `vmmemWSL` ← WSL2 가상머신의 메모리 백킹 프로세스

### 원인 후보

- **Windows 11 24H2 알려진 버그**: 26100 빌드에서 WSL2 + 메모리 압축/large page 관련 이슈가 몇 차례 보고됨. 8246은 비교적 최신 패치라 다음 누적 업데이트에서 수정됐을 가능성.
- **WSL2 커널 버전 불일치**: `vmmemWSL`이 관여한 만큼 WSL 자체 업데이트로 완화되는 경우가 있음.

### 조치

- `wsl --update` → WSL 커널 최신화
- Windows Update 확인(`winver`로 26100.8246 이후 빌드 있으면 적용)
- BIOS/UEFI 펌웨어 업데이트
- 반복 시 임시 회피: `.wslconfig`에 메모리 한도(`memory=`) 명시 + `pageReporting=false`

---

## 시사점

블루스크린은 "충돌 모듈"이 곧 원인이 아닙니다. 0x9F의 표면 모듈은 Microsoft 프레임워크(`netadaptercx.sys`)였지만 실제 범인은 서드파티 NIC 드라이버(`e1dnexpress.sys`)였습니다. **덤프의 IRP 스택을 끝까지 따라가야** 진짜 원인(벤더 드라이버 × 특정 OS 빌드 조합)에 도달합니다.

---

*Orange Platform이 수집한 덤프·장치 정보를 기반으로 작성한 분석 리포트입니다.*
