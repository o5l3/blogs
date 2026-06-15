---
title: "Docker Desktop 업데이트 후 빌드가 401로 죽던 cmd echo 함정 — --password-stdin 파이프 앞 공백"
excerpt: "이전엔 잘 빌드되던 makepackage.bat의 docker login이 어느 날부터 401 Unauthorized로 실패했습니다. 코드는 그대로였고, 범인은 cmd의 echo가 비밀번호 끝에 붙여 보낸 trailing space — 예전 Docker는 트림해줘서 통과되던 입력이 신버전에서 비밀번호 일부로 처리되게 바뀐 작은 호환성 변화입니다."
category: tech
date: 2026-06-11
author: smahn9123
tags: [Docker, cmd, --password-stdin, Build Failure, Trailing Whitespace, Orange Platform]
---

## 개요

`makepackage.bat`의 REST API Docker 이미지 pull 단계에서 `docker login`이 401 Unauthorized로 실패하며 빌드가 중단되는 문제를 수정한다.

## 원인

`echo %REGISTRY_PASSWORD% | docker login ... --password-stdin` 줄에서 `|` 앞의 공백 때문에 cmd의 `echo`가 **비밀번호 끝에 trailing space를 붙여 전달**했다(`<SECRET> ` ← 끝에 공백 1칸).

기존 Docker는 `--password-stdin` 입력의 뒤쪽 공백까지 트림해줘서 통과했으나, **Docker Desktop 업데이트 이후 개행만 제거하고 trailing space는 비밀번호로 취급**하게 바뀌면서 인증이 실패했다.

- 코드 자체는 변경 없음(git 확인).
- PowerShell 수동 실행이 성공한 이유: PowerShell `echo`(= `Write-Output`)는 공백을 인자 구분자로 버리기 때문에 끝 공백 문제가 안 생긴다. → 수동 재현이 안 돼서 처음엔 환경 문제로 오인할 수 있었던 케이스.

## 수정

`makepackage.bat`의 다음 한 줄에서 파이프 앞 공백 제거:

```bat
:: 이전 (cmd echo가 trailing space 부착 → 신버전 docker 인증 실패)
echo %REGISTRY_PASSWORD% | docker login ...

:: 수정 (파이프 앞 공백 제거 — Docker 버전과 무관하게 안전)
echo %REGISTRY_PASSWORD%| docker login ...
```

## 변경 범위

- `makepackage.bat` (1줄)

## 교훈

- cmd의 `echo`는 인자 사이 공백을 그대로 유지해 출력한다. `|` 앞 공백 1칸이 출력 끝에 그대로 붙는다는 사실은 평소 안 보이는데, 뒤쪽이 트림되는 소비자(이전 Docker)에서 작동하다가 트림 정책이 바뀌면 그제야 드러난다.
- PowerShell과 cmd의 echo 의미 차이도 함정. 한 셸에서 성공한다고 다른 셸에서도 같은 출력이 나오리라 가정하지 말 것.
- 비슷한 빌드/배포 스크립트에 같은 패턴(`echo VAR | cmd --password-stdin`)이 있다면 일괄 점검 권장.

---

*Orange Platform 빌드 스크립트 호환성 트러블슈팅 리포트입니다.*
