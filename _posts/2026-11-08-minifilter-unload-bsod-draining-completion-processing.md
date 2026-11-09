---
title: "드라이버 언로드 중 블루스크린 0x7E — FltMgr DRAINING 상태에서 금지된 완료 처리를 부른 미니필터"
excerpt: "FltMgr 필터 Verifier를 켠 VM에서 미니필터 드라이버 언로드 시 0x7E 블루스크린이 재현됐다. PostWrite 콜백이 DRAINING 상태에서 호출이 금지된 완료 처리 함수를 불렀던 것이 원인으로, 배포 중인 버전에도 있던 기존 결함이다."
category: tech
date: 2026-11-08
author: kim-tigerj
tags: [미니필터, FltMgr, BSOD, 커널드라이버, Windows, Orange Platform]
---

## 증상

orange.driver(ofilter, orange.sys)를 언로드하는 중 0x7E 블루스크린이 났다. FltMgr 필터 Verifier를 켠 VM에서 재현됐다.

## 스택

```
orange!DriverUnload
  → FltUnregisterFilter
    → FltpDrainActiveCompletions
      → orange!PostWrite+0x4f (File.Write.cpp:100)
        → FltvDoCompletionProcessingWhenSafe
          → DbgPrompt(int3)
            → 0x7E
```

## 원인

`PostWrite`가 `FLTFL_POST_OPERATION_DRAINING` 플래그가 설정된 상태에서도 `FltDoCompletionProcessingWhenSafe`를 불렀다. 이 함수는 DRAINING 중에는 호출이 금지되어 있다. `FltUnregisterFilter`가 필터를 언로드하면서 남아 있는 포스트 오퍼레이션을 비우는 `FltpDrainActiveCompletions` 단계에 들어가면 각 콜백에 DRAINING 플래그를 세우는데, `PostWrite`는 이 신호를 보지 않고 평소와 같은 완료 처리 경로를 그대로 탔다.

같은 함수에는 결함이 하나 더 있었다. 미뤄 처리가 실패하는 경우, 그 실패가 프로그램이 요청한 쓰기 자체의 결과(`IoStatus`)까지 `STATUS_UNSUCCESSFUL`로 덮어썼다. 미뤄 처리 실패와 쓰기 성공 여부는 서로 다른 일인데 하나의 상태값으로 섞여 있었다.

## 영향

배포 중인 orange.sys 0.3.1.53에도 있던 기존 결함이다. DRAINING 경로를 타는 시점(언로드)에만 드러나기 때문에 평소 동작에서는 보이지 않는다.

## 수정

- DRAINING 플래그가 설정되어 있으면 `FltDoCompletionProcessingWhenSafe`를 부르지 않고 바로 빠진다. `PostRead`·`PostCleanup`·`PostCreate` 콜백이 이미 같은 방식으로 처리하고 있어, `PostWrite`를 그 패턴에 맞췄다.
- 미뤄 처리가 실패해도 쓰기 집계만 건너뛰고, 프로그램이 받는 `IoStatus`는 건드리지 않는다.

## 확인

- 커밋(develop) — `2a8ea5ea` 고침, `4029245b` orange.sys 0.3.1.54
- 덤프(시험 VM) — `C:\Windows\Minidump\103126-41203-01.dmp`, `C:\b37\b37_crash_0x7e_103126.dmp`, `C:\Windows\MEMORY.DMP`

## 남은 일

0.3.1.54 MS 서명과 통합 시험(Verifier 유지, 재부팅, 언로드·로드 반복, 메모리 누수 확인)이 남아 있다.

*Orange Platform 커널 드라이버의 언로드 경로 블루스크린 분석 및 수정에 관한 기술 리포트입니다.*
