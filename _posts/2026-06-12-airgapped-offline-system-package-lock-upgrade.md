---
title: "폐쇄망 Ubuntu 서버의 시스템 패키지 버전 lock + 오프라인 보안 업그레이드 (.deb closure 번들 + lock.json)"
excerpt: "인터넷 없는 운영 환경에서 nginx·redis·mongodb·mosquitto의 CVE 패치를 안전하게 적용하기 위한 system-packages.lock.json과 ubuntu:24.04 컨테이너 기반 의존성 closure 번들 설계를 정리합니다. 빌드 시간은 6.6분 → 49초로 줄였습니다."
category: tech
date: 2026-06-12
author: smahn9123
tags: [Ubuntu, apt, Airgap, Package Management, Lock File, Offline Upgrade, Orange Platform]
---

## 개요

Orange 서버 패키징(`package` 서브모듈)에 ① 시스템 SW(`nginx`/`redis`/`mongodb`/`mosquitto`) 버전 관리(lock), ② 폐쇄망 오프라인 보안 업그레이드, ③ 반복 빌드 가속용 로컬 `.deb` 캐시를 도입한다. `servers/*`의 `uv.lock`/`@python`/`wheels`와 동일한 **"목록은 git, 바이너리는 패키지에"** 철학을 시스템 패키지로 확장한 것.

## 배경 / 문제

- **tech-news 오탐**: 시스템 SW에 재현 가능한 버전 기록(lock)이 없어, 주간 tech-news 에이전트가 실제 설치 버전을 몰라 `nginx`/`redis`/`mongodb` CVE를 보수적으로 경보(예: "운영 서버 버전 확인 필요").
- **폐쇄망 보안 업그레이드 경로 전무**: `update.sh`(폐쇄망 무인 업데이트)는 시스템 apt 패키지를 전혀 건드리지 않았다. 인터넷이 없으니 한 번 폐쇄망에 들어간 서버는 `nginx`/`redis`/`mongodb`/`mosquitto` 보안 패치를 적용할 방법이 없었다.

## 해결

- **`install/conf.d/system-packages.lock.json`** (git 추적): 시스템 SW 버전 source of truth. tech-news와 update가 공유.
- **`fetch-system-debs.sh`** (신규): 빌드 시 `ubuntu:24.04` 컨테이너에서 `setup.sh`와 동일한 공식 저장소 등록 → 스톡 `noble` 대비 의존성 폐쇄(closure) `.deb` 다운로드 → `dpkg-scanpackages`로 apt 인덱스 생성 → 실제 받은 버전으로 lock 자동 생성. `@debs/noble/`로 동봉(git 미추적, 릴리스 ZIP에만).
- **`setup.sh` / `update.sh`**: `register_offline_deb_repo` + `upgrade_system_packages_offline`. lock 버전 > 설치 버전일 때만 `file://` apt 저장소로 오프라인 업그레이드 후 해당 서비스 재시작. update 자동 적용. install 온라인 경로는 불변(코드네임 접미사 충돌 회피).
- **빌드 `.deb` 캐시**: `package/.deb-cache/`(git 미추적)에 번들 `.deb` + 빌드도구 `.deb`(apt archives) + apt 인덱스(lists)를 캐시 → 반복 빌드 시 인터넷 재다운로드 0에 근접.

## 범위 결정사항

| 항목 | 결정 |
|---|---|
| Ubuntu 범위 | `noble`(24.04) 전용 번들. `focal`/`jammy`는 온라인 install로만 커버 |
| 번들 대상 | `nginx`/`redis`/`mongodb`/`mosquitto` 4개 전부(MongoDB 포함, 코드네임당 ~339MB) |
| 업그레이드 정책 | update 모드에서 lock > 설치 버전이면 자동 적용 |
| 제외 | `rest-api` Docker 이미지 태그 버전 고정은 범위 외 |

## 변경 범위

- **신규**: `install/conf.d/system-packages.lock.json`, `fetch-system-debs.sh`
- **수정**: `install/setup.sh`, `install/update.sh`, `install/uninstall.sh`, `makepackage.sh`, `makepackage.bat`, `.gitignore`, `CLAUDE.md`
- **별도(루트 레포)**: `tech-news/agent-prompt.md` — STEP 0가 lock을 인프라 버전 PRIMARY SOURCE로 읽도록 변경 (오탐 제거)

## 검증 (강력 검증 완료)

- **정적**: `bash -n` 전체 통과, `shellcheck` 추가 코드 0건
- **함수 정합성**: `setup.sh ↔ update.sh` 오프라인 함수 로직 동일(드리프트 없음)
- **번들**: 47개 `.deb` + apt 인덱스 + lock 생성, cold=warm 빌드 산출물 동일
- **오프라인 해석**: `--network none` 컨테이너에서 `mongodb-org` 8.2.10 실제 설치 성공(자가완결 번들 입증)
- **E2E**: 실서버 모사(온라인 apt 소스 전부 제거) 상태에서 `nginx 1.30.1 → 1.30.2` 오프라인 업그레이드(0바이트 네트워크), 미설치 패키지 skip, 멱등 재실행 skip, 서비스 재시작(mock), 임시 소스 정리 — 전 분기 검증
- **캐시**: warm 빌드 6.6분 → **49초**, 번들 동일
- **버그 수정**: `set -euo pipefail` 하에서 `apt-get download --print-uris`가 후보 없음/가상 패키지에 exit 100을 반환해 스크립트가 죽던 잠재 결함 방어
- **양 플랫폼 실빌드 성공**: Linux(`makepackage.sh`) + Windows(`makepackage.bat`, cp949/CRLF 무결)

## 리뷰 포인트 / 주의

- **MongoDB 자동 재시작**: 오프라인 업그레이드 시 `mongod` 재시작 발생(단일 노드 replica set `rs0` PRIMARY 재선출 짧은 끊김). 패치 릴리스 내 업그레이드라 데이터 호환.
- **자가완결 상위집합**: 번들은 "스톡 `noble` 대비 델타 closure"라 실제 운영 서버(더 많이 설치됨)에서는 업그레이드가 더 안전하게 해석된다.
- **graceful skip**: 번들 부재/코드네임 불일치(`focal`/`jammy`)/`python3` 부재 시 정상 skip.

---

*Orange Platform 폐쇄망 운영 인프라를 위한 시스템 패키지 lock·오프라인 업그레이드 도입 리포트입니다.*
