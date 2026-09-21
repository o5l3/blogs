---
title: "하드복구(마에스트로) PC에서 드라이브 선택창이 안 뜨던 문제 — NSIS 감지 조건을 벤더 폴더로 완화하기"
excerpt: "하드복구 솔루션이 깔린 PC는 재부팅마다 C: 드라이브를 롤백해 에이전트가 사라진다. 설치 스크립트가 특정 실행파일 경로 하나로만 하드복구를 감지하다 최신 배포판을 놓쳐 C:에 설치되던 문제와, 벤더 폴더 존재만 확인하도록 완화한 조치를 정리한다."
category: tech
date: 2026-09-16
author: kim-tigerj
tags: [NSIS, 인스톨러, 하드복구, Windows, 에이전트배포, Orange Platform]
---

## 현상

마에스트로(하드복구) 솔루션이 깔린 실습실 PC에 에이전트를 설치할 때 드라이브 선택창이 뜨지 않았다. 그대로 시스템 드라이브(C:)에 설치되고, 마에스트로가 재부팅마다 C:를 롤백해 에이전트 상태·바이너리가 사라진다.

하드복구 환경에서는 C:가 매 부팅 원복되므로, 에이전트를 롤백 대상이 아닌 별도 드라이브(예: V:)에 설치해야 살아남는다. 그러려면 설치 시 드라이브 선택창이 떠야 하는데, 그 페이지가 나타나지 않는 것이 문제였다.

## 원인

설치 스크립트 `orange.nsi`의 드라이브 선택 페이지 표시 조건이 마에스트로를 **정확한 경로 하나로만** 감지했다.

```
C:\Program Files\Solusseum\MRecovery\MRecovery.exe
```

그런데 현장의 마에스트로는 최신 배포판이라 실제 경로가 셋 다 달랐다.

| | 코드가 찾는 것 | 현장 실제 |
|---|---|---|
| 드라이브 | `C:\Program Files` | `C:\Program Files (x86)` (32비트) |
| 제품 폴더 | `Solusseum\MRecovery` | `Solusseum\MaestroNet Agent7` |
| 실행파일 | `MRecovery.exe` | `MaestroNAgent.exe` (`MRecovery.exe` 없음) |

벤더 폴더 `Solusseum`만 공통이었다. 정확 경로 고정이라 최신판을 못 잡고 페이지가 Abort됐다. 무인 설치(`/S`)가 아니라 대화형으로 돌려도 경로 미스가 원인이라 뜨지 않았다.

## 변경

### 1. 드라이브 선택 표시 조건 완화

제품 폴더·실행파일 이름은 버전마다 바뀌므로(`MRecovery` → `MaestroNet Agent7` …), 벤더 폴더 `Solusseum` 존재만 확인하도록 완화했다. 32비트·64비트 경로를 모두 본다.

```
; 변경 전
	${IfNot} ${FileExists} "$PROGRAMFILES64\Solusseum\MRecovery\MRecovery.exe"
	${AndIf} $TESTMODE != 1
	${AndIfNot} ${FileExists} "C:\@DEV"
		Abort
	${EndIf}

; 변경 후
	${IfNot} ${FileExists} "$PROGRAMFILES64\Solusseum\*.*"
	${AndIfNot} ${FileExists} "$PROGRAMFILES32\Solusseum\*.*"
	${AndIf} $TESTMODE != 1
	${AndIfNot} ${FileExists} "C:\@DEV"
		Abort
	${EndIf}
```

### 2. 비시스템 드라이브 설치 폴더 숨김 처리

마에스트로 대응으로 V: 등 별도 드라이브에 설치하면 루트에 `Program Files`·`ProgramData`가 새로 생긴다. 이를 실습실 사용자 눈에 띄지 않게 숨김(`HIDDEN|SYSTEM`) 처리한다.

- 대상: 루트 `Program Files`·`ProgramData` + 설치 하위 폴더 `$INSTDIR`(…\ORANGE)·`$ORANGE_DATA`(…\Orange).
- 하위 폴더까지 명시적으로 숨긴다 — 속성은 폴더별 독립이라, 다른 제품이 루트 숨김을 풀어도 설치 폴더는 계속 숨겨진다.
- 비시스템 드라이브에만 적용(`$INSTDIR` 드라이브 ≠ `$WINDIR` 드라이브). 시스템 드라이브(C:) 설치는 시스템 폴더를 건드리지 않아 다른 환경에 영향 없음.
- 표시 속성만 바꾸므로 에이전트 실행·데이터 수집에는 영향 없다. 폴더 내부 파일도 그대로이며 설치·업데이트 재실행에 멱등이다.

```
  StrCpy $R0 $INSTDIR 2
  StrCpy $R1 $WINDIR 2
  ${If} $R0 != $R1
    SetFileAttributes "$R0\Program Files" HIDDEN|SYSTEM
    SetFileAttributes "$R0\ProgramData" HIDDEN|SYSTEM
    SetFileAttributes "$INSTDIR" HIDDEN|SYSTEM
    SetFileAttributes "$ORANGE_DATA" HIDDEN|SYSTEM
  ${EndIf}
```

관리자가 숨긴 폴더를 봐야 할 때는 탐색기 폴더 옵션에서 "숨김 파일 표시" + "보호된 운영 체제 파일 숨기기" 해제, 또는 명령창에서 `dir V:\ /a`로 볼 수 있다.

## 검증

- **감지**: 개발 PC에 현장과 동일한 `C:\Program Files (x86)\Solusseum\MaestroNet Agent7\`(`MaestroNAgent.exe` 등 18개) 구성을 만들어 재현. 옛 조건은 감지 실패, 새 조건은 감지 성공을 확인했다.
- 인스톨러 재빌드(Release) 후 현장 V: 설치로 드라이브 선택창 표시와 폴더 숨김 최종 확인은 별도로 진행한다.

---

*Orange Platform 에이전트 인스톨러의 하드복구 환경 대응 트러블슈팅 리포트입니다.*
