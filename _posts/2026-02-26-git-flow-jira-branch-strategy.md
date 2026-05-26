---
title: "Git Flow + Jira 연동 브랜치 전략 — 이슈 키로 커밋·브랜치·PR을 자동 추적하기"
excerpt: "팀 협업을 위한 Git Flow 기반 브랜치 전략과 Jira 연동 방법을 정리합니다. main/develop/feature/hotfix/release 구조, 이슈 키(OR-xxx)를 포함한 네이밍 컨벤션, Jira에서 브랜치·PR 생성부터 release/main 적용·태그까지의 전체 플로우를 단계별로 다룹니다."
category: tech
date: 2026-02-26
author: wychoi-orangelabs
tags: [Git, GitFlow, Jira, 브랜치전략, 협업, CI]
---

## 개요

Git Flow 기반 브랜치 전략으로 더 효율적인 협업 체계를 만듭니다. 기본 구조:

```
main            # 프로덕션 배포본 (태그 관리)
develop         # 통합 개발 브랜치
├── feature/    # 기능 개발 / 버그 수정
├── hotfix/     # 긴급 패치 (main 직접 분기)
└── release/    # 배포 준비 (버전 명시)
```

## 네이밍 컨벤션 — 이슈 키를 포함한다

```
feature/OR-123-windows-kernel-driver-ioctl
hotfix/2.1.0
release/2.1.0
```

- **Jira 이슈 키(OR-xxx)를 브랜치명·커밋·태그에 포함**해 자동 연동
- Jira에서 브랜치 생성 시 `feature/OR-xxx-...` 형태로 자동 생성되도록 설정
- hotfix는 이름이 곧 태그명이 되므로 버전을 입력
- 태그 메시지에 이슈 키 + 상세 내용 입력

## 전체 플로우

1. **Jira 이슈 생성**
2. **브랜치 생성 (Jira에서 직접)** — 대상 Repository 선택, **Branch from은 `develop`**, 이름 앞에 `feature/` 부여 후 생성
3. **작업 후 커밋·푸시** — 커밋 메시지에 **이슈 키 필수 포함**. 여러 커밋 가능
4. **PR 생성** — base는 반드시 `develop`. GitHub 또는 Jira의 "풀리퀘스트 만들기"에서
5. **코드 리뷰 및 Merge (관리자)** — 승인 시 Merge, 작업 브랜치 제거 여부는 관리자 선택. Merge되면 `develop`에 반영
6. **release 브랜치 생성·QA (관리자)** — `develop` 기반으로 `release/{version}` 생성(`git flow release start ...`). QA 중 발견된 버그는 release 브랜치에서 수정, 마무리 시 `develop`에 자동 역반영
7. **main 적용 (관리자)** — QA 통과 시 `main`에 적용하고 **버전 태그** 추가

## 왜 이슈 키를 강제하나

브랜치·커밋·PR·태그 어디서나 `OR-xxx`가 따라다니면, Jira 이슈 ↔ 코드 변경이 **양방향으로 자동 추적**됩니다. "이 기능이 어떤 커밋들로 구현됐나", "이 커밋은 왜 들어갔나"가 클릭 한 번으로 연결됩니다. (서버 push 단계에서 커밋 메시지가 이슈 키로 시작하도록 강제하면 추적 누락을 원천 차단할 수 있습니다.)

---

*Orange Agent 팀의 Git 협업 전략을 정리한 기술 노트입니다.*
