---
title: "시스템 성능 정보에 디스크·네트워크 송수신 지표 추가 — 프로세스 합산 근사에서 OS 직접 API 수집으로"
excerpt: "하나로 묶여 있던 시스템 I/O를 디스크(물리)와 유선·무선 네트워크의 읽기·쓰기 6개 지표로 분리하고, 프로세스별 값 합산으로 근사하던 시스템 전체 지표를 GetIfTable2·IOCTL_DISK_PERFORMANCE 같은 OS 직접 API로 바꿔 정확도를 높인 에이전트 구현 기록."
category: tech
date: 2026-07-01
author: kim-tigerj
tags: [시스템 성능, 디스크 I/O, 네트워크 I/O, GetIfTable2, IOCTL_DISK_PERFORMANCE, Windows, Orange Platform]
---

## 개요

에이전트가 주기적으로 수집해 서버·트레이로 보내는 "시스템 전체 성능 정보"에서, 그동안 하나로 묶여 있던 I/O를 **디스크(물리)**와 **네트워크(유선/무선)**의 읽기·쓰기로 분리해 추가 수집·전송한다. 함께, 시스템 전체 지표(디스크·네트워크·핸들) 수집을 한 곳(`SystemStat`)으로 일원화한다. 기존에는 프로세스별 값을 합산해 시스템 값을 근사했으나, 이번에 OS 직접 API로 바꿔 정확도를 높였다.

## 서버로 추가되는 데이터

기존 시스템 부하 정보(CPU / 메모리 / I/O / 핸들)에 더해 아래 6개 지표가 새로 전송된다.

| 키 | 의미 | 단위 |
|---|---|---|
| DiskRead | 물리 디스크 읽기 속도 | KB/s |
| DiskWrite | 물리 디스크 쓰기 속도 | KB/s |
| WiredRead | 유선랜 수신 속도 | KB/s |
| WiredWrite | 유선랜 송신 속도 | KB/s |
| WifiRead | 무선랜 수신 속도 | KB/s |
| WifiWrite | 무선랜 송신 속도 | KB/s |

전송 단위는 KB/s로 통일한다. 표시 단계(트레이/매니저)에서 값 크기에 따라 KB/s → MB/s → GB/s로 자동 환산한다.

기존 "I/O"는 논리 I/O(파일 캐시·네트워크·디바이스 포함)라 그대로 유지한다. 디스크/네트워크는 그것과 별개의 물리 단위 지표다.

## 전달 경로 (세 곳 모두 동일 값)

- **로컬 DB** (`summary.cdb`의 `sdata` 테이블) — 시스템 부하 시계열(OHLC 캔들). 신규 type(DiskRead 등)으로 행이 쌓인다. 테이블 스키마 변경 없음: type 컬럼이 자유 문자열이라 새 지표는 행만 추가된다.
- **서버** (MQTT 시스템 정보 패킷) — `get.SYSTEM` / `GLOBAL` 응답을 만드는 `SetSystemResource`에 6개 필드(value/unit) 추가.
- **트레이** (orange.user.exe, IPC) — `set.HEALTH` 응답(HEALTH)에 6개 필드 추가.

## 수집 방식 (시스템 전체, OS 직접 API)

**네트워크**: `GetIfTable2`로 NIC별 누적 송수신 바이트를 읽어 직전값과의 델타로 속도를 구한다. 물리 NIC만(HardwareInterface 플래그) 합산하여 VPN·VMware·Hyper-V 등 가상 어댑터의 이중 계상을 막는다. 유선(이더넷)과 무선(WiFi)을 분리해 집계한다.

**디스크**: `IOCTL_DISK_PERFORMANCE`로 물리 드라이브별 누적 읽기/쓰기 바이트를 합산·델타. (응답시간·활성 시간 %·IOPS 등도 함께 수집해 향후 활용 여지를 확보)

**일원화**: 기존에는 프로세스별 값을 합산해 시스템 값을 근사했다. 이 방식은 폴링 사이에 떴다 죽은 단명 프로세스나 커널 I/O를 놓쳐 과소 계상된다. 이번에 시스템 전체값(디스크·네트워크·핸들)을 `SystemStat`에서 OS 직접 API로 수집하도록 바꿔 정확도를 높였고, `ProcessStat`은 프로세스별(sprocess) 집계만 담당하도록 정리했다.

## 트레이 표시 (orange.user.exe)

트레이 툴팁의 "메모리"와 "I/O" 사이에 6행 추가: 디스크(R) / 디스크(W) / 유선랜(R) / 유선랜(W) / 무선랜(R) / 무선랜(W).

값은 크기에 따라 KB/s·MB/s·GB/s 자동 단위, ▲(증가, 빨강)/▼(감소, 녹색) 트렌드 표시. User 버전 v1.6.240.50.

## 변경 범위

- **Agent (yagent21)**: `SystemStat`에 `GetNetworkIO` / `GetDiskIO` 추가, 시스템 상태 구조체(Stat3) 확장, `SetSystemResource`·HEALTH 응답에 6개 필드, `sdata` 적재(AddSummary) 6건 추가. `ProcessStat`에서 시스템 합산 코드(핸들·디스크·논리 I/O) 제거.
- **Agent (User / 트레이)**: 툴팁 6행 표시 + 자동 단위·트렌드.

## 참고

이 6개 지표가 매니저(웹) 화면에 보이려면 서버 service·매니저 측에서 신규 키(DiskRead 등)를 파싱·표시하는 작업이 별도로 필요하다(에이전트 전송까지는 완료).

*Orange Platform 에이전트의 시스템 성능 수집 정확도 개선 기록입니다.*
