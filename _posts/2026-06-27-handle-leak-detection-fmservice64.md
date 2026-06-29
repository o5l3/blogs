---
title: "핸들 누수 실측 분석 — 지문 인식 보안 SW(FMService64)의 1,671만 핸들과 메모리 과다 프로세스 탐지"
excerpt: "에이전트가 1시간 단위로 집계한 sprocess 지표에서 메모리 3GB·핸들 1,671만의 이상 프로세스 두 건을 발견하고, LiveAgent·작업 관리자·wmic로 교차 검증해 지문 인식 보안 SW의 핸들 누수를 규명한 실측 리포트."
category: report
date: 2026-06-27
author: kim-tigerj
tags: [핸들 누수, 프로세스 분석, Windows, FMService64, sprocess, Orange Platform]
---

## 개요

Agent `1.6.242.145`부터 sprocess(revision 11) 전송 방식을 바꿔, 모든 sprocess hourly를 개별 30분 주기로 시차 전송하도록 했다. 목적은 **프로세스 영향도를 제대로 산출**하기 위함이다. 이 전송 방식은 다음 세 가지를 보장한다.

- 절전 등으로 전송되지 못한 이전 hour 버킷도, 서버에 다시 붙으면 늦게라도 **해당 시각(timestamp)** 으로 전송한다.
- 이미 전송된 이전 hour 버킷이라도 값이 갱신되면 **해당 시각으로 다시** 전송한다.

이렇게 MongoDB `sprocess` 컬렉션에 집계된 revision 11 데이터를 분석하던 중, 눈에 띄는 수치를 가진 프로세스 두 건을 발견했다. 둘 다 수집값이 비정상적으로 컸고, 실제 단말에서 교차 검증한 결과 **수집값이 정확**했다. 이 글은 그 두 건의 실측 분석 기록이다.

## 1. PhoneExperienceHost — 메모리 3GB 과다 사용

집계된 수치는 다음과 같았다.

| 항목 | 값 |
|---|---|
| 프로세스 | PhoneExperienceHost |
| Memory | 3,476 MB |
| Handle | 134,553 |
| CounterCount | 11 |
| 노드 | 한 노트북 |

"메모리를 3GB 이상 쓴다고?"가 첫 반응이었다. 검증 절차는 이렇다.

1. **LiveAgent**로 해당 노드의 실시간 프로세스를 확인.
2. 해당 노트북의 **작업 관리자**로 직접 확인.

결과: **메모리 커밋 크기가 3GB 이상**으로, MongoDB에 저장된 값이 맞았다. 여기서 중요한 점은 Agent가 수집하는 메모리 크기의 정의다.

> Agent가 수집하는 메모리 크기 = **커밋 크기(Commit Size)** = 물리 메모리 + 가상 메모리 등 모든 메모리의 합산.

즉 작업 관리자의 "활성 메모리(Working Set)"가 아니라 커밋 크기 기준이므로, 단말 사용자가 체감하는 RAM 점유보다 큰 값이 나올 수 있고, 그 값 자체는 정확하다.

## 2. FMService64 — 핸들 1,671만 (핸들 누수)

두 번째 프로세스는 더 극적이었다.

| 항목 | 값 |
|---|---|
| 프로세스 | FMService64 |
| Memory | 17,188 MB |
| Handle | 16,711,679 |
| 노드 | 한 PC |

핸들 수가 **1,671만 개**. 압도적인 핸들 사용으로 "부하 많음" 후보로 선정됐고, 수집된 핸들 수가 사실이라면 **핸들 과다 할당으로 System 프로세스까지 부하가 번지는** 상황이다.

### 2-1. LiveCMD로 직접 검증

LiveAgent로 1차 확인한 뒤, **LiveCMD**로 단말에서 `wmic`를 직접 실행해 교차 검증했다.

```
C:\ProgramData\Orange>wmic process where name="FMService64.exe" get HandleCount,WorkingSetSize,PageFileUsage
HandleCount  PageFileUsage  WorkingSetSize
16711679     17600884       1376256
```

- **HandleCount = 16,711,679** — MongoDB 집계값과 정확히 일치.
- **PageFileUsage ≈ 17.6GB(17,600,884 KB)** — 메모리 17,188MB 집계값과 부합(커밋 크기 기준).

MongoDB에 저장된 값이 단말의 실측값과 일치함을 확인했다.

### 2-2. 분석 — 핸들 누수의 교과서적 사례

FMService64는 **지문 인식 보안 SW**다. CPU는 특별히 쓰지 않지만, 내부적으로 **핸들 누수(Handle Leak)** 를 일으킨다. 핸들이 시간이 지날수록 계속 쌓이기만 하고 회수되지 않는 패턴이다. 이 단말은 다음 경로로 악화된다.

> 부팅 후 일정 시간 경과 → 핸들 과다 → **커널 메모리 부족** → 시스템이 빈사 상태로 진입.

핸들 누수는 CPU·메모리 그래프만 봐서는 잘 드러나지 않는다(CPU는 평온하다). 핸들 수를 1시간 단위로 집계·추적하기 때문에, "조용히 누적되다 어느 순간 시스템을 마비시키는" 유형을 사전에 포착할 수 있다는 점이 이 분석의 핵심이다.

## 정리

| 프로세스 | 이상 지표 | 검증 방법 | 결론 |
|---|---|---|---|
| PhoneExperienceHost | Memory 3,476MB | LiveAgent + 작업 관리자 | 커밋 크기 기준 정상 수집(값 정확) |
| FMService64 | Handle 16,711,679 | LiveAgent + LiveCMD(`wmic`) | 지문 인식 보안 SW의 핸들 누수 — 방치 시 커널 메모리 고갈로 시스템 빈사 |

두 건 모두 **에이전트 수집값 = 단말 실측값**임을 확인했다. 1시간 단위 sprocess 집계와 LiveAgent·LiveCMD 교차 검증이 결합되면, CPU 그래프만으로는 보이지 않는 메모리 과다·핸들 누수 프로세스를 수치로 짚어낼 수 있다.

*Orange Platform이 수집한 실측 데이터를 기반으로 한 프로세스 이상 탐지 분석 리포트입니다.*
