---
title: "실행 중인 EXE 삭제 실패(STATUS_CANNOT_DELETE)를 미니필터로 탐지하기 — Deleter·Runner·Launcher 3자 식별"
excerpt: "탐색기에서 실행 중인 a.exe를 cmd del로 지우다 '액세스가 거부되었습니다'가 뜨는 케이스를 ofilter 미니필터와 yagent21이 어떻게 잡아내는지, MmFlushImageSection 실패 경로와 3자 식별 룰 매핑까지 정리합니다."
category: tech
date: 2026-06-11
author: wychoi-orangelabs
tags: [Windows Driver, Minifilter, STATUS_CANNOT_DELETE, MmFlushImageSection, FltSendMessage, Orange Platform]
---

## 개요

탐색기에서 실행 중인 `a.exe`를 `cmd del`로 삭제할 때 "액세스가 거부되었습니다"가 발생하는 케이스를 탐지/보고하도록 `ofilter`(드라이버)와 `yagent21`(에이전트)을 고도화했다.

- **커널 원본 코드**: `STATUS_CANNOT_DELETE (0xC0000121)`
- **유저모드 표기**: `ERROR_ACCESS_DENIED (5)`
- **원인 정의**: 삭제 대상 파일이 **실행 이미지 섹션(`SEC_IMAGE`)**으로 메모리에 매핑되어 있어(실행 중 EXE 또는 로드된 DLL), 삭제 시 `MmFlushImageSection` 실패로 거부된다. 프로세스 부모/자식 관계와는 무관.

## 1. 드라이버 (`ofilter`)

기존엔 `PostSetInfoCallback`이 삭제 실패(`!NT_SUCCESS`)를 즉시 버려 `CANNOT_DELETE`를 관측조차 못 했음. 탐지/보고 경로를 신설.

- **`File.Filter.h`**: `FILE_FILTER_FAILED_CANNOT_DELETE (0x1000)` 플래그 정의. `PRESET_STANDARD/EXTENDED/FULL`에 추가(`STANDARD`가 기본값이라 기본 활성).
- **`File.Filter.cpp`**: `FilterFailedEventPost` / `FilterFailedEvent` 상태 게이트 switch에 `case STATUS_CANNOT_DELETE` 추가.
- **`File.SetInformation.cpp`**
  - `PreSetInfoCallback`: 진입 게이트에 `nFileFailed` 추가. disposition 게이트를 `FilterDeletedEventPre`와 `FilterFailedEventPre`가 **둘 다 차단일 때만** 콜백 생략하도록 완화(실패 이벤트도 Post까지 도달).
  - `PostSetInfoCallback`: 삭제 실패 분기 신설. `SetInfoIsDispositionDelete()`로 삭제 의도 확인 후 `status==CANNOT_DELETE`면 `FfProcess`로 보고. `__o5l3log_with_func` 진단 로그(Debug 빌드 한정). 자원 해제는 `__finally` 일괄 처리.
- **`File.Failed.cpp` (크래시 가드)**: `FfCreateFileMessage`가 `Parameters.Create.SecurityContext`를 무조건 읽는데, `FLT_PARAMETERS`는 union이라 `SET_INFORMATION IRP`에서는 쓰레기 포인터가 되어 역참조 시 BSOD 위험. `MajorFunction == IRP_MJ_CREATE`일 때만 읽도록 가드(status/경로/PID는 IRP 무관하게 정상 전송).

## 2. 에이전트 (`yagent21`)

기존 수신 핸들러는 status를 화이트리스트(`SHARING_VIOLATION` / `NOT_FOUND`)로만 처리해 `CANNOT_DELETE`를 조용히 폐기했음.

- **`include/yagent.define.h`**: `Y_MESSAGE_STATUS_CANNOT_DELETE (0xC0000121)` 상수 추가.
- **`include/INotifyCenter.h`**: `FailedEvent` enum에 `FileCannotDelete` 추가.
- **`CFileCallback2.File.cpp ProcessFailedFile`**
  - `errorDesc` 배열/status switch에 `CANNOT_DELETE` 케이스 추가.
  - `FileCannotDelete` `ruleId` 분기 신설.
  - **3자 식별**: Deleter(요청 PID), Runner(`EnumProcessPtr`로 `ProcPath==FilePath` 스캔, 대표 1건), Launcher(Runner의 부모 PID 조회).
  - Runner/Launcher 시작시간(ISO UTC + KST) 전송.
- **`CFileCallback2.h` / `CEventCallback2.h`**: `EnumProcessPtr`를 인터페이스에 pure virtual로 노출 + `CEventCallback2`에 forwarder override 추가하여 C4250 dominance 경고 제거.
- **`CAgentHelper3.NotifyCallback.cpp`**: `FailedEvent` switch에 `FileCannotDelete` case 추가. `RunnerPID`로 `cpptr = Runner` 해석(`cpptr`/`tpptr` 둘 다 있어야 룰 매칭, 없으면 바이패스).

## 3. 데이터 흐름 (end-to-end)

```
del a.exe (실행 중)
 → PreSetInfo: 콜백 등록
 → 삭제 실패 STATUS_CANNOT_DELETE
 → PostSetInfo: 실패 캡처 → FfProcess
 → FilterFailedEventPost: 0x1000 게이트 통과
 → FltSendMessage → agent
 → ProcessFailedFile: ruleId=FileCannotDelete, Deleter/Runner/Launcher 식별
 → Notify → NotifyCallback: cpptr=Runner 해석
 → MatchRule → 매니저
```

룰 변수 매핑:

| 변수 | 의미 |
|---|---|
| `{tpptr.*}` | Deleter (삭제 시도자) |
| `{cpptr.*}` | Runner (실행 중 프로세스, 삭제 불가 원인) |
| `{ev.Launcher*}` | Launcher (Runner를 실행한 부모, 참고 정보) |

## 4. 후속 / 미완료

- **DLL 삭제 케이스**: 현재 Runner 탐색이 `ProcPath` 매칭이라 실행 중 EXE만 탐지, DLL(모듈 로드) 미탐. 필요 시 모듈 테이블 검색으로 확장.

---

*Orange Platform 미니필터 드라이버 + 에이전트의 파일 삭제 실패 탐지 고도화 리포트입니다.*
