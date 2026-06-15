---
title: "에이전트 startup 시 프로세스당 정확히 3초씩 멎던 self-wait 회귀 — FltSendMessage 블록 사례 분석"
excerpt: "기존 실행 프로세스를 일괄 등록하던 단계에서 자기 자신을 기다리는 self-wait가 매번 3초 풀 타임아웃을 일으켜 ofilter 미니필터의 이벤트 포트를 분 단위로 막던 회귀를 코드 경로 단위로 짚고, 즉효·근본 두 단계 수정안을 정리합니다."
category: tech
date: 2026-06-10
author: wychoi-orangelabs
tags: [Windows Driver, FltSendMessage, Minifilter, Self-wait, Race Condition, Orange Platform]
---

## 현상

에이전트 startup 시 기존 실행 프로세스 목록을 등록하는 동안, **프로세스 1개당 정확히 3초씩 직렬로 정체**된다. 기존 프로세스가 수십~100개면 수십초~수분간 멈추고, 그동안 `ofilter` 드라이버 → 에이전트 이벤트 포트 전송(`FltSendMessage`)이 블록된다. 드라이버는 정상이며 원인은 에이전트 수신/처리부에 있다.

## 검증된 증거 (계측 로그)

`C:\ProgramData\Orange\Log\agent.error.log`에 계측 로그를 넣어 확인:

```
[WaitPending] 3016ms TIMEOUT PID=860  SUID=3428842903 [smss.exe]  by=BySUID
[OnStart2]    total=3010ms  PID=860  sub=2            [...smss.exe]
[WaitPending] 3016ms TIMEOUT PID=1336 SUID=538241657  [csrss.exe] by=BySUID
[OnStart2]    total=3018ms  PID=1336 sub=2            [...csrss.exe]
...
```

공통점 (전부 동일):

- 전부 TIMEOUT ~3000ms → `WaitPending`이 매번 풀 타임아웃.
- 전부 `by=BySUID` → `GetProcessCacheBySUID` 경로.
- 전부 `sub=2`(`ProcessStart2`) → startup 기존 프로세스 일괄 등록 단계.
- 완벽히 직렬: `02:01:56 → 59 → 02:02 → 05 ...` 정확히 3초당 1개.
- `WaitPending`이 기다리는 SUID == 그 시작 중인 프로세스 **자신의 SUID**.

## 근본 원인 — 자기 자신을 기다리는 self-wait

프로세스가 자기 `AddProcessCache` 도중, 자기 SUID로 캐시를 다시 조회하고, 그 조회가 "내가 준비될 때까지 대기(`WaitPending`)"에 걸린다. 그런데 **"나를 준비시키는" `SetPending(false)`는 그 대기보다 뒤에 있어 영원히 안 켜진다** → 매번 3초 풀 타임아웃.

### 정확한 코드 경로 (검증)

```
[드라이버 GetProcessTableList] (ofilter/port.cpp)
  ProcessBegin(96) → ProcessStart2 x N(기존 프로세스) → ProcessCommit(131)

[에이전트 Proc2] (CProcessCallback2.cpp)
  case ProcessStart2(188~213): m_prerun 버퍼에 적재만. OnStart2 호출 안 함(212 주석)
  case ProcessCommit(140~164): m_lock2 잡고 while(!m_prerun.empty()) { OnStart2(162) }  ← sub=2 OnStart2 유일 경로

  OnStart2 → AddProcessCache(self)              (CProcess2.cpp)
    m_lock.Lock(188) {
      m_table[self] 등록(226)                    ← self가 SUID로 조회 가능해짐
      UpdateProcessByStartStop → 콜백(330)
        CSProcessHourly::OnStart(369)
          Rotate → m_persist(Create)(CSProcessHourly.h:585)
            SProcessHoulyCallback(Create)
              GetProcessCacheBySUID(self SUID)(SProcessHourlyCallback.cpp:13)  ← ProcName 얻으려 self 재조회
                self.WaitPending()               ← self.hDone 대기 → 3초 TIMEOUT
    }
    if(ptr) self.SetPending(false)(CProcess2.cpp:354)  ← self.hDone 켜는 유일한 곳. 대기보다 뒤라 못 켬
```

- 대기(`WaitPending`)와 신호(`SetPending(false)`)가 같은 스레드 · 같은 호출 스택에 있고, 신호가 대기보다 항상 뒤 → 자기가 자기를 못 깨움 → 결정론적 3초.
- `m_lock`이 재귀 락(`CRITICAL_SECTION`)이라 하드 데드락은 아니고 3초 후 진행 → "행"이 아니라 "프로세스당 정확히 3초".
- `sub=2 OnStart2`는 `CProcessCallback2.cpp:162`(`ProcessCommit` 드레인)가 유일 경로. 로그에 `sub=2`가 찍힌 것 자체가 `ProcessCommit` 수신을 증명.

## 왜 startup에서 분 단위인가

startup의 `ProcessStart2` N개는 단 한 번의 `ProcessCommit` 핸들러 안 `while(!m_prerun.empty())` 루프(`CProcessCallback2.cpp:151~163`)에서, `m_lock2`를 잡은 채, 직렬로 처리된다. 각 `OnStart2`가 3초 self-timeout이므로 **N × 3초가 한 Commit 처리에 통째로 누적**. 이 핸들러는 수신 스레드(`Proc2`)에서 돌므로 그동안 `FilterGetMessage` 재게시가 안 되어 드라이버 이벤트 포트가 N × 3초 내내 블록된다.

(평상시 실시간 `ProcessStart`(`sub=1`, `CProcessCallback2.cpp:215`)는 한 건씩이라 self-wait 3초가 산발적이지만, startup의 `ProcessStart2` 무더기는 한 방에 직렬 누적된다.)

## 회귀 도입 지점

이전 작업에서 `CProcess`에 `hDone` pending 배리어를 추가한 변경:

- 생성자 `hDone = CreateEvent(NULL, TRUE, FALSE, NULL)` (초기 비신호 = pending).
- `SetPending(false)`(= `SetEvent`)는 `CProcess2.cpp:354` `AddProcessCache` 맨 끝 단 한 곳.
- `WaitPending() = WaitForSingleObject(hDone, 3*1000)`, 최대 3초. `GetProcessCacheBySUID/ByPID/GetProcessCache/EnumProcessCache` 4개 조회 함수에 삽입됨.

## 1단계 — 즉효 수정 방향

- **근본(권장)**: `Create` 단계의 `GetProcessCacheBySUID(self)`(`SProcessHourlyCallback.cpp:13`) 제거. INSERT에 필요한 `ProcName`/`ProcPath`는 `CSProcessHourly::OnStart(..., ProcessPtr pptr, ...)`에 이미 `pptr`로 들어와 있으므로 `Rotate/m_persist`에 직접 전달. self 재조회 자체가 사라져 `WaitPending`도 안 탄다.
- **즉효**: `Create` 단계 self 조회를 `WaitPending` 없는 조회로(준비 완료를 기다릴 이유가 없음 — `ProcName`은 이미 set됨). 또는 `WaitPending` 타임아웃 `3000 → 0`.
- **구조**: 수신 스레드(`Proc2/ProcessCommit` 드레인)에서 동기 대기 자체를 금지.

## 2단계 — 미완성 캐시 공개 제거 + `WaitPending` 삭제 (근본)

### 왜 1단계만으로 부족한가

위 "수정 방향 1(self 재조회 제거)"은 startup의 `BySUID` self-wait 트리거 하나를 없앨 뿐, `GetProcessCacheBySUID/ByPID/GetProcessCache/EnumProcessCache` 안의 `WaitPending`(3초) 자체는 남는다. 아직 finalize 안 된 프로세스를 조회하는 다른 경로(다른 스레드의 조회 등)는 여전히 최대 3초 블록 가능.

근본 원인은 `WaitPending`이 아니라 **"미완성 엔트리의 조기 공개"** 다. `m_table[PUID]=ptr` 등록(`CProcess2.cpp:226`)이 SUID 계산(`CProcessCallback2.cpp:275`, `PreSaveFileList`)보다 앞서 일어나, `[226~275]` 구간에 "찾을 수는 있는데 `SUID=0`"인 **torn-read 윈도우**가 생긴다. `WaitPending`은 그 조기 공개를 둔 채 읽는 쪽을 대기시키는 반창고에 불과하다.

### A안 — 완성 후 공개 (권장 근본)

- **A-1**: `m_table[PUID]=ptr; m_id[PID]=ptr->PUID;`(현 `CProcess2.cpp:226~227`)를 `UpdateProcessByStartStop` 호출 후(현 335 직후, `m_lock` 블록 닫히기 전)로 이동. SUID는 `UpdateProcessByStartStop` 내부에서 계산되므로(275), 이동 후 공개 시점엔 SUID/ProcName 모두 완성.
- **A-2**: pending 메커니즘 완전 삭제 — 생성자 `hDone=CreateEvent`, 소멸자 `CloseHandle(hDone)`, `SetPending/WaitPending` 메서드, 4개 조회 함수의 `WaitPending(...)` 호출 줄(조회 로직은 유지), 계측 로그.
- **효과**: `WaitPending` 자체가 사라져 모든 잔존 self/cross-wait 소멸 + `SUID=0` torn read 동시 해결. (둘은 뿌리가 같음 — 미완성 객체 조기 공개. "틀린 값이 보이는 창문"을 없애므로 대기가 불필요해진다.)

### 감사 결과 (A안 안전성 확정)

`AddProcessCache(self)` 동기 체인 내 모든 `m_table`/캐시 접근 전수 조사:

| 위치 | 대상 | 방식 | WaitPending | A 영향 |
|---|---|---|---|---|
| 진입 `m_table.find(PUID)` | self 존재확인 | 직접 find | 없음 | 무해 (self 미등록 → New 분기 정상) |
| `Message2Json m_table.find(PPUID) (125)` | 부모(cross-process) | 직접 find | 없음 | 무해 (부모는 자기 `AddProcessCache`에서 이미 공개) |
| `m_table[PUID]=ptr (226)` | self 등록 | 삽입 | — | A 이동 대상 |
| `UpdateProcessByStartStop(963)`/`GetCounters11` | self(proc) 직접 | 조회 없음 | — | 무해 |
| hourly `GetProcessCacheBySUID(self)` (`SProcessHourlyCallback.cpp:13`) | self | WaitPending | 있음 | 1단계가 제거 (유일한 in-window self 조회) |
| `OnStart2:431 GetProcessCacheByPID(PPID)` | 부모 | WaitPending | 있음 | 윈도우 밖 (`AddProcessCache` 반환 후) |
| `EnumProcess:730 EnumProcessCache` | 전체 | WaitPending | 있음 | dead code (호출처 없음) |

결론: 윈도우 안에서 self를 `m_table`로 조회하는 곳은 1단계가 없앨 1곳(hourly)뿐. 나머지는 전부 부모(cross-process)거나 proc 직접 사용. cross-thread 독자(`Crash/Notify/RunAgentCommand/ETW/File/Thread`의 `GetProcessCacheByPID/BySUID`)는 전부 `if(p){...}` null-체크 콜백 → not-found 정상 처리. ⇒ **A안은 1단계 전제 하에 안전**.

### 트레이드오프

- WaitPending 방식: 윈도우 중 조회 → 대기 후 완성본(found).
- A안: 윈도우 중 조회 → not-found(miss).

`SUID=0` 쓰레기 행 증상엔 not-found가 오히려 안전(garbage 미생성). 단일 소비 스레드 + 순서 보장이라, 그 프로세스의 자기 후속 이벤트(Stop/Counters)는 Start 완성 후 처리되어 항상 완성본을 본다.

### 잔여 검증 (A 적용 전 2건)

- `ProcessInstanceCallback`(`CProcessCallback2.cpp:235`, self 등록 전 327에서 호출)이 self를 `m_table`로 조회하지 않는지 — ptr 직접 받으므로 통상 무해하나 확인 필요.
- `ArrangePreProcess`(부모 先정렬, `CProcessCallback2.cpp:6`)가 자식보다 부모를 먼저 `OnStart2`하도록 보장 — 이미 그 목적의 함수(확인됨).

### 적용 순서

1단계(즉효, 저위험)로 startup 정상화 검증 → 2단계 A안(근본)으로 pending 메커니즘 삭제. A는 위 잔여 검증 2건 후 진행.

---

*Orange Platform 에이전트 미니필터 드라이버 ↔ 에이전트 이벤트 포트 회귀 분석 리포트입니다.*
