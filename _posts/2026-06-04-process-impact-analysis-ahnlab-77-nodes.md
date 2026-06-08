---
title: "신규 프로그램 도입 영향도 분석 — AhnLab 980개 프로세스가 회사 PC 77대에 미친 자원·증상 영향 측정"
excerpt: "한 고객사가 '신규 프로그램 도입 전후 리소스 사용 비교'를 요청했습니다. 기존 모니터링 솔루션이 전체 시스템 부하만 보던 것과 달리, Orange Platform은 프로세스 단위 수집 데이터를 활용해 회사 PC 77대에서 AhnLab 제품군 980개 SUID가 실제로 얼마나 자원을 썼고 어떤 증상을 일으켰는지를 정량 측정했습니다. 3레벨(회사 → 프로세스 → 패치) UI와 MongoDB 집계 쿼리, 실제 측정값을 정리합니다."
category: report
date: 2026-06-04
author: kim-tigerj
tags: [프로세스 영향도, 자원 분석, AhnLab, Windows Update, MongoDB Aggregation, Orange Platform]
---

## 1. 배경 — 왜 이 분석이 생겨났나

- 한 고객사 요청: "신규 프로그램 도입 전과 도입 후 리소스 사용 비교"
- 기존 모니터링 솔루션의 한계 — 전체 시스템 부하만 수집하므로 "이 프로그램 때문인지"를 **추정만** 할 수 있음
- Orange Platform 차별점 — 프로세스 단위로 수집하므로, 해당 프로세스가 회사 PC들에 미친 영향을 **직접 측정·시각화**할 수 있음. 이게 핵심.

## 2. 무엇을 구하나 — 목표

| 분류 | 구하는 값 |
|---|---|
| 자원 영향도 | 프로세스별 CPU / Memory / IO / Handle 사용률 |
| 증상 영향도 | 강제종료 / TCP·IP 거부 / 부팅지연 / DNS 등 |
| 영향 범위 | 몇 개 노드(PC)에 퍼졌나 |
| 시간축 비교 | 도입 전 vs 도입 후 자원 변화 (고객 요청 핵심) |
| 분석 단위 | 단일 프로세스(SUID) → 회사(CompanyName) → 패치 스토리라인 |

자원 사용률은 per-instance — 인스턴스 1개가 전체 코어 대비 몇 %를 점유했는가입니다.

## 3. 어떻게 했나 — 접근 / 과정

### 데이터 소스

- **`sprocess`** — 프로세스별 자원·증상 (1시간 집계)
- **`filelist`** — 파일 출처 체인 (`HostUrl` / `ReferrerUrl`) — 패치 추적용

### 자원 정량화

per-instance 자원 사용률 식을 별도 설계했습니다. base-only(부팅 누적) 데이터가 비율을 오염시키는 케이스 방어 포함.

### 단계적 확장

| 단계 | 대상 | 규모 |
|---|---|---|
| 1차 | 단일 프로세스 (`mupdate2.exe`, SUID 3402877169) | 1개 |
| 2차 | 회사 전체 (AhnLab, Inc.) | 980 SUID / 28 제품 |
| 2차 | Windows 보안패치 스토리라인 | `filelist.HostUrl` 체인 |

## 4. 무엇을 보여주나 — 시각화

3레벨 구조 (서로 순환 이동):

| 레벨 | 페이지 | 주인공 |
|---|---|---|
| 1 | 회사 영향도 | CompanyName (예: AhnLab, Inc.) |
| 2 | 프로세스 영향도 | 단일 SUID (예: `mupdate2.exe`) |
| 3 | 패치 스토리라인 | Windows Update 이벤트 |

표시 지표:

- 자원 추이 시계열 — 도입 시점 기준 전/후 비교
- 증상 분포 (TEN별)
- 영향 노드 수 / 제품군 구성
- 패치가 교체한 파일 트리 (`HostUrl` 체인)

## 5. 어떤 결과를 만드나 — 가치

- "이 프로그램이 회사 PC에 실제로 얼마나 부담을 줬나"를 **정량 제시**
- 도입 전후 자원 변화를 **데이터로 증명** (추정 아님)
- 무거운 프로세스·증상 유발 프로세스를 자동 식별
- 영업 포인트 — 타 솔루션은 전체 부하로 추정만, Orange는 파일·프로세스 단위로 증명

## 6. 한계 / 주의

- 자원 식 정확도 검증 진행 중 (ground truth 대조)
- base-only 과도기 데이터 — Agent 측 송신 중단 작업 병행 중
- `filelist.HostUrl` / `Signer` 오염 가능성 — 패치 체인 분석 시 주의 필요

---

## 부록 A. 3레벨 UI 설계

### 레벨 1: 회사 영향도

- 헤더 — 회사명, 프로세스 수, 제품 수, 영향 노드
- 요약 카드 6개 — 증상 건수, 영향 노드, CPU, IO, Memory, Handle
- 스트림 차트 — TEN별 stacked area (TCP/IP, 기타) + 도트 레인 2레이어
- 주요 증상 목록 / 제품군별 구성 / 주요 프로세스 TOP 20 → 클릭 시 레벨 2

### 레벨 2: 프로세스 영향도

- 단일 SUID 자원·증상 추이. 도입 시점 기준 전/후 비교

### 레벨 3: 패치 스토리라인

- 헤더 — 패치 빌드 번호, 노드명, 교체 파일 수, 영향 프로세스 수
- `HostUrl` 체인 기반 트리 — `svchost.exe`(루트) → `WindowsUpdateBox.exe` → 시스템 파일 12개 / `UpdatePlatform` → Defender / `Windows-KB890830` → `MRT.exe` 등
- 각 파일에 버전·크기·경로, 클릭 시 레벨 2로 이동

### UI 원칙

- 데이터에 없는 분류/용어 임의 생성 금지 ("대형 업데이트", "기타" 등)
- `HostUrl` 체인 그대로 트리 구성. Whitelist 증상 제외(노이즈)
- 회색 금지 — 선명·또렷·날렬한 톤. 볼드 과다 금지
- Orange 브랜드색(`#ea580c`)은 강조 용도로만

---

## 부록 B. AhnLab 회사 단위 실데이터

| 항목 | 값 |
|---|---|
| SUID | 980개 |
| ProductName | 28개 |
| 영향 노드 | 77 / 94 (81.9%) |
| CPU 평균 | 4.29% (전체 7.55% 대비 56.8%) |
| Memory 평균 | 39.2 MB |
| I/O 평균 | 51.3 MB/s |
| Handle 평균 | 286 |
| 활동 기간 | 2025-10-27 ~ 2026-04-16 |

### 주요 ProductName (노드 수)

| ProductName | 노드 | SUID |
|---|---:|---:|
| ASD Framework | 75 | 105 |
| MUpdate2 | 71 | 27 |
| V3Restore | 68 | 4 |
| Smart Update Utility | 68 | 9 |
| AhnLab V3 Endpoint Security 9.0 | 45 | 57 |
| AhnLab MDS Agent | 44 | 595 |
| AhnLab Safe Transaction | 25 | 31 |

### 증상 분포 (TEN별, Whitelist 제외)

| TEN | 건수 | 노드 |
|---|---:|---:|
| TCP/IP | 77,812 | 47 |
| NoCodesign | 283 | 3 |
| Codesign | 264 | 14 |
| DNS | 107 | 28 |
| 부팅지연 | 34 | 22 |
| CPU점유 | 23 | 14 |
| 강제종료 | 20 | 11 |
| 비정상종료 | 18 | 15 |

> 회사 PC 94대 중 **77대(81.9%)** 에서 AhnLab 제품군이 활동했고, 그중 TCP/IP 거부 증상이 47대에 77,812건 누적됐습니다.

---

## 부록 C. Windows 보안패치 스토리라인

### 추적 방법

- `filelist.HostUrl`이 `svchost.exe` 또는 `SoftwareDistribution` 경로인 파일 = Windows Update가 생성
- 그 파일의 `HostUrl`로 다시 검색 → 패치 패키지에서 파생된 파일 추적
- 트리 구조로 시각화

### 실데이터 (한 노드 기준)

- `WindowsUpdateBox.exe` (Build 22621.6199)가 교체한 시스템 파일 — `ntoskrnl.exe`, `services.exe`, `wininit.exe`, `winlogon.exe`, `explorer.exe`, `userinit.exe`, `sihost.exe`, `LockApp.exe` 등 12개
- `UpdatePlatform` (SSU KB5068070) → Defender — `MsMpEng.exe` (4.18.26010.5 → 26030.3011), `MpDefenderCoreService.exe` 등
- `Windows-KB890830` → `MRT.exe` (218 MB)
- `svchost` 직접 — `SecurityHealthSetup`, .NET Runtime, VS Update, AM_Delta

> ⚠ Chrome/Zoom/Whale 등 서드파티 앱이 `WindowsUpdateBox.exe` `HostUrl`로 잡히는 현상을 별도 관찰 중. Feature Update가 OS 재구축 시 기존 앱 파일을 다시 쓰면서 발생.

---

## 부록 D. `filelist` 출처 추적 필드

| 필드 | 의미 |
|---|---|
| `HostUrl` | 이 파일을 생성/추출한 프로세스·설치본 경로 |
| `ReferrerUrl` | 이 파일이 추출된 원본 패키지(cab/zip/exe) 경로 |
| `FSUID` | 이 파일을 만들거나 로딩한 프로세스의 SUID |
| `FAMILY` | 부모 프로세스 체인 (`FAMILY.data` 배열) |

시간 필드 주의 — `CreateTime`은 덮어쓰면 이전 생성일을 물려받아 부정확합니다. `EventTime`(Agent 수집 시각)이 근사치이나 반드시 같은 노드(`id`)로 필터해야 합니다.

⚠ 노드 식별자는 반드시 `id` 사용 (`ticket`은 노드 식별자가 아님).

---

## 부록 E. 데이터 조회 쿼리

### 회사 단위 ProductName 목록

```javascript
db.sprocess.aggregate([
  { $match: { CompanyName: "AhnLab, Inc." } },
  { $group: {
      _id: "$ProductName",
      nodes: { $addToSet: "$id" },
      suids: { $addToSet: "$SUID" }
  }},
  { $project: {
      nodeCount: { $size: "$nodes" },
      suidCount: { $size: "$suids" }
  }},
  { $sort: { nodeCount: -1 } }
])
```

### `filelist` 패치 스토리라인 (`HostUrl` 체인)

```javascript
// SoftwareDistribution 경로 파일 (WU 다운로드)
db.filelist.find(
  { FilePath: /SoftwareDistribution/i },
  { FileName:1, HostUrl:1, ReferrerUrl:1, FSUID:1,
    EventTime:1, Signer:1, id:1, _id:0 }
).sort({ CreateTime: -1 })

// HostUrl 이 특정 패키지인 파일 (패키지에서 파생)
db.filelist.find(
  { HostUrl: /SoftwareDistribution/i },
  { FileName:1, HostUrl:1, ReferrerUrl:1,
    EventTime:1, Signer:1, _id:0 }
).sort({ CreateTime: -1 })
```

---

*Orange Platform 프로세스 영향도 분석 리포트입니다. 한 고객사의 "신규 프로그램 도입 전후 자원 비교" 요청에서 시작해, 회사 → 프로세스 → 패치의 3레벨 시각화로 확장한 작업의 설계·실측 기록입니다.*
