---
title: "증상 목록 조회가 수 초씩 걸리던 문제 — $addFields 위치를 바꿔 MongoDB SBE 엔진에 올리기"
excerpt: "증상 목록 위젯의 기본 30일 조회가 노드가 많은 고객사에서 수 초씩 걸렸다. $match 바로 뒤의 $addFields가 파이프라인 전체를 classic 엔진에 묶어 둔 것이 원인이었다. 선그룹핑으로 순서를 바꾸고 커버링 인덱스를 더해 3.4~6.2초를 0.5~1.1초로 줄인 과정을 정리한다."
category: tech
date: 2026-10-23
author: SungWoo824
tags: [MongoDB, 집계파이프라인, SBE, 성능개선, rest-api, Orange Platform]
---

## 개요

증상 목록 위젯 첫 화면(유형·발생·원인 축)이 부르는 `GET /v3/detects` 상위 레벨 집계를 다시 짰다. 응답 스키마는 그대로이고 집계 순서와 인덱스만 바꿨다. 기본 기간인 30일 조회가 노드가 많은 고객사에서 수 초씩 걸리는 문제가 있었다.

## 기존 파이프라인과 바뀐 파이프라인

**기존**: `$match`(기간) → `$addFields`(문서마다 routine 키 계산) → `$match`($nin) → `$group`(그룹키) → `$sort` → `$facet`

`$match` 바로 뒤에 오는 `$addFields` 때문에 파이프라인 전체가 MongoDB의 classic 엔진에서 돌았다.

**변경**: `$match`(기간) → `$group`(노드, CGID, 그룹키) → routine 제외(`$nin` 또는 `$lookup`, 접힌 문서에만) → `$group`(그룹키) → `$sort` → `$facet`

첫 `$group`이 SBE(Slot-Based Execution) 엔진으로 내려간다. 선그룹핑 키에 그룹키(Type·Event / Name / Value)를 넣어, 같은 CGID가 시간대마다 다른 Name을 달고 와도 그룹 소속이 기존과 같게 유지된다. routine 제외는 (노드, CGID) 단위라 먼저 접은 뒤에 빼도 같은 행이 빠진다.

## API 영향도

경로·파라미터·응답 스키마는 바뀌지 않았다. 기존 코드와 같은 DB에서 24개 조건(3개 축 × routine 제외 방식·검색·노드 지정·기간·페이지·정렬)을 돌려 전체 그룹 집합이 같은 것을 확인했다. 하위 레벨(cuid·name2·value2·cgid)도 바뀌지 않았다.

## 변경 범위

| 저장소 | 파일 | 내용 |
|---|---|---|
| rest-api | `app/models/mongo/detect_node.py` | 상위 레벨 선그룹핑(`_toplevel_grouped_stages`), routine 키 식 공용화(`_routine_key_expr`) |
| rest-api | `tests/models/mongo/test_detect_node_grouped_toplevel.py` | 실 mongod 시험 7개(변이 2종을 잡는 것 확인) |
| 루트 | `servers/migrations/versions/v0060_detect_node_toplevel_cover.py` | `detect_node` 커버링 인덱스 `{time, id, CGID, Type, Event, TypeEventName, Name, Value, firsttime, lasttime}` 추가 |
| 루트 | `servers/VERSION`, `index_spec.json` | v0060 등록, 인덱스 명세 갱신 |

## 측정

가짜 데이터 1.1M 문서/30일, 노드 1,000개, MongoDB 8.2, WiredTiger 캐시 1GB에서 5회(또는 3회) 중앙값을 측정했다.

| 경로 | 기존 | 변경(즉시) | $id 전환 후(v0060 인덱스 사용) |
|---|---|---|---|
| 유형 축, routine $nin | 3.4~3.8초 | 2.2초 | 0.6~0.8초 |
| 발생·원인 축, routine $nin | 3.4~3.6초 | 1.9~2.6초 | 0.5~0.6초 |
| $lookup 경로(routine 1만 초과) | 5.7~6.2초 | 2.8초 | 0.9~1.1초 |

## 주의사항과 후속

v0060 인덱스는 노드 식별자로 `id`만 담는다. 지금 선그룹핑의 노드 식은 `$ifNull: [User.id, node_id, id]`라 이 인덱스로 덮이지 않고, 쿼리 플래너는 기존 `time_-1` 인덱스를 그대로 쓴다(배포해도 조회 계획이 바뀌지 않는 것을 확인했다). 다음 쿼리 결과가 0이면 노드 식을 `$id`로 바꾸는 패치(한 줄)를 적용한다. 0이 아니면 baseline의 노드 키와 어긋나 routine이 걸러지지 않는다.

```js
db.detect_node.countDocuments({
  "User.id": { $exists: true },
  $expr: { $ne: ["$User.id", "$id"] }
})
```

인덱스 비용은 1.48M 문서 기준 248MB다(기존 `time_-1`은 9MB). 쓰기 처리량은 20만 건 insert 2회 측정에서 1%·13% 줄었다. `detect_node`는 TTL이 없어 인덱스도 문서 수와 함께 커진다.

채택하지 않은 안도 있다. 축별로 인덱스 3개를 따로 만들었더니 플래너가 한 인덱스를 세 축 모두에 골라 2.2초에서 3.5초로 오히려 느려졌다. 노드 필드(`User.id`·`node_id`)까지 넣은 인덱스는 이득이 10~20%였지만, `/detect/list`의 `$lookup` 경로가 그 인덱스를 잘못 골라 5.7초에서 7.3초로 느려져 제외했다.

---

*Orange Platform REST API 성능 개선 작업 정리입니다.*
