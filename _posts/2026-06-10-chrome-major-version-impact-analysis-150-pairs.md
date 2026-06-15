---
title: "Chrome 메이저 버전별 PC 영향 분석 — 45 PC × 9 메이저 = 150 (PC × 메이저) 쌍 단위 영향도 측정"
excerpt: "한 회사 chrome.exe 45 PC × 12,660 sprocess docs × 185일 데이터를 (PC × 메이저) 쌍을 단일 데이터 단위로 통일해 사고·자원 영향을 재구성했습니다. 회사 합산·날짜 합산 산출을 폐기하고, 메이저 도입 직후 14일(post-14d) Core 4 사고 카운트와 pre/post Δ 산포도, OS × 메이저 매트릭스까지 정리한 v6.3 대시보드 설계 리포트입니다."
category: report
date: 2026-06-10
author: kimyh-orange
tags: [Chrome, Impact Analysis, BSOD, Process Analysis, MongoDB Aggregation, Orange Platform]
---

# 프로세스 영향도 대시보드 v6.3 — per-PC × 메이저 통일

분석 대상: 한 고객사 chrome.exe mockup 데이터(`v6_mockup/index.html`, ~206 KB). v6.2 → v6.3 핵심 변경은 §3·§4·§6 모두 **(PC × 메이저) 쌍**을 데이터 단위로 통일한 것. 회사 합산 / 날짜 합산 산출은 폐기했다.

## 1. 한 줄 요약

chrome.exe **45 PC × 12,660 sprocess docs × 185일** 분석 → 8 섹션 + Hero + ★ 메인 차트. (PC × 메이저) **150 쌍** 단위로 모든 영향 지표 산출.

## 2. v6.2 → v6.3 변경

| 위치 | v6.2 | v6.3 |
|---|---|---|
| ★ 메인 시간축 | 자원+증상+메이저 마커 | 자원+증상 (메이저 마커 제거) |
| §3 사고율 | 메이저 노출 윈도우 합산/PC×일 | (PC×메이저) post 14d Core 4 strip plot |
| §3 헤더 | "가장 좋은 버전?" | "메이저 버전별 영향" (권고 톤 제거) |
| §3 메이저 timeline | 회사 첫 등장 1점 | 폐기 (날짜 합산) |
| §4 산포도 | 없음 | 신규: 141 (PC×메이저) 점, jitter+centroid |
| §6 OS×메이저 | ⚠ 검증 보류 | 재구성: (PC×메이저) post 14d C4/PC 평균 |
| Hero Cell 2 | 2,499건 | 2,530건 (1044/756/715/15) |
| Hero Cell 3 | 옛 사고율 (1.71/1.48/0.07) | 새 사고율 (1.81/0.83/0.81/0.64/0.08) |
| Hero Cell 4 | −246/−68/−48 | −212/−67/−47 |
| §1 자원 | 12,654 docs / MEM "MB" | 12,660 docs / MEM "raw" (단위 미확정) |

## 3. 핵심 산출 단위 — (PC × 메이저) 쌍

```
각 (PC, 메이저) 쌍에 대해:
  first_t  = min(sprocess.time WHERE id=PC, FileVersion startswith 메이저)
  pre 14d  = [first_t − 14일, first_t)         ← Δ 계산용
  post 14d = [first_t,         first_t + 14일] ← 사고 카운트 메인
```

chrome **45 PC × 9 메이저 → 150 (PC × 메이저) 쌍**.

- **§3** = post 14d Core 4 카운트만 (= 그 PC가 그 메이저 깔린 직후 14일 안 사고)
- **§4** = pre/post 차이 (Δ)
- **§6** = post 14d Core 4 / PC 평균 (OS 그룹별)

## 4. 사용 데이터

| 컬렉션 | docs | 핵심 필드 | 사용처 |
|---|---|---|---|
| `sprocess` | 287,493 | `id, time, FileVersion, FileName, CPU, Memory, CounterCount` | 자원 mean / 메이저 분류 / first_time / 부모자식 |
| `detect` | 144,001 | `id, time, TypeEventName, RuleId, Name, Message, FileName` | Core 4 분류 (4 카테고리) |
| `system` | 52,682 | `id, time, CPU.close, Memory.rate` | ★ 메인 차트 / §4 pre/post 14d Δ |
| `node` | 161 | `id, System.{ComputerName, ip}, User.{name, deptName}` | PC 메타 |
| `nodeinfo (OS만)` | — | `name="OS"`의 `data[].OSName/Caption` | §6 OS 그룹핑 |

시간 필드: `sprocess.time` (5분 grid Unix epoch). `EventTime` 안 씀 (burst 시점 부풀림). `filelist` 안 씀 (`EventTime` 평균 10일/최대 121일 차이).

## 5. 산출법

### 자원 mean (§1·Hero)

```
mean over docs of (field / CounterCount)
```

- **CPU**: % single core ✓ (raw `sprocess.CPU`는 5분 윈도우 합 → `/CounterCount` = 진짜 single-core %)
- **Memory**: 단위 미확정 — KB 추정 (sample `272,598 / 386 = 706`, chrome 1 process 수치로 합리적). "MB" → "raw"
- **Handle**: K
- **IO**: raw (검증 미완)

### Core 4 분류

- **CPU점유**: `TypeEventName="CPU점유"` 또는 `RuleId="CPU"`
- **비정상종료**: `Name/Message`에 `'crash'` 또는 `TypeEventName`에 `"비정상"`
- **강제종료**: `TypeEventName="강제종료"` 또는 `RuleId`에 `"Kill"`
- **블루스크린**: `TypeEventName`에 `"블루"`/`"BSOD"`/`"BugCheck"`

### §3 strip plot

각 (PC, 메이저) 쌍의 post 14d Core 4 카운트 → 메이저 row마다 PC 점들(jitter), median 막대, IQR 박스. 사고율 (건/PC×일) = (PC별 post 14d Core 4 평균) / 14일.

### §4 산포도

- **X** = post 14d `system.CPU.close mean` − pre 14d mean (ΔCPU)
- **Y** = post 14d Core 4 카운트 − pre 14d 카운트 (ΔC4)
- 점 크기 = 노출 일수 (균일 r=2.8), jitter 추가, 메이저 centroid (median 위치) 큰 `✚` 마커
- pre/post 둘 중 `system` 데이터 없는 PC 제외 (150 → 141 쌍)

### §6 OS × 메이저 매트릭스

셀 = (그 OS × 그 메이저) 쌍들의 post 14d Core 4 / PC 평균. OS 그룹: Win11 Pro / Win11 Home / Win10 Pro / Win10 기타. N<3 회색 처리.

### ★ 메인 시간축

D3.js + zoom (휠/드래그/더블클릭). CPU / MEM / Core 4 3 라인. 메이저 마커 제거.

## 6. 분석 결과

### 6-1. 자원 mean (45 PC, 12,660 docs)

| 자원 | mean | median | max | 단위 |
|---|---|---|---|---|
| CPU | 0.94 | 0.39 | 63.92 | % single core ✓ |
| Memory | 369 | 57.3 | 25,891 | raw (KB 추정) |
| Handle | 1,158 | 754 | 45,740 | K |
| IO | 43.2 | 19.4 | 3,361 | raw |

### 6-2. Core 4 카테고리 (185일 합산)

| 카테고리 | 카운트 | 비율 |
|---|---|---|
| 비정상종료 | 1,044 | 41.3% |
| CPU점유 | 756 | 29.9% |
| 강제종료 | 715 | 28.3% |
| BSOD | 15 | 0.6% |
| 합 | 2,530 | — |

chrome 직접 (`FileName=chrome.exe ∩ Core 4`): **237건** (Core 4 합의 9.4%).

### 6-3. (PC × 메이저) 쌍 단위 영향

| 메이저 | nPC | spread | post C4 median | post C4/PC mean | mean ΔCPU | C4 합 Δ |
|---|---|---|---|---|---|---|
| v97 (N=1) | 1 | 1d | 4 | 4.0 | −0.04 | +4 |
| v133 (N=1) | 1 | 1d | 0 | 0.0 | +2.29 | 0 |
| **v141 ⚠** | 6 | 9d | 12 | 25.33 | +2.58 | +143 |
| v142 | 21 | 46d | 0 | 7.38 | −0.07 | +51 |
| **v143 ✓** | 27 | 44d | 0 | 1.11 | +0.79 | −67 |
| v144 | 23 | 36d | 4 | 6.35 | −0.49 | +126 |
| **v145 ⚠** | 26 | 31d | 8 | 11.65 | −0.87 | +174 |
| v146 | 26 | 34d | 6 | 11.27 | −0.27 | −212 |
| v147 | 19 | 15d | 4 | 9.00 | −0.88 | −47 |

- **v143 ✓** N=27, post C4 median 0 · IQR 0~1 — 거의 모든 PC가 사고 안 겪음. 모든 OS에서 깨끗.
- **v141 ⚠** N=6. PC 1대(고유 ID `68feec…`)만 outlier — chrome CPU 12.55% (회사 평균 0.94%의 13배). 나머지 5 PC 정상 범위 (0.47~2.28%). v141 자체 문제 아닌 그 PC의 chrome 사용 패턴일 가능성.
- **v145 ⚠** post C4/PC 11.65 (회사 영향 최대). 자원 −0.87 미세 개선 but 사고 +174.

### 6-4. 메이저 도입 spread (회사 깔리는 데 걸린 일수)

v141 9d (6 PC) · v142 46d (21 PC) · v143 44d (27 PC) · v144 36d (23 PC) · v145 31d (26 PC) · v146 34d (26 PC) · v147 15d (19 PC). **메이저는 하루에 안 깔린다.**

### 6-5. (PC × 메이저) 산포도 4분면 (§4)

141 쌍:

| 사분면 | 쌍 수 |
|---|---|
| 좌하 (자원 ↓ + 사고 ↓ 개선) | 37 |
| 우상 (자원 ↑ + 사고 ↑ 악화) | 26 |
| 좌상 (자원 ↓ · 사고 ↑) | 40 |
| 우하 (자원 ↑ · 사고 ↓) | 38 |

→ 자원/사고 같은 방향 안 움직이는 쌍 **78/141 (55%)** = 메이저 변화는 자원/사고 따로 봐야 함.

### 6-6. OS × 메이저 매트릭스 (post 14d C4 / PC mean)

| OS | v141 | v142 | v143 | v144 | v145 | v146 | v147 |
|---|---|---|---|---|---|---|---|
| Win11 Pro (73 pair) | 8.0 (3) | 3.4 (13) | 0.1 (13) | 4.6 (11) | 7.0 (13) | 4.8 (11) | 6.0 (8) |
| Win11 Home (43 pair) | 62.0 (2) | 26.2 (4) | 3.1 (7) | 11.7 (7) | 13.9 (8) | 16.2 (8) | 10.3 (6) |
| Win10 Pro (25 pair) | · | 2.0 (3) | 1.8 (4) | 3.2 (4) | 25.2 (4) | 16.8 (5) | 14.5 (4) |
| Win10 기타 (9 pair) | · | 0.0 (1) | 0.0 (3) | 0.0 (1) | 0.0 (1) | 13.0 (2) | 3.0 (1) |

- **Win11 Home**: 거의 모든 메이저에서 사고 가장 많음 (v141 62 outlier 의심, v142 26.2). v143만 깨끗.
- **Win11 Pro**: 가장 안정.
- **Win10 Pro**: 후반 메이저 (v145·v146·v147) 사고 ↑.

### 6-7. PC TOP 10 (§2)

PC 호스트명·사용자명·부서명은 익명화하고 사고 분포만 정리한다.

| # | PC 분류 | CPU점유 | 비정상 | 강제 | BSOD | C4합 |
|---|---|---|---|---|---|---|
| 1 | 한 PC (개인 환경) | 33 | 48 | 254 | 2 | 337 |
| 2 | 한 PC | 4 | 194 | 66 | 1 | 265 |
| 3 | 한 PC | 98 | 118 | 45 | 0 | 261 |
| 4 | node 미등록 PC | 151 | 0 | 0 | 0 | 151 |
| 5 | 한 PC (개인 환경) | 3 | 130 | 8 | 0 | 141 |
| 6 | 한 PC | 7 | 108 | 1 | 1 | 117 |
| 7 | 한 PC (고객사 단말) | 27 | 83 | 3 | 0 | 113 |
| 8 | 한 PC | 3 | 22 | 83 | 0 | 108 |
| 9 | 한 PC | 105 | 1 | 2 | 0 | 108 |
| 10 | 한 PC (개인 환경) | 6 | 65 | 4 | 0 | 75 |

### 6-8. chrome 부모/자식 (§5)

- **부모**: chrome 자기 7,775 / explorer.exe 4,557 / (없음) 199 / notification_helper.exe 50 / 메신저 1종 15
- **자식**: chrome 자기 7,775 / updater.exe 992 (Chrome 자동업데이트) / EXCEL 51 / Hwp 42

⚠ **점검 권장 자식 SW**: `ssc4cam.exe` (25, 비공인) / `SOGOUSmartAssistant.exe` (14, 중국 검색엔진) / `utorrent_installer.exe` (5, P2P) / `qbittorrent.exe` (4, P2P).

## 7. v141 outlier 정체 (`probe_hero_validate.py`)

```
v141 6 PC 중:
  PC 고유 ID 68feec… → CPU/CounterCount mean 12.55% (max 63.92)
     · 9일 60 docs, post 14d Core 4 = 66건
  나머지 5 PC: CPU/CounterCount mean 0.47 ~ 2.28% (정상)
```

→ **v141 자체 문제 아님.** 그 PC 1대가 chrome 매우 많이 쓰고 사고도 많이 났음.

## 8. `sprocess.CPU` 단위 (검증 완료)

```
sprocess.CPU          = raw 5분 윈도우 CPU 합 (0 ~ 22,369)
sprocess.CounterCount = 5분 윈도우 측정 카운트
CPU / CounterCount    = single-core %
```

- §1 표시 0.936% = `mean over docs of (CPU/CounterCount)` ✓
- probe v141 `sp_cpu 614` = raw 평균 (정규화 안 함, 표시 X)
- §4 ΔCPU = `system.CPU.close` 기반 (별도 단위)

## 9. mockup 섹션 맵

- **Hero 4 카드** — 자원 mean / Core 4 합 (2,530) / 메이저 사고율 / 14일 Δ
- **★ 메인 시간축** — 185일 D3 + zoom (CPU/MEM/Core 4 3 라인)
- **§1 자원 사용량** — 인스턴스 mean 4 카드 (12,660 docs)
- **§2 증상 분해** — Core 4 stacked + 4 카드 + PC TOP 10 표
- **§3 메이저별 영향** — strip plot (9 메이저 × PC 점)
- **§4 14일 Δ** — 산포도 (141 쌍, jitter+centroid) + mean Δ 표
- **§5 연쇄 영향** — 부모/자식 + 점검 권장 SW
- **§6 OS × 메이저** 매트릭스
- **§8 PC별 자원** (27 PC 가로 막대)

시각: Orange `#ea580c` 단일 + 농도. v143 초록 (안전, 객관 근거). v141·v145 ⚠ (median 0 vs 8~12 객관 근거). N=1 회색.

## 10. probe 스크립트

### v6.3 메인

| 스크립트 | 용도 | 출력 |
|---|---|---|
| `probe_pc_major_pairs.py` ★ | (PC × 메이저) 150 쌍 dump | `chrome_pc_major_pairs.json` |
| `probe_daily_json_dump.py` | ★ 메인 차트 일별 (185일) | `chrome_daily.json` |
| `probe_major_spread.py` | 메이저별 first/p50/last PC 등장일 | `chrome_major_spread.json` |
| `probe_section1_validate.py` | §1 자원 mean 검증 | 콘솔 |
| `probe_hero_validate.py` | Cell 2 + v141 outlier 정체 | 콘솔 |

### mockup build

- `build_section3_bar.py` / `replace_section3_bar.py`
- `build_section4_scatter_v2.py` / `replace_section4.py`
- `replace_section6.py` · `replace_main_chart.py`
- `update_hero_and_section3.py`

## 11. 자동화 (Phase 1~4, 12~16시간) — 컨펌 후

### Phase 1. probe 통합 (3~4h)

5 메인 probe → `build_data.py <process_name>` → JSON 1 파일.

### Phase 2. HTML 템플릿화 (6~8h)

`v6_mockup/index.html` → `templates/dashboard.j2` (Jinja2). 모든 hardcoded 변수화.

### Phase 3. 빈 데이터 fallback (2~3h)

- 메이저 1종 → "비교 불가"
- 자식 SW 0~1개 → "거의 없음"
- 원칙: 빈 자리 채우지 말고 명시.

### Phase 4. build script (1h)

`python build_dashboard.py orange.exe → out/orange.html`.

### 검증 SW 후보

`orange.exe` (101 PC) / `msedge.exe` / `ASDSvc.exe` (72 PC) / 메신저 1종.

## 12. 데이터 갭 (Tier 2)

| 우선순위 | 갭 | 해결 |
|---|---|---|
| ★★★ | PC 가동/슬립 이력 | Agent boot/shutdown |
| ★★★ | 사용자 활성 시간 | Agent 신규 수집 |
| ★★★ | 변경 이벤트 통합 타임라인 | `filelist` + `nodeinfo` + OS 패치 |
| ★★ | chrome helper/GPU 매핑 | 그룹핑 |
| ★ | 사용자 변경 이벤트 | User 변경 감지 |

## 13. 알려진 한계

- Memory 단위 미확정 (KB 추정, 명세 확인 필요).
- chrome multi-process 부모/자식 1위 자기 7,775 (분석 가치 작음).
- v141 N=6 outlier 1대 검증 완료 (§7).
- `system` 컬렉션 sparse (chrome 보유 45 PC × 185일 일부만).
- 회사 합산 시계열 (★) chrome 도입 인과 단정 X — 시간 패턴 도구.

## 14. 한 줄 결론

chrome.exe 45 PC × (PC × 메이저) **150 쌍 단위** 분석 = 8 섹션 mockup. v6.3 = 회사/날짜 합산 폐기 → 모든 영향 (PC × 메이저) 단위로 통일. v141 outlier = PC 1대 검증. 컨펌 + 자동화 진행 대기.

---

*Orange Platform 한 고객사의 chrome.exe 메이저 버전별 영향 분석 리포트입니다.*
