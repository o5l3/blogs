---
title: "Windows 커널 freeze 사후 분석 — NMI 키보드 트리거로 메모리 덤프 강제 수집"
excerpt: "BSOD 없이 화면 그대로 멎은 시스템에서 커널 원격 디버깅 Break처럼 강제 BugCheck를 유발해 MEMORY.DMP를 수집하는 CrashOnCtrlScroll 레지스트리 설정과 WinDbg 분석 절차를 정리합니다."
category: tech
date: 2026-06-11
author: kim-tigerj
tags: [Windows Kernel, BSOD, NMI, WinDbg, Crash Dump, Orange Platform]
---

## 개요

커널 영역에서 시스템이 멎었을 때(BSOD 없이 화면 그대로 정지), 사전 설정된 NMI 키보드 트리거로 강제 BugCheck를 유발해 전체 메모리 덤프(MEMORY.DMP)를 수집한다. Agent 커널 드라이버 freeze 사후 분석에 활용한다.

한 노트북 환경에서 화면 그대로 얼어붙은 사례 — 마치 PC를 연결해서 커널 원격 디버깅 중 Break를 걸은 것 같은 상태. BSOD가 뜨지 않으므로, 강제로 BSOD를 만드는 설정을 사전에 적용해 둔다. 본 글의 `enable-nmi.reg`(`enable-nmi-ps2.reg` + `enable-nmi-usb.reg` 통합)를 실행 후 리부팅하면 된다.

## 동작 원리

키보드 드라이버(`kbdhid` 또는 `i8042prt`)에 `CrashOnCtrlScroll` 옵션을 활성화해두면, **오른쪽 Ctrl을 누른 상태에서 Scroll Lock을 두 번 누를 때** 키보드 드라이버가 NMI를 시뮬레이트한다. 시스템은 이를 받아 `MANUALLY_INITIATED_CRASH (0xE2)`로 BugCheck하고, 사전 설정된 덤프 종류(전체/커널/스몰)에 따라 메모리 덤프 파일을 작성한다.

핵심은 **사전 설정 + 재부팅이 끝나 있어야** 멎었을 때 사용 가능하다는 점. 멎은 다음에는 설정할 수 없다.

## 레지스트리 설정

| 키 경로 | 값 이름 | 타입 | 값 | 비고 |
|---|---|---|---|---|
| `HKLM\SYSTEM\CurrentControlSet\Services\kbdhid\Parameters` | `CrashOnCtrlScroll` | DWORD | 1 | USB / 노트북 내장 키보드 |
| `HKLM\SYSTEM\CurrentControlSet\Services\i8042prt\Parameters` | `CrashOnCtrlScroll` | DWORD | 1 | PS/2 키보드 (구형 데스크탑) |
| `HKLM\SYSTEM\CurrentControlSet\Control\CrashControl` | `CrashDumpEnabled` | DWORD | 1 | 1=Complete, 2=Kernel, 3=Small(64KB), 7=Automatic |
| `HKLM\SYSTEM\CurrentControlSet\Control\CrashControl` | `AlwaysKeepMemoryDump` | DWORD | 1 | 디스크 여유 부족 시 자동 삭제 방지 |

노트북 환경은 대부분 `kbdhid` 한 가지만 적용하면 충분하다. PS/2는 구형 데스크탑·일부 산업용 PC에 해당한다.

## 적용 및 사용 방법

- 환경에 맞는 `.reg` 파일 더블 클릭 → "예" → "확인"
- 재부팅 (필수. 키보드 드라이버 초기화 시점에 옵션을 읽음)
- 시스템이 멎으면 **오른쪽 Ctrl을 누른 채 Scroll Lock을 두 번 빠르게** 타이핑
- 자동으로 청색 화면 → 메모리 덤프 작성 → 재부팅
- `C:\Windows\MEMORY.DMP` (또는 `C:\Windows\Minidump\*.dmp`) 확인

> ⚠️ 노트북에 Scroll Lock 키가 없거나 Fn 조합으로 묻혀 있는 경우가 많다. 평소 동작을 미리 한 번 확인해두는 게 안전하다 (모델별로 `Fn+K`, `Fn+C`, `Fn+S` 등 상이).

## 덤프 분석

WinDbg로 `C:\Windows\MEMORY.DMP` 열기.

| 명령 | 용도 |
|---|---|
| `!analyze -v` | BugCheck 컨텍스트 + 의심 모듈 자동 분석 |
| `!locks` | 멎음 원인이 락 경합인지 확인 |
| `!thread`, `!process 0 0` | 멎음 시점 스레드/프로세스 상태 |
| `lm m Meter`, `lm m yagent*` | Agent 드라이버 로드 상태/버전 |
| `!drvobj <name>` | 특정 드라이버 객체 추적 |

`MANUALLY_INITIATED_CRASH (0xE2)`로 진입한 스레드 자체는 키보드 드라이버 → `KeBugCheck` 콜스택이 정상이다. 실제 freeze 원인은 **멎어 있던 다른 CPU의 콜스택**에서 찾아야 한다 (`~* kb`).

## 활성화 .reg 파일

환경별 `.reg` 파일을 더블 클릭 적용 → 재부팅.

**USB / 내장 키보드 (`enable-nmi-usb.reg`)**

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\kbdhid\Parameters]
"CrashOnCtrlScroll"=dword:00000001

[HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\CrashControl]
"CrashDumpEnabled"=dword:00000001
"AlwaysKeepMemoryDump"=dword:00000001
```

**PS/2 키보드 (`enable-nmi-ps2.reg`)**

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\i8042prt\Parameters]
"CrashOnCtrlScroll"=dword:00000001

[HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\CrashControl]
"CrashDumpEnabled"=dword:00000001
"AlwaysKeepMemoryDump"=dword:00000001
```

## 참고

- Microsoft Learn — Forcing a System Crash from the Keyboard
- BugCheck `0xE2` `MANUALLY_INITIATED_CRASH`

---

*Orange Platform 운영 중 발생한 커널 freeze 사후 분석 트러블슈팅 리포트입니다.*
