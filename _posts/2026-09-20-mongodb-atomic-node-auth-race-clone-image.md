---
title: "복제 이미지 PC 두 대가 한 노드 문서를 공유하는 경쟁 조건 — MongoDB에서 매칭과 티켓 회전을 원자화하기"
excerpt: "디스크 이미지로 배포한 PC 두 대가 동시에 부팅하면 같은 DeviceTicket으로 같은 노드 문서를 잡는다. read-modify-write 사이에 끼어드는 await와 MongoDB 단일 op 원자성의 한계, 그리고 find_one_and_update로 매칭·회전을 한 번에 묶는 해법을 정리한다."
category: tech
date: 2026-09-20
author: smahn9123
tags: [MongoDB, 경쟁조건, 원자성, 노드인증, 비동기, Python, Orange Platform]
---

## 개요

VM에 대해 앞서 막았던 동시 POST 경쟁 조건이 비-VM 환경에도 그대로 남아 있었다. 디스크 이미지로 배포한 PC는 레지스트리의 `DeviceTicket`을 같이 물려받는다. 그래서 같은 이미지에서 나온 두 대가 거의 동시에 부팅하면 같은 ticket으로 같은 노드 문서를 잡고, 그 세션 동안 두 PC가 한 노드 문서를 공유한다.

실습실처럼 같은 이미지로 뜬 30여 대가 한꺼번에 켜지는 환경이 대표적인 조건이다.

## 문제

비-VM POST는 다음 순서로 진행된다.

```
find_by_priority → (user 조회 · 조직도 조회) → _update_existing_node
```

이 시퀀스 사이에 `await`가 셋 있다. MongoDB는 **단일 op 단위로만 원자적**이라, 여러 op에 걸친 이 시퀀스 전체는 보호되지 않는다. 조회 중 이벤트 루프를 양보하는 순간 다른 요청이 끼어든다.

PC1과 PC2가 이미지에서 물려받은 같은 ticket `T0`을 동시에 제시하면 이렇게 어긋난다.

```
t=0  PC1: find_one({ticket: T0}) → 문서 X
t=1  PC2: find_one({ticket: T0}) → 문서 X        (같은 문서)
t=2~ 둘 다 user/조직도 조회에서 이벤트 루프를 양보
t=5  PC1: update(X, ticket=T1, guid=G1, ip=…)
t=6  PC2: update(X, ticket=T2, guid=G2, ip=…)    ← PC1 의 값을 덮는다
```

두 PC 모두 응답으로 `id=X`를 받아 레지스트리에 쓴다. 그 결과 같은 ClientID로 MQTT에 붙어 충돌하고 한쪽이 끊긴다. 그 세션 동안 문서의 이름·IP는 나중에 쓴 쪽 값으로 남는다.

## 지금은 한 세션으로 끝난다

비-VM 매칭에서 `ticketb`·`id`를 제거한 이후로는 다음 부팅에 결정적으로 갈라진다. PC1이 제시하는 ticket은 `T1`인데 문서는 `T2`이고 guid도 `G2`라 둘 다 어긋나 새 노드로 등록된다. 그 변경 이전에는 `ticketb`·`id`로 다시 합쳐져 영구 공유였다.

따라서 지금 남은 피해는 **한 세션짜리 MQTT ClientID 충돌**과 그동안의 귀속 오염뿐이다. 우선순위는 그만큼 낮다.

## 수정 방향

매칭과 ticket 회전을 **한 op으로 묶어**, 경쟁에서 진 쪽이 `None`을 받고 새 노드로 빠지게 한다. VM에서 쓴 것과 같은 수법이다.

다만 VM용 메서드를 그대로 재사용하면 안 된다. VM용은 `Or(ticket, guid)` 단일 쿼리라 우선순위가 없다. ticket이 가리키는 문서와 guid가 가리키는 문서가 다를 때(분열 직후 실제로 생긴다) 엉뚱한 문서를 회전시킨다. 비-VM은 순서를 지켜야 하므로 두 번으로 나눈다.

```
find_one_and_update({ticket: T}, 회전)   →  맞으면 끝
find_one_and_update({guid: G},   회전)   →  그 다음
```

`find_one_and_update`는 조회와 갱신을 한 번의 원자적 op으로 처리하므로, 두 요청이 같은 문서를 두고 경쟁해도 하나만 갱신에 성공하고 나머지는 빈손으로 돌아간다. read-modify-write 사이의 `await` 틈이 사라지는 것이 핵심이다.

## 착수 조건

사후 관측이 어렵다는 점이 걸림돌이다. access log에 ticket 헤더가 없어 두 요청이 정말 같은 ticket이었는지 확인할 방법이 없다. 그래서 관측 수단을 먼저 붙이거나(같은 문서에 1초 안에 서로 다른 IP 두 건이 기록되면 경고), 현장에서 증상이 잡히면 착수하기로 했다. 같은 이미지로 배포한 실습실 PC가 한꺼번에 켜지는 환경이 첫 후보다.

---

*Orange Platform 노드 인증 경로에서 발견한 동시성 문제 분석 리포트입니다.*
