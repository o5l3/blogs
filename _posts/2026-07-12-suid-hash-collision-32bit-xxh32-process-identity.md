---
title: "같은 SUID인데 lsass·svchost·Defender가 한 덩어리로 — 32비트 해시 충돌 전수 분석"
excerpt: "운영 sprocess 컬렉션 230만 도큐먼트를 전수 분석해, 서로 다른 프로세스가 같은 프로세스 식별자(SUID)로 묶이는 현상을 확인하고 그 근본 원인이 XXH32 32비트 출력 폭 부족에 의한 해시 충돌임을 코드 확인과 재측정으로 확정한 데이터 분석 기록."
category: tech
date: 2026-07-12
author: kimyh-orange
tags: [해시 충돌, XXH32, 프로세스 식별자, MongoDB, 데이터 분석, birthday paradox, Orange Platform]
---

## SUID는 같은데 안에 내용이 다른 case 분석

운영 sprocess 컬렉션 전수 분석 결과다.

**TL;DR**

- 151개의 SUID에서 "같은 SUID인데 다른 binary" 발생 확인
- 그중 96개는 ProcName까지 다름(= 완전히 다른 process)
- 영향력 큰 시스템 process들이 섞임(lsass, svchost, Defender, msedge 등)
- 근본 원인은 SUID 32비트 출력 폭 부족에 의한 hash collision. agent 산출 로직 결함 아님

---

## 부 1. 문제 정의

### 1.1 SUID의 정의

```
SUID = hash(PRunUID + FastHash + RunUID)
  PRunUID = 부모 process의 인스턴스 ID
  FastHash = 파일 기반 빠른 hash
  RunUID  = 자기 인스턴스 ID
```

### 1.2 이론상 보장

- 같은 SUID → 같은 (PRunUID, FastHash, RunUID) 조합
- 같은 FastHash → 같은 binary 파일(이론상)
- 따라서 같은 SUID = 같은 binary여야 함

### 1.3 실제로 확인된 문제

같은 SUID에 다른 binary들이 묶여 있다. ProcName, ProcPath, FastHash가 모두 다른 process들이 한 SUID로 식별된다.

---

## 부 2. 분석 방법

### 2.1 데이터

- 컬렉션: sprocess (총 ~230만 doc)
- 분석 시점: 2026-06-01

### 2.2 분석 식

전체 SUID에 대해 각 메타 필드의 distinct 값 count(None 제외):

```javascript
db.sprocess.aggregate([
  { $group: {
      _id: "$SUID",
      ProcName_set: { $addToSet: { $cond: [{ $ne: ["$ProcName", null] }, "$ProcName", "$$REMOVE"] } },
      ProcPath_set: { $addToSet: { $cond: [{ $ne: ["$ProcPath", null] }, "$ProcPath", "$$REMOVE"] } },
      FastHash_set: { $addToSet: { $cond: [{ $ne: ["$FastHash", null] }, "$FastHash", "$$REMOVE"] } },
      MD5_set:      { $addToSet: { $cond: [{ $ne: ["$MD5", null] }, "$MD5", "$$REMOVE"] } },
      n_docs:  { $sum: 1 },
      nodes:   { $addToSet: "$id" }
  }},
  { $project: {
      ProcName_distinct: { $size: "$ProcName_set" },
      ProcPath_distinct: { $size: "$ProcPath_set" },
      FastHash_distinct: { $size: "$FastHash_set" },
      MD5_distinct:      { $size: "$MD5_set" },
      n_docs: 1, n_nodes: { $size: "$nodes" }
  }}
])
```

그다음 ProcName / ProcPath / FastHash / MD5 중 distinct >= 2인 SUID만 추출한다.

---

## 부 3. 결과

### 3.1 총 영향 범위

| 분류 | SUID 수 | 비고 |
|---|---|---|
| 다른 binary 같은 SUID (전체) | 151 | distinct 값 2개 이상 |
| ㄴ ProcName도 다름 | 96 | 완전히 다른 process |
| ㄴ ProcName 같지만 hash만 다름 | 34 | Windows Update 등 정상 |
| 나머지(혼합) | 21 | 부분 변동 |

### 3.2 상위 10 — ProcName도 다른 가장 심각한 case

| 순위 | SUID | n_docs | n_nodes | ProcName 수 | ProcName 예시 |
|---|---|---|---|---|---|
| 1 | 1300863170 | 5,793 | 29 | 12 | MicrosoftEdgeUpdate, lsass, svchost, MpDefenderCore, GameBarFT, OneDrive … |
| 2 | 3225234998 | 5,120 | 29 | 11 | msedgewebview2, svchost, msedge, WmiPrvSE, taskhostw … |
| 3 | 1024486683 | 5,939 | 29 | 10 | conhost, msedgewebview2, taskhostw, svchost, OneDrive … |
| 4 | 2479526174 | 3,607 | 21 | 10 | CloudNotifications, taskhostw, ctfmon, svchost, msedgewebview2 … |
| 5 | 2461425704 | 2,937 | 18 | 10 | MpDefenderCore, msedge, taskhostw, VGAuthService, svchost … |
| 6 | 996392358 | 3,955 | 21 | 10 | MpDefenderCore, MicrosoftEdgeUpdate, OneDrive, svchost, taskhostw … |
| 7 | 2399520478 | 5,943 | 29 | 10 | ngentask, svchost, fontdrvhost, taskhostw, msedgewebview2 … |
| 8 | 2513829310 | 5,534 | 27 | 10 | MpDefenderCore, msedge, svchost, SecurityHealthService, taskhostw … |
| 9 | 3340322205 | 4,626 | 26 | 10 | MicrosoftEdgeUpdate, WmiPrvSE, ShellExperienceHost, msedgewebview2 … |
| 10 | 2182757250 | 4,005 | 20 | 9 | conhost, CloudNotifications, explorer, msedgewebview2, svchost … |

### 3.3 가장 심각한 SUID 1개 상세 — SUID = 1300863170

```
n_docs:  5,793
n_nodes: 29
ProcName distinct: 12
ProcPath distinct: 12
FastHash distinct: 12

ProcName 12개:
  - MicrosoftEdgeUpdate.exe
  - lsass.exe            ← Windows 핵심 시스템 process
  - svchost.exe
  - MpDefenderCoreService.exe
  - GameBarFTServer.exe
  - OneDrive.exe
  - + 6개
```

Windows 시스템 핵심 process(lsass)가 svchost, Defender, OneDrive와 같은 SUID로 묶여 있다.

---

## 부 4. 원인 추정 (초기 가설 · 부 9에서 검증/정정됨)

아래 4.1~4.3은 최초 진단 시점의 가설이다. 이후 agent 코드 확인 + 재측정으로 검증한 결과는 부 9에 있으며, 4.1 계산 오류와 4.2 FastHash 가설은 정정되었다.

### 4.1 hash collision만으로는 설명 불가 (→ 부 9.2에서 정정)

```
SUID가 32-bit 정수라 가정 시 hash space = 4,294,967,296
전체 SUID 수 = 33,338

Birthday paradox로 collision 발생 확률 ≈ 0.013%
→ 4~5개 정도 발생 가능

그러나 실제 발견 = 151개 (그중 ProcName 다른 게 96)
→ collision만으로는 설명 안 됨
```

### 4.2 agent SUID 산출 로직 결함 가능성 (→ 부 9.1에서 반증)

- 같은 SUID에 FastHash가 12개 다른데 SUID가 같다 → FastHash가 실제로는 hash input에 안 들어간 것 같음
- 또는 PRunUID + RunUID만으로 계산되는 것 아닌가

---

## 부 5. 영향

### 5.1 시스템 영향

| 시스템 | 영향 |
|---|---|
| sprocess_hourly cron (SUID 단위 group) | ❌ 다른 process 합쳐서 저장 |
| sprocess_daily cron | ❌ 동일 |
| sprocess/list API (raw 반환) | ❌ 다른 process doc 섞임 |
| listView (SUID ranking) | ❌ 잘못된 자원 합산 |
| detail view (ProcName 라벨) | ❌ 12개 ProcName 중 1개만 표시 |

### 5.2 비즈니스 영향

상위 30 SUID 모두 n_docs >= 3,000, n_nodes >= 18 — 회사 자원 사용량 ranking 상위에 있는 process들이다. 예를 들어 SUID=1300863170(5,793 docs, 29 nodes) = lsass + svchost + Defender + OneDrive … 합산이라 자원 사용량이 매우 크게 잡히고 listView의 top ranking에 표시되지만, ProcName 라벨은 그중 하나만(예: "svchost.exe") 붙는다. 결과적으로 보고를 받는 사람은 "svchost.exe가 회사 자원을 많이 쓴다"고 잘못 이해하게 된다.

---

## 부 6. 권장 대응

### 6.1 단기 — analytics 측 우회

aggregation 그룹 키 변경 검토:

```javascript
// 현재 (잘못된 그룹핑)
_id: { SUID: "$SUID", hour: "$hour" }

// 대안 1 — ProcPath 단위 (가장 안정적)
_id: { ProcPath: "$ProcPath", hour: "$hour" }

// 대안 2 — (ProcPath, FastHash) 조합
_id: { ProcPath: "$ProcPath", FastHash: "$FastHash", hour: "$hour" }

// 대안 3 — (ProcName, ProcPath) 조합
_id: { ProcName: "$ProcName", ProcPath: "$ProcPath", hour: "$hour" }
```

### 6.2 중장기 — agent 측 SUID 산출 로직 점검

- SUID가 정말 hash(PRunUID + FastHash + RunUID)로 계산되는지 코드 확인
- 32-bit → 더 넓은 hash로 변경 검토
- FastHash가 실제로 input에 포함되는지 확인

---

## 부 9. 원인 확정 및 후속 (2026-07-10 · 코드 확인 + 재측정)

부 4는 가설 단계였다. agent 코드 확인과 운영 DB 재측정으로 원인을 확정했다. 아래는 부 4 가설들의 검증 결과와 정정이다.

### 9.1 결론 — 32비트 출력 폭 부족에 의한 hash collision. agent 산출 로직 결함 아님

- 코드 확인: `SUID = XXH32(to_string(PRunUID) + to_string(FastHash) + to_string(RunUID), seed=0x3171)`, 반환형 `UID = uint32_t`.
- FastHash는 정상적으로 hash input에 포함되어 있다 → 부 4.2 "FastHash 누락" 가설은 반증.
- (PRunUID, FastHash, RunUID) 입력 조합 자체는 서로 다른데, XXH32가 결과를 32비트로 접으면서 서로 다른 입력이 같은 SUID로 충돌한 것이다. 즉 결함이 아니라 **출력 공간이 좁아서 생긴 구조적 충돌**이다.

### 9.2 부 4.1 birthday 계산 정정

원본의 "collision 확률 ≈ 0.013% → 4~5개"는 계산 오류다.

- 올바른 기대 충돌 수 ≈ N² / (2 · 2³²). 실제 입력 조합 수 N ≈ 39,120 → 기대 약 178개.
- 운영 DB 재측정: distinct (PRunUID, FastHash, RunUID) 입력 조합 39,120 vs distinct SUID 38,426 → 손실 694, 충돌에 얽힌 SUID 117개.
- 즉 관측된 충돌은 collision만으로 설명 가능하다(원본 "collision만으로는 설명 안 됨"은 틀림). 기대치(178)보다 실측(694)이 큰 것은 입력 분포가 균등하지 않아 특정 값에 몰리는 클러스터링 때문이다.

### 9.3 측정 함정 — BSON 타입 혼재

재측정 시 주의: SUID가 컬렉션에 Int32와 NumberLong이 혼재되어 저장돼 있다. group by SUID 시 같은 논리값이 타입 차이로 분리되어 카운트가 왜곡된다.

- 보정: NumberLong 쪽은 low + 2³²로 unsigned 32비트 값을 복원한 뒤 비교한다.

### 9.4 왜 단순히 64비트로 못 올리나

- SUID는 애초 64비트 unsigned로 설계했으나, MongoDB는 unsigned 64가 없고(int64만 존재), 웹의 JavaScript는 안전 정수 한계가 2⁵³이라 32비트로 낮췄던 것이다.
- 따라서 "32→64비트" 단순 복귀는 불가. 대신 **49비트**(최상단 마커 1비트 + 6바이트)로 재설계한다 → JS 2⁵³ 안전, MongoDB NumberLong(int64) 안전.

### 9.5 해결 = SUID 재설계

근본 해결은 analytics 우회(부 6.1)가 아니라 SUID 재정의다.

- 49비트 재설계 비트 배치: `[48] 마커 1 | [47:31] self-role(RunUID) 17 | [30:16] parent-role(PRunUID) 15 | [15:2] self-binary(FastHash) 14 | [1] session | [0] reserved`.
- RunUID를 문자열 통짜 해시가 아니라 **의미 기반 토큰화**(경로 `[FILE]`/`[PATH]`, 숫자 `[NUM]`, GUID 레지스트리 조회, 플래그명 등) 후 Fibonacci 폴딩으로 17비트 압축한다.
- 부모 차원 유지(PRunUID) — webview2처럼 UI 전담 프로세스가 누구에 의해 실행됐는지 구분하기 위함이다.

---

이 분석의 교훈은 명확하다. 식별자를 해시 한 방으로 압축할 때 **출력 폭이 곧 충돌 확률**이며, 32비트(약 43억 공간)라도 입력 조합이 수만 개면 birthday paradox로 충돌이 반드시 나타난다는 것이다. 특히 그 식별자가 자원 집계의 group key로 쓰이면, 충돌은 곧 "서로 다른 프로세스의 자원이 한 덩어리로 합산"되는 데이터 오염으로 이어진다. 저장소(MongoDB int64)와 표현 계층(JavaScript 2⁵³)의 정수 한계를 동시에 만족하는 폭을 먼저 정하고, 해시가 아니라 의미 기반 비트 배치로 식별자를 설계하는 것이 근본 해법이다.

*Orange Platform 운영 데이터를 전수 분석해 프로세스 식별자 해시 충돌의 원인을 확정한 분석 리포트입니다.*
