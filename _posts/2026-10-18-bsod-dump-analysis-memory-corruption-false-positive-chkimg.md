---
title: "블루스크린 덤프 215건 중 81%가 메모리 불량 판정 — 심볼 없이 돌린 체크섬 검사의 오탐이었다"
excerpt: "한 대학에서 수집한 커널 덤프 650개 아카이브를 전수 분석하다, 블루스크린의 81%가 memory corruption(메모리 불량)으로 판정됐다. 이 판정은 비교 대상에 디버그 심볼이 없어 부팅 뒤 커널이 스스로 고쳐 쓰는 자리를 전부 손상으로 센 오탐이었다. 심볼로 다시 본 결과와 PC별 재현 양상으로 판정을 뒤집고, 덤프 분석기의 실제 결함 다섯 가지를 고친 과정을 정리한다."
category: report
date: 2026-10-18
author: kim-tigerj
tags: [BSOD, 블루스크린, 커널덤프, WinDbg, chkimg, 덤프분석기, Orange Platform]
---

## 배경

한 대학에서 수집한 덤프 아카이브 650개(48GB)를 분석해, 덤프 분석기(orange.da.exe)의 결함을 실데이터로 찾아 고치는 작업을 했다. 각 아카이브에는 원본 덤프, 분석기 리포트(json), WinDbg `!analyze -v` 원문, 원인으로 지목된 모듈 파일이 들어 있었다. 집계는 리포트 json과 `!analyze -v` 원문 전수(655건)로 했다.

처음 목표에는 「이 대학의 특정 PC들에 메모리 불량 같은 공통 원인이 있다는 것을 분석기가 알릴 수 있게 한다」도 있었는데, 분석 도중 그 전제 자체가 틀렸다는 것을 확인해 이 목표는 철회했다. 아래에 그 과정을 그대로 남긴다.

## 자료의 실체

| 항목 | 값 |
|---|---|
| BSOD 커널 덤프 | 업로드 215건, 고유 175건(PC·FastHash 기준), 59대 |
| 유저 프로세스 크래시 | 440건(중복 없음), 191대 |
| 수집 기간 | 2026-08-24 ~ 09-23 (9월에 597건) |
| 에이전트 설치 드라이브 | V: 120대, C: 90대 |

같은 덤프가 반복 업로드된 것이 40건 있었다. 한 PC의 8월 28일 크래시 하나가 7일에 걸쳐 14번 올라갔다(원인은 뒤에 설명한다).

고유 175건 중 94건은 크래시 시각이 `1601-01-01`(0)로 찍혀 있었다. 전부 4월 24일 빌드 분석기로 분석된 미니덤프였고, 이후 빌드는 `DumpFile.FileTime`을 채운다(`CDumpAnalyzer.Open.cpp:102`). 분석기 버전 문제이지 에이전트 문제는 아니었다.

## 처음 집계: BSOD의 81%가 memory corruption

WinDbg `!analyze -v`의 판정을 215건 전수 집계했다.

| FAILURE_BUCKET_ID | 건수 |
|---|---|
| `MEMORY_CORRUPTION_*` | 174 (LARGE 165, STRIDE 9) |
| `WRONG_SYMBOLS_*` | 41 |

`!chkimg`가 코드 바이트 손상을 잡은 모듈은 nt 109, FLTMGR 47, tm 6, volmgr 2, ksthunk 1건이었다. LARGE는 여러 바이트가 흩어져 다른 경우, STRIDE는 일정 간격으로 반복되는 경우를 뜻한다.

174건 전부 분석기 리포트에서 해당 모듈이 `same=True`(디스크 파일의 체크섬·타임스탬프가 덤프와 같음)였다. 그래서 처음에는 「RAM에 올라간 코드가 바뀌었다」, 즉 메모리 불량으로 해석했다. 콜스택이 전부 `nt`로만 보여서 드라이버가 아니라 하드웨어 문제로 보고 memtest로 확정하려던 참이었다. 판정은 PC별로도 뚜렷하게 몰려 있었다.

| PC | BSOD | corruption 판정 | 주 BugCheck |
|---|---|---|---|
| PC-1 | 29 | 29 | KMODE_EXCEPTION_NOT_HANDLED ×25 |
| PC-2 | 22 | 22 | SYSTEM_SERVICE_EXCEPTION ×22 |
| PC-3 | 16 | 16 | KMODE ×12, REGISTRY_ERROR ×4 |
| PC-4 | 15 | 15 | REGISTRY_ERROR ×15 (tm.sys 손상) |
| PC-5 | 14 | 14 | SYSTEM_SERVICE_EXCEPTION ×14 |
| PC-6 | 11 | 11 | DRIVER_POWER_STATE_FAILURE ×11 |
| PC-7 | 10 | 10 | SYSTEM_SERVICE_EXCEPTION ×10 |
| PC-8 | 9 | 9 | KMODE ×9 |
| PC-9 | 10 | 9 | SYSTEM_SERVICE_EXCEPTION ×8 |
| PC-10 | 10 | 8 | REGISTRY_ERROR ×9 |
| 그 외 5대 | 3~4 | 3~4 | — |
| 그 외 2대 | 2 | 2 | — |

## 정정: 오탐으로 확정

결론이 뒤집혔다. 위 집계 자체는 사실이지만 「메모리 불량」이라는 해석이 틀렸다.

가장 많이 걸린 PC-1의 전체 덤프를 `cdb`로 세 조건에서 다시 분석했다.

- 심볼 없이, 그 PC의 `ntoskrnl.exe`만 주고 분석(제품이 실제로 쓰는 조건): `!chkimg`가 1,941바이트를 손상으로 센다.
- Microsoft 심볼을 주고 분석: 손상으로 세는 바이트가 7바이트로 줄어든다.
- 그 7바이트의 정체를 확인: 부팅할 때 커널이 채우는 CFG(Control Flow Guard) 포인터(`nt!_guard_check_icall_fptr` 등)였다.

손상으로 잡힌 자리가 PC를 넘어서도 같은 오프셋·같은 값으로 나온 것도 같은 이유였다. 26200.7623 커널에서는 예외 없이 213곳이 손상으로 잡혔는데, 그중 184~187곳이 11대 PC에서 동일했다. PDB 없이 `!chkimg`를 돌리면, 커널이 부팅 뒤 스스로 고쳐 쓰는 자리를 전부 손상으로 센다. 분석기에 동봉한 DbgEng(10.0.18362)이 오래된 것도 겹친 요인이었다.

심볼로 다시 본 39건 중 한 배치에 속한 15/17건은 레지스트리 하이브 손상이었고, 나머지는 PC마다 원인이 달랐다. 이 결과로 「`!analyze -v`의 memory corruption 판정을 그대로 받아들이는」 수정은 반영하지 않기로 했고, 「메모리 점검」을 권고하는 통지도 만들지 않기로 했다. 메모리 하드웨어 단서는 덤프가 아니라 `WHEA-Logger` 19/18 이벤트와 PC 하드웨어 정보(CPU·메모리·시스템)를 PC 단위로 묶어 보기로 방향을 바꿨다.

이전 해석이 틀렸던 지점도 같이 정리한다. 콜스택이 전부 `nt`로 보인 것은 심볼이 없어 프레임 이름을 못 붙인 결과였을 뿐, 실제 BugCheck 버킷은 PC마다 달랐다. 예를 들어 PC-1은 `0x139_1d_INVALID_BALANCED_TREE_nt!KiFastFailDispatch`였고, 앞서 말한 배치는 레지스트리 하이브 손상이었다. memtest는 하지 않기로 했다.

## 실제 BugCheck·크래시 분포

고유 175건의 커널 크래시 분포: KMODE 57, SYSTEM_SERVICE_EXCEPTION 52, REGISTRY_ERROR 25, PAGE_FAULT_IN_NONPAGED_AREA 5, DRIVER_POWER_STATE_FAILURE 5, DRIVER_IRQL_NOT_LESS_OR_EQUAL 4, INTERNAL_POWER_ERROR 4, MEMORY_MANAGEMENT 4.

유저 크래시 440건에서는 GigabyteDownloadAssistant.exe 46, explorer.exe 29, MRecovery.exe 23, POWERPNT.EXE 23, XSAppr.exe 19, Hwp.exe 16, MaestroNSvr.exe 16건이 많았다. 이쪽은 큰 문제보다는 뒤에 설명할 분석기 판정 문제가 대부분이었다.

실제 모듈이 원인으로 특정된 것은 tm.sys 15건(손상), igdkmdn64.sys 4건(인텔 그래픽, DRIVER_POWER_STATE_FAILURE), TfFRegNt.sys 4건, MeDVpDrv.sys 4건, netadaptercx.sys 3건이었다.

## 반복 업로드와 구버전 분석기 — 하드리스토어 환경

이 대학의 실습 PC는 하드디스크 복원 솔루션이 부팅마다 시스템 드라이브를 되돌리는 환경이었다(OR-1748이 규명한 원인과 같다). `C:\ProgramData\Orange`에 있는 분석기 리포트·압축본·DB와 에이전트 바이너리가 매 부팅 사라졌다.

- 같은 덤프가 반복 업로드된 것은 전부 C: 설치 PC에서만 났다(14개 덤프, 39회). V: 설치 PC 30대는 0건이었다. C:에서 V:로 옮긴 PC 한 대는 이전 당일 한 번만 더 올라가고 멈췄다.
- 4월 24일 빌드 분석기가 여전히 커널 130건을 분석하고 있었고, 이 빌드의 원인 미특정률은 91%였다(9월 17일 빌드는 55%). BSOD가 가장 많은 PC 10대 대부분의 최신 분석이 여전히 이 구버전이었다.
- 9월 21~22일에도 C:에서 반복 업로드가 난 PC들은 복원 솔루션이 있는데도 V:로 재설치되지 않은 PC였다.
- 설치 시각이 2026-07-07로 찍힌 PC는 고스트 이미지로 배포된 구버전 에이전트였다.

이건 에이전트 코드 결함은 아니었다. `report=true`일 때 `DETECT2::Report()`가 `pDump->doc`을 가리켜(`CDetect.h:116`) `MEMORY.DMP.json`에 남기는데, 이 파일 자체가 리스토어로 사라지는 구조였다. 대응은 OR-1660(V: 드라이브 설치)·OR-1799(registry.ini로 이전)로 이미 있었고, 현장 방문에서 복원 솔루션이 있는 PC들을 V: 설치로 옮겼다. 남은 5대는 재설치로 닫힌다.

## 미니덤프 선택 문제

215건 중 155건이 미니덤프(`DEBUG_KERNEL_SMALL_DUMP`, `C:\Windows\Minidump\` 경로)를 분석한 것이었다. 가장 오래된 사례는 2023년 11월 덤프를 2026년 9월에 분석한 것이었다. OR-2228 수정이 배포되면 닫힌다.

## 덤프 분석기 결함 수정

코드 위치는 전부 `agent/DumpAnalyzer/` 아래다. 우선순위 순으로 정리한다.

1. **`!analyze -v`의 memory corruption 판정을 그대로 받아들이는 수정 — 반영하지 않음.** 위에서 정리한 대로 오탐으로 확정됐기 때문이다. 원래 설계는 `MODULE_NAME: memory_corruption` 또는 `MEMORY_CORRUPTOR:`가 있고 손상된 모듈이 `same=True`일 때 `category = "memory"`로 내는 것이었는데, `same=True`가 오탐을 걸러내지 못한다는 것이 이번에 드러났다. 심볼 없는 환경에서는 `!analyze`의 버킷 판정 자체를 쓸 수 없다는 것이 결론이다.
2. **커널 덤프의 프로세스 이름 식별 — 완료.** `GetTargetProcessName`(`CDumpAnalyzer.h:2271`)이 오프셋 0의 모듈명을 물어 항상 `ntkrnlmp.exe`를 반환하고 있었다(119/121건). SYSTEM_SERVICE_EXCEPTION 56건은 유저 syscall 도중 죽으므로 어느 프로세스였는지가 핵심 단서인데, 이 버그로 그 단서가 전부 빠지고 있었다. `!analyze -v`의 `PROCESS_NAME` 파싱 또는 `EPROCESS.ImageFileName`으로 채우도록 고쳤다.
3. **KMODE(0x1E)에 Raw Stack Scan 적용 — 절반 완료(OR-2257).** `CDumpAnalyzer.Callstack.cpp:222`에서 `uContextRecord`가 0x3B·0x7E BugCheck에서만 설정돼, KMODE(0x1E)는 컨텍스트 없는 방법 1(KeBugCheck 경로)만 시도했다. 스캔 범위 4KB도 커널 스택보다 작았다. 지금은 같은 자리에서 0x1E를 포함해 0x50·0xD1·0x0A·0x8E·0xBE·0xFC까지 `KTRAP_FRAME`을 찾아 방법 2·3을 추가로 태운다. 스캔 범위 확대(`:270 stackData[512]`)는 아직 남았다.
4. **0x139 BugCheck 인수 해석 정정 — 남음(OR-2257로 커밋 예정).** `CDumpAnalyzer.h:857`이 arg3을 코드 주소로 읽고 있었는데, 가장 많이 걸린 PC 한 대의 0x139 크래시 4건이 전부 같은 풀 주소를 가리킨 것이 이 버그 때문이었다. Microsoft 문서로 대조한 결과, 0x139의 arg1은 손상 종류(FAST_FAIL 코드), arg2는 예외를 일으킨 트랩 프레임 주소(`KTRAP_FRAME`), arg3은 예외 레코드 주소(`EXCEPTION_RECORD`), arg4는 예약값이다. 코드 주소는 arg2를 `KTRAP_FRAME`으로 읽어 `Rip`을 얻거나, arg3을 `EXCEPTION_RECORD`로 읽어 `ExceptionAddress`를 얻어야 한다(둘 다 역참조가 필요). arg1은 그대로 「커널 자료구조 손상」 종류로 표시한다.
5. **.NET/WPF 프레임워크 티어 보강 — 남음(OR-2257로 커밋 예정).** 프레임워크 테이블(`CDumpAnalyzer.h:484`)에 `mscor*`·`clr`·`coreclr`·`ucrtbase`·`jvm`만 있고 `PresentationFramework`·`System.*`가 없었다. GigabyteDownloadAssistant.exe 크래시 45건이 전부 `PresentationFramework.ni.dll`·`clr.dll`로 귀결됐고, Office Click-to-Run의 `C2R64.dll` 34건도 같은 성격이었다.
6. **분석 시간 — 후순위.** 중앙값 8초, 300초를 넘긴 것이 5건 있었다. 원인은 아직 확인하지 못했다.

## 원인 모듈을 못 찾은 168건

미특정 168건을 fault 주소 기준으로 나눠 봤다.

| 유형 | 건수 | 실체 | 대응 |
|---|---|---|---|
| fault가 ntoskrnl 안, 스택 전부 `nt` | 121 | 심볼 없이 프레임 이름을 못 붙인 memory corruption 오탐. 심볼로 보면 PC마다 원인이 다름 | 위 1번 정정, 0x139 인수 정정(4번) |
| fault 주소가 어느 모듈에도 없음 | 44 | BugCheck 인수가 코드 주소가 아님(0x51·0x9F·0xA0·0x18·0x139) | 인수 매핑 정정 |
| 스택에 등재되지 않은 커널 주소 | 7 | 덤프 모듈 목록에 없는 코드 | 아래 |

등재되지 않은 주소는 OR-1905(Unknown_Module)와 같은 근본 원인이다. 심볼 없이 찾으려면: 언로드된 모듈 목록과 먼저 대조하고(215건 전부에 `loaded=False` 항목이 base·end와 함께 있었다), 그래도 없으면 살아 있는 PC에서 현재 로드된 커널 모듈을 다시 열거해(`PhEnumKernelModules`, OR-1954에서 쓰던 방식) 덤프의 모듈 목록과 비교한다. 베이스 주소는 부팅마다 바뀌므로 이름·크기로 맞춘다. 어느 이미지에도 없으면 풀 메모리에서 실행된 코드로, 보안·복원 소프트웨어의 커널 훅일 수 있다(이 사례에서는 특정 복원·백신 소프트웨어가 설치돼 있었다). 이런 경우는 「미등재 실행 코드」로 표시하고 그 PC에 설치된 보안 소프트웨어 목록을 함께 붙인다.

## 공통 원인을 알리는 방법 — 방향 전환

분석기는 원래 「어느 모듈이 원인이냐」에 답하도록 설계돼 있었는데, 이번 BSOD의 8할은 그 답이 모듈이 아니었다(오탐이었으므로). 그래서 「메모리 불량 PC를 모아 알린다」는 처음 목표는 접었다.

대신 방향을 바꿨다.

- 분석기는 모듈 중심 판정을 유지한다. 메모리 하드웨어 단서는 덤프가 아니라 `WHEA-Logger` 19/18 이벤트와 PC 하드웨어 정보(CPU·메모리·시스템)를 PC 단위로 묶어서 본다.
- 서버·룰 쪽에서는 PC별 BSOD 누적을 묶어 「반복적으로 블루스크린이 나는 PC」를 뽑는 쪽으로 간다. 가장 많이 걸린 PC 두 대(25건, 21건)는 개별 덤프 하나하나보다 반복 자체가 진단이 된다.
- 업로드 완료 상태·분석기 버전·덤프 처리 이력은 리스토어로 사라지지 않는 곳에 저장한다(OR-1799).

---

*Orange Platform 덤프 분석기의 BSOD 원인 분석 리포트입니다.*
