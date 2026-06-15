---
title: "WebView2 가상 호스트로 https 진입 후 로컬 아이콘이 깨지는 문제 — 두 번째 가상 호스트 매핑으로 해결"
excerpt: "file:// → https://*.local 가상 호스트 전환 이후 <img src>의 로컬 절대경로(IconPath)가 mixed-content로 차단되어 모든 프로세스·파일 아이콘이 깨져 보이던 버그를, 별도의 두 번째 가상 호스트로 아이콘 폴더를 매핑해 해결한 사례."
category: tech
date: 2026-06-12
author: kim-tigerj
tags: [WebView2, Virtual Host, Mixed Content, IconPath, Orange Platform]
---

## 현상

v1.6.240.48 배포 후 Agent UI(p18)의 실행/파일 화면에서 **모든 프로세스·파일 아이콘이 깨진 이미지로 표시되는 문제**가 발생.

## 원인

- 이전 작업에서 WebView2 진입을 `file://` → `https://orange.local` **가상 호스트**로 변경.
- p18이 `<img src>`에 넣는 `IconPath`(`C:\ProgramData\Orange\Icon\{해시}.ico`)는 로컬 절대경로 — https 문서에서 로드 차단.
- 가상 호스트 매핑은 `{Data}\WebApp\Template` 폴더만 커버 — 아이콘 폴더 `{Data}\Icon`은 매핑 밖이라 도달 경로 없음.

요약: https로 띄운 문서에서 `file://...ico`/로컬 절대경로 이미지는 mixed-content로 차단되는데, 첫 번째 가상 호스트가 커버하는 디렉토리에 아이콘이 없었다.

## 수정

- **agent 측**: `{Data}\Icon`을 **두 번째 가상 호스트** `https://orange-icon.local`로 매핑
  - `CWebview.h`: `Run` 시그니처 확장, 멤버 복사 후 비동기 콜백에서 매핑
  - `CWebApp.h`: 아이콘 폴더 전달
  - `orange.user.exe` v1.6.240.49
- **p18 측**: `iconUrl()`이 https 진입 시 `IconPath` 파일명만 떼어 `https://orange-icon.local/{파일명}`으로 변환, `file://` 폴백 진입은 기존 동작 유지
  - `control.js`(`agentIconUrl`), `main.js` 믹스인, `ProcInfo`/`Program`/`Sidebar.vue`

## 배포 주의

적용에는 **agent exe와 p18 dist 짝 배포 필요** — 한쪽만 배포되면 현재와 동일하게 아이콘 미표시 유지(악화는 없음). 따라서 한쪽만 먼저 올려도 추가 피해는 없고, 짝이 맞을 때 정상으로 돌아온다.

---

*Orange Platform Agent UI(WebView2) 아이콘 로드 문제 트러블슈팅 리포트입니다.*
