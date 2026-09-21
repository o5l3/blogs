---
title: "Windows 10 1507 기본 Edge에서 설치 파일이 안 받아지던 문제 — async·fetch·CSS 변수를 ES5로 되돌리기"
excerpt: "EdgeHTML 12(Windows 10 1507 기본 Edge)는 async/await·fetch()·CSS 변수를 지원하지 않는다. 다운로드 스크립트가 파싱 단계에서 통째로 죽어 파일이 오지 않던 원인과, XMLHttpRequest·msSaveBlob·16진수 색으로 되돌린 조치를 정리한다."
category: tech
date: 2026-09-18
author: kim-tigerj
tags: [브라우저호환성, EdgeHTML, JavaScript, ES5, Windows10, 다운로드, Orange Platform]
---

## 현상

Windows 10 1507 기본 Edge에서 에이전트 설치 파일을 받을 수 없었다. 받는 곳이 두 군데인데 증상이 서로 달랐다.

- 다운로드 안내 페이지(`/update`)에 들어가면 「다운로드해 주셔서 감사합니다」 화면이 뜨지만 파일은 오지 않는다. 화면이 완료를 말하므로 받은 줄 알고 나가게 된다.
- 첫 화면의 `Agent.x64`를 눌러도 아무 일이 없다.

같은 브라우저에서 글자 색도 빠졌다. 첫 화면 링크는 브라우저 기본 파란색으로, 흰 글자는 검정으로 나왔다. `/update`의 「다운로드해 주셔서 감사합니다」는 어두운 배경 위에 검정이라 거의 보이지 않았다.

## 원인

### 다운로드

두 페이지 모두 다운로드를 JavaScript로만 처리하고, 같은 코드를 각자 따로 들고 있었다. 그 코드가 쓰는 세 가지가 EdgeHTML 12(Windows 10 1507 기본 Edge)에 없다.

| 쓰는 것 | 지원 시작 |
|---|---|
| async / await | EdgeHTML 14 (Windows 10 1607) |
| fetch() | EdgeHTML 14 (Windows 10 1607) |
| `<a download>` | EdgeHTML 13 (Windows 10 1511) |

`async`는 문법 오류다. 스크립트 블록 전체가 **파싱 단계에서 죽는다.** 코드 안의 try/catch는 실행 이전이라 걸리지 않는다.

- `/update`는 페이지를 열면서 `downloadFile()`을 부르는데, 그 호출 자체가 일어나지 않는다. 화면은 정적 HTML이라 그대로 그려진다.
- 첫 화면의 `Agent.x64`는 `<div onClick="downloadFile()">`이다. 함수가 정의조차 되지 않아 눌러도 반응이 없다.

### 글자 색

색 규칙이 `rgb(243 244 246 / var(--tw-text-opacity, 1))` 형식이었다. 공백으로 구분한 rgb와 CSS 변수를 EdgeHTML 12가 읽지 못해 선언이 통째로 버려진다. CSS 변수는 EdgeHTML 15부터 지원한다.

## 조치

### 다운로드

다운로드 블록을 ES5로 다시 썼다. `XMLHttpRequest`로 파일을 받고, `navigator.msSaveBlob`(IE10·EdgeHTML 12~18)이 있으면 그것으로 저장한다. 없으면 기존 `a[download]` 경로를 탄다. 템플릿 리터럴도 문자열 연결로 바꿨다.

### 글자 색

색 다섯 개를 16진수로 바꿨다 (text-gray-100 `#f3f4f6`, text-gray-500 `#6b7280`, text-gray-700 `#374151`, text-orange-500 `#ea580c`, text-orange-700 `#c2410c`). 쓸 데가 없어진 `--tw-text-opacity: 1` 줄은 지웠다. 투명도를 1이 아닌 값으로 바꾸는 클래스가 없어 요즘 브라우저에서 보이는 색은 그대로다.

## 파일 이름 형식을 바꾸지 말 것

에이전트는 설치 실행 파일의 이름에서 접속할 서버를 읽는다. 확장자를 떼고 밑줄로 토큰 셋을 끊는다.

`ORANGE.x64_example.com_3181.exe`는 호스트 `example.com`, 포트 `3181`로 읽힌다.

셋이 모두 있어야 서버가 설정된다. 하나라도 빠지면 아무 말 없이 기본 서버로 붙는다. 포트가 3171이면 `http://`, 그 외에는 `https://`로 조립한다.

`a[download]`도 `msSaveBlob`도 없는 브라우저에서는 파일 이름을 정할 수 없다. 그때는 서버가 주는 `ORANGE.x64.exe`를 그대로 받게 두고 서버 주소는 싣지 않는다.

## 서버는 문제가 없었다

- TLS 1.2 정상. 인증서 검증 통과 (Let's Encrypt ECDSA)
- `ORANGE.x64.exe` 직접 요청 200, 18,783,824 바이트
- 1507 장비에서 페이지 자체는 열리는 것을 확인

`Content-Disposition` 헤더는 없다. nginx가 파일 이름을 붙이게 하면 JavaScript 없이도 서버 주소를 실을 수 있지만, 이번에는 페이지만 고쳤다.

## 이번에 고치지 않은 것

패키지 다운로드 페이지도 fetch로 목록을 그려 1507에서는 동작하지 않는다. 에이전트 설치와는 별개 기능이고 첫 화면에서 가는 링크도 주석 처리돼 있어 이번 범위에서 뺐다.

---

*Orange Platform 에이전트 다운로드 페이지의 레거시 브라우저 호환성 트러블슈팅 리포트입니다.*
