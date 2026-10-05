---
title: "커널 덤프가 있어도 미니덤프를 고르던 BSOD 덤프 수집 — 선택 로직의 확정된 결함 5건"
excerpt: "MEMORY.DMP가 멀쩡히 있는데도 에이전트가 4 MB짜리 미니덤프를 BSOD 분석 대상으로 골랐다. 파일 크기로 종류를 판정하고 최신 하나만 남기는 로직, 32비트 분기의 잘못된 오프셋까지 다섯 결함이 겹쳐 「큰 덤프 우선」이 거꾸로 돌았다. 실측과 함께 원인과 수정 설계를 정리한다."
category: tech
date: 2026-10-03
author: kim-tigerj
tags: [Windows, BSOD, 덤프분석, MEMORY.DMP, 미니덤프, C++, 에이전트, Orange Platform]
---

## 증상

에이전트가 BSOD 덤프를 수집할 때, `MEMORY.DMP`와 미니덤프가 함께 있으면 미니덤프를 고른다. 커널 덤프가 유효하게 존재해도 그렇다.

실측(개발 PC, 2026-08-14 BSOD):

| 항목 | 값 |
|------|------|
| MEMORY.DMP | 65,129.9 MB, LastWrite 10:12:33.862 |
| 미니덤프 081426-13796-01.dmp | 4,381,004 바이트 (4.18 MB), LastWrite 10:12:42.172 |
| 시간 차 | 미니덤프가 8.3초 늦게 기록 |
| WER 이벤트 1001 | 최근 3건 모두 param2 = `C:\WINDOWS\MEMORY.DMP` |
| CrashDumpEnabled | 1 (전체 메모리 덤프), FilterPages 값 없음 |
| RAM | 63.6 GB, MEMORY.DMP 크기와 일치 |

## 원인

선택 로직은 `agent/module/CSystemDumpFinder.h`에 있다. `CAgent2::GetSystemDumpInfo`가 이 결과로 `strDumpFile`을 덮어쓰므로 레지스트리 `DumpFile` 값은 버려진다. 확정된 결함은 5건이다.

1. `FindLatestDumpFile`이 `MEMORY.DMP`와 미니덤프 중 `LastWriteTime`이 늦은 하나만 남긴다. 미니덤프가 나중에 기록되면 `MEMORY.DMP` 후보가 사라진다.
2. `GetDumpType`이 파일 크기 1 MB로만 종류를 판정한다. 4.18 MB 미니덤프가 `DUMP_TYPE_KERNEL`로 분류된다.
3. `FindLatestCrashDump`가 primary를 유효성 검사에서 떨어뜨린 뒤 secondary를 검사 없이 반환한다.
4. `IsDumpFileValid`의 32비트 분기가 `RequiredDumpSpace`를 `0xF88`에서 읽는다. 실제 위치는 `0xFA0`이고 `0xF88`은 `DumpType`과 `MiniDumpFields`다.
5. `FindLatestDumpFile`과 bWer·bFile 단독 반환 경로는 `IsDumpFileValid`를 호출하지 않는다. 미완성 덤프도 선택된다.

1번과 2번이 겹쳐 「같은 크래시면 큰 덤프 우선」 분기가 반대로 동작한다. 미니덤프가 fileInfo로 올라오고(1번), 그 미니덤프가 큰 덤프로 분류되어(2번) primary가 된다. `IsDumpFileValid`는 MDMP 시그니처면 검사 없이 통과시키므로 걸러지지 않는다.

## 경위

파일 기반 탐색은 OR-807의 대책으로 들어왔다. WER 이벤트가 부팅 후 14~16초에 기록되는데 에이전트는 9초에 조회해 놓치던 문제였다. 그때 붙인 `FindLatestDumpFile`이 후보를 최신 하나로 줄이면서 이번 문제가 생겼다.

## 수정 설계

후보를 하나로 줄인 뒤 병합하지 않는다.

1. **후보 수집.** 레지스트리 `DumpFile`, `MinidumpDir`의 최신 K개(K = min(MinidumpsCount, 8)), WER 이벤트 경로를 모두 후보로 둔다. 경로가 겹치면 병합하고 WER 메타를 얹는다.
2. **헤더 판정.** 후보당 8 KB를 읽어 시그니처로 형식을 정한다. MDMP는 미니덤프, PAGE + DUMP/DU64는 PAGE 덤프다. 크기는 쓰지 않는다. PAGE 덤프는 `WriterStatus`와 `RequiredDumpSpace`로 유효성을 본다.
3. **크래시 그룹화.** 기준 시각 차이가 600초 이내면 같은 크래시로 묶는다. 절대값만 쓰고 기록 순서에 의존하지 않는다.
4. **그룹 내 우선순위.** 유효한 PAGE 큰 덤프 > 유효한 미니덤프 > 유효한 HEADER·TRIAGE > 무효.
5. **그룹 간.** 가장 최근 그룹을 고른다.
6. **반환.** 형식과 유효 여부를 함께 싣는다. 무효 후보뿐이면 경로는 돌려주되 무효로 표시한다. `CheckDriverStatus`가 파일 존재로 직전 부팅의 BSOD를 판단하므로 경로를 감추지 않는다.

PAGE 덤프 헤더의 `DumpType`은 레지스트리 `CrashDumpEnabled`와 값 체계가 다르다. 1 FULL, 2 SUMMARY, 3 HEADER, 4 TRIAGE, 5 BITMAP_FULL, 6 BITMAP_KERNEL, 7 AUTOMATIC으로 따로 매핑한다. 64비트 오프셋은 현행 코드가 맞다(`DumpType` 0xF98, `RequiredDumpSpace` 0xFA0, `WriterStatus` 0x1048). 결함 4번의 `0xF88`은 32비트 분기에만 있다.

## 범위

선택 로직(결함 1~5)만 고친다. 다음 둘은 이번 범위에서 뺐다.

- **커널 덤프 강제 여부.** `GetSetRegistryDWORD`가 `CrashDumpEnabled` 값이 1~2 범위면 그대로 둔다. 개발 PC는 1(전체 메모리 덤프)이라 63 GB 덤프가 쌓인다. 설정 자체를 바꾸는 일은 별건이다.
- **분석 결과 파일명 고정.** `CreateDump(bKernelDump=true, ...)`가 결과를 `report\MEMORY.DMP.json`으로 고정한다. 결과 파일이 하나뿐이라 직전 분석 결과만 남고, 파일명과 실제 분석한 덤프의 종류가 어긋날 수 있다.

재분석을 건너뛰는 문제는 없다. `CDump::LoadDoc`이 저장된 `FastHash`와 `FileSize`를 지금 분석할 덤프와 비교해 일치할 때만 `bAlreadyAnalyzed`와 `bReport`를 세운다. 덤프가 다르면 재분석하고 덮어쓴다. 파일이 있다는 것만으로 ALREADY REPORTED가 되지 않으므로 기능 결함이 아니다.

---

*Orange Platform 에이전트의 BSOD 덤프 수집 로직 분석 리포트입니다.*
