---
title: "파일을 많이 여는 프로그램에서 CPU가 치솟던 미니필터 — WPR·xperf로 PreCreate 파일명 조회가 28%임을 짚다"
excerpt: "파일 오류 감시가 켜져 있으면 파일을 많이 여는 프로그램의 CPU 사용이 늘었다. WPR CPU 프로파일과 xperf 호출 스택 집계로, CPU 표본의 28%가 미니필터 PreCreate의 파일명 정규화 조회임을 수치로 확정하고, 대상 프로세스가 아닐 때 이름을 구하지 않도록 고친 과정을 정리한다."
category: tech
date: 2026-10-10
author: kim-tigerj
tags: [Windows, 성능분석, 미니필터, WPR, xperf, ETW, 프로파일링, Orange Platform]
---

## 증상

파일 오류 감시(`Event.FailedFile`)가 켜져 있으면 파일을 많이 여는 프로그램의 CPU 사용이 늘었다. 프로파일링 측정에서 CPU 표본 21,486개 중 28%가 orange.sys의 파일 이름 조회였다. 배포용 `settings.json`의 기본값이 켜짐이라 고객사 PC도 같은 조건이었다.

## 원인

`PreCreate`가 사용자 모드의 **모든** 파일 열기에서 정규화된 이름(`FltGetFileNameInformation`)을 구했다. 그런데 이 이름을 실제로 쓰는 보고(파일 오류, 공유 위반, 삭제)는 OR-1628 이후로 **모니터링 대상 프로세스에 대해서만** 수행한다. 대상이 아닌 프로세스는 애써 구한 이름을 쓰지도 않고 그대로 해제했다. 파일 이름 정규화는 커널에서 결코 싸지 않은 작업이라, 대상이 아닌 프로세스까지 전부 돌리는 비용이 고스란히 낭비였다.

## 수정

`PreCreate`에서 프로세스 표로 대상 여부를 먼저 보고, 대상이 아니면 이름을 구하지 않도록 바꿨다. 보고 결과는 달라지지 않는다. Debug 빌드의 치트 경로(`\@Orangelabs\`)는 대상 여부와 상관없이 통과시키는 기능이라 그대로 뒀다.

## 분석 방법

이 글의 핵심은 "28%"라는 숫자를 어떻게 얻었느냐다. 커널 드라이버의 CPU 비용은 작업 관리자로는 보이지 않으므로, WPR로 CPU 프로파일을 기록하고 xperf로 호출 스택을 기호로 풀어 셌다.

### 환경

- 개발 PC(Windows 11 Pro 10.0.26200), orange.sys 0.3.1.42. 트레이스 안의 이미지 디버그 ID가 디스크 파일과 같아, 측정한 이미지가 빌드 산출물과 동일함을 확인했다.
- 같은 PC에 AhnLab 필터 6개가 함께 올라 있었다. 실제 고객사와 비슷하게 여러 보안 필터가 공존하는 환경이었다.
- `Event.FailedFile` 값을 설정에서 직접 읽지는 못했다. 그런데 `PreCreate`의 이름 조회는 이 값이 켜졌을 때만 불리는데 표본에 6,085개가 잡혔으므로, 켜진 상태로 판단했다.

### 기록

WPR은 Windows에 내장되어 있고 관리자 권한으로 돈다.

```
wpr -cancel
wpr -start CPU -filemode
(측정 대상 작업 수행)
wpr -stop prof.etl
```

내장 CPU 프로필은 1ms 간격의 CPU 표본과 그때의 호출 스택을 남긴다. 측정 대상 작업으로는 덤프 분석기를 `orange.da.exe --fast --noactivate <덤프> <결과.json>` 형태로 커널 덤프 6건·유저 덤프 6건에 한 번씩, 창을 띄운 채 차례로 돌렸다.

### 집계

기호는 사내 심볼 서버와 Microsoft 공개 심볼 서버를 함께 걸어 풀었다. orange.sys는 이미지에 박힌 로컬 PDB 경로로 풀렸다.

```
xperf -i prof.etl -symbols -o stack_prof2.html -a stack -process "orange\.da" -event "Prof" -butterfly 10
```

`-event "Prof"`로 CPU 표본(SampledProfile)만 남기는 것이 핵심이다. 빼면 문맥 전환 스택이 섞여 표본 수가 부풀어 비율이 왜곡된다.

- 전체 21,486 = 분석기 프로세스 12개의 exclusive hit 합(표본 1개 ≈ 1ms).
- `PreCreate` 6,104개(28.4%) = `PreCreate`가 스택에 한 번 이상 등장한 표본 수. 그중 6,085개가 `PreCreate`가 부른 `FltGetFileNameInformation`이었다. `PreCreate`를 부른 쪽은 Filter Manager의 `fltMgr!FltpPerformPreCallbacksWorker`였다.

### 다시 잴 때 주의

- 다음 측정은 `Event.FailedFile`이 켜진 상태만 쟀다. 고친 orange.sys에서 같은 덤프 12건을 같은 프로필로 다시 재야 차이를 수치로 말할 수 있다.
- 측정한 빌드의 PDB를 따로 남겨 둬야 한다. 재빌드하면 로컬 PDB가 덮여 기호가 풀리지 않는다.
- 수치에는 WPR 스택 수집 비용과 분석기 창 그리기·로그 비용이 섞여 있다. 에이전트가 실제로 돌리는 분석은 창이 없다.

---

*Orange Platform 에이전트 커널 미니필터(orange.sys)의 성능 분석 리포트입니다.*
