---
title: "원격제어 실행 파일을 59% 줄이다 — OpenSSL에서 mbedTLS로 바꾼 DTLS-SRTP 백엔드"
excerpt: "폐쇄망·PMS로 배포하는 원격제어 바이너리가 7.77MB로 커서 전송·설치 부담이 됐다. 용량의 대부분이던 DTLS/SRTP 크립토를 OpenSSL에서 mbedTLS로 교체해 3.14MB로 줄였다. 조각난 ClientHello 재조립 문제를 DTLS 역할을 바꿔 푼 과정을 정리한다."
category: tech
date: 2026-10-07
author: kim-tigerj
tags: [Windows, DTLS, SRTP, mbedTLS, OpenSSL, 원격제어, 바이너리최적화, Orange Platform]
---

## 현상

원격제어 실행 파일 `orange.remote.exe`가 7.77MB로 컸다. 폐쇄망과 PMS를 통해 배포·업데이트하는 제품에서는 실행 파일 크기가 그대로 전송·설치 부담이 된다.

## 결과

7.77MB → 3.14MB로 59.5% 줄였다. `/MT` 정적 단일 자립 실행 파일 형태는 그대로 유지했다. 사내 QA 빌드(원격제어 v0.1.0.174)에 반영했다.

## 방법

용량의 대부분을 차지하던 DTLS/SRTP 크립토 백엔드를 OpenSSL에서 mbedTLS로 교체했다. OpenSSL이 약 4.6MB를 차지하고 있었다.

- mbedTLS 3.6.5를 벤더링해 정적·`/MT`로 빌드했다. DTLS 1.2와 DTLS-SRTP만 켜고 TLS 1.3은 껐다. 원격제어에 필요한 기능만 남겨 크기를 더 줄였다.
- 걸림돌이 하나 있었다. mbedTLS의 DTLS 서버는 브라우저가 보내는 **조각난 ClientHello를 재조립하지 못한다.** 최근 브라우저는 양자내성 키 공유 때문에 ClientHello가 비대해져 여러 조각으로 나뉘어 온다. 그래서 원격제어를 DTLS 클라이언트로 전환해(offer에 `setup:active`를 실어), 브라우저가 DTLS 서버 역할을 맡게 했다. 핸드셰이크 주체를 바꿔 재조립이 필요한 쪽을 브라우저로 넘긴 것이다.
- 핸드셰이크 전에 `psa_crypto_init`를 호출한다(`PSA_CRYPTO_C`).

## 유지한 제약

크기를 줄이면서도 제품 배포 조건은 그대로 지켜야 했다.

- `/MT` 정적 단일 자립 실행 파일 — DLL 0개
- Windows 10 1507 호환
- 백신 오탐을 부르는 실행 압축(UPX 등) 금지

마지막 항목이 중요하다. 실행 압축으로 크기를 줄이면 간단하지만, 보안 제품 바이너리가 패킹되어 있으면 백신이 오탐할 위험이 커진다. 그래서 압축이 아니라 크립토 백엔드 교체라는 근본 방법을 택했다.

## 범위

원격제어 실행 파일의 빌드 구성과 의존성만 바꿨다. 노드·매니저와 주고받는 프로토콜은 손대지 않았다.

---

*Orange Platform 원격제어 실행 파일의 바이너리 최적화 리포트입니다.*
