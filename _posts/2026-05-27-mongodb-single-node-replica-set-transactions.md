---
title: "MongoDB single-node replica set 전환 — 트랜잭션 활성화와 무중단 마이그레이션"
excerpt: "MongoDB는 standalone 모드에서는 multi-document 트랜잭션을 쓸 수 없습니다. 운영 중인 단일 노드 인스턴스에 클러스터를 새로 띄우지 않고도 single-node replica set으로 전환하면 트랜잭션을 사용할 수 있습니다. 인스톨러 idempotency, keyFile internal auth, PyMongo 자동 발견을 위한 rs.initiate host 선택, 운영 데이터 보존 마이그레이션까지 실측 기준으로 정리합니다."
category: tech
date: 2026-05-27
author: smahn9123
tags: [MongoDB, 트랜잭션, ReplicaSet, PyMongo, Docker, 운영, Orange Platform]
---

## 개요

REST API의 조직도 일괄 로드(`POST /v3/organization/load`)는 `clear → load_groups → load_users` 시퀀스로 동작합니다. 중간 실패가 발생하면 **부분 적재 상태**가 그대로 노출되는 문제가 있었습니다. 근본 해결은 MongoDB **multi-document 트랜잭션**으로 묶는 것입니다.

그러나 기존 운영 MongoDB는 standalone 모드라 트랜잭션을 쓸 수 없습니다. 본 작업은 **single-node replica set으로 전환**해 트랜잭션을 사용 가능한 상태로 만드는 인프라 준비입니다.

## 패키지 변경 사항

### `mongod.conf`

```yaml
security:
  authorization: enabled
  keyFile: /etc/mongo-keyfile        # 추가 — replica set internal auth (필수)
  javascriptEnabled: false

replication:                          # 추가 (기존 #replication: 주석 해제)
  replSetName: rs0
  oplogSizeMB: 2048                  # single-node 보수적 상한 (기본 5%/50GB 대신)
```

`keyFile`은 single-node여도 **인증이 켜진 replica set에서는 필수**입니다. internal cluster auth가 keyFile 없이 통과되지 않습니다.

### `setup.sh` / `update.sh`

`keyFile` 생성 (idempotent):

```bash
openssl rand -base64 756 > /etc/mongo-keyfile
chown mongodb:mongodb /etc/mongo-keyfile
chmod 400 /etc/mongo-keyfile
```

`mongod` 재시작 후 `rs.initiate()` **3단 분기**:

```
무인증 시도
  ├─ OK                       → fresh install (정상)
  ├─ AlreadyInitialized       → re-run (SKIP)
  └─ Unauthorized             → NEED_AUTH
                               └─ admin 자격증명으로 재시도 (마이그레이션 경로)

PRIMARY 진입 대기 (무인증·admin 양쪽 시도)
실패 시 exit 1 / die — mongod 사실상 사용 불가 상태에서 후속 단계 진입 차단
```

이 분기로 신규 설치·마이그레이션·재실행이 한 스크립트로 idempotent하게 처리됩니다.

## PyMongo 자동 발견과 host IP 선택

수정 불필요한 쪽: rest-api, service — connection string 변경 없음. PyMongo가 자동 발견 메커니즘으로 처리.

PyMongo는 connection string에 `replicaSet` 옵션이 없어도 **`mongod`의 hello 응답에서 `setName`을 보면 자동으로 ReplicaSet topology로 전환**하고, 멤버 목록의 host로 재접속합니다. 따라서 `rs.initiate()` 시 멤버 host는 **모든 클라이언트가 도달 가능한 IP**여야 합니다.

| 환경 | docker network | 사용할 `rs.initiate` host |
|---|---|---|
| 신규 패키지 설치 / 테스트 서버 (orange_net 존재) | 172.30.0.0/24 | `172.30.0.1:27017` |
| 개발 서버 (default bridge) | 172.17.0.0/16 | `172.17.0.1:27017` |

신규 설치는 `setup.sh`가 자동 처리합니다. 기존 운영 서버 마이그레이션은 **사전 점검 후 host IP를 결정**해야 합니다. 잘못된 IP로 `rs.initiate`하면 클라이언트가 PRIMARY 멤버에 닿지 못해 모든 쓰기가 실패합니다.

## WSL Docker 환경 시나리오 검증

| 시나리오 | `rs.initiate` 무인증 | `rs.initiate` (admin auth) | 결과 |
|---|---|---|---|
| Fresh install (user 없음) | OK | (호출 안 함) | ✓ |
| Migration (admin 존재 + uninitialized) | NEED_AUTH | OK | ✓ |
| Re-run (admin 존재 + initialized) | NEED_AUTH | SKIP_AlreadyInitialized | ✓ |
| 실패 경로 (mongod 없음) | (ping 실패) | — | exit code 1 ✓ |

## 서버별 마이그레이션 실행 결과

### 테스트 서버 (192.168.0.209) — 2026-05-27

- 방법: `setup.sh` update 모드
- docker network: `orange_net` → host=`172.30.0.1:27017`

```
RS_INIT_RESULT:NEED_AUTH
RS_INIT_RESULT:OK (admin auth fallback)
PRIMARY 진입 완료 (myState: 1)
```

검증:

- `rs.conf().members[0].host = 172.30.0.1:27017` ✓
- `oplog maxSize = 2048MB` ✓
- 트랜잭션 commit OK ✓
- 조직도 일괄 로드 테스트 (`POST /v3/organization/load`) — groups 14, users 35 정상 적재 ✓

### 개발 서버 — 2026-05-27

- 방법: 수동 마이그레이션 (`setup.sh`는 default bridge 환경에 부적합)
- docker network: default bridge → host=`172.17.0.1:27017`

데이터 보존 검증:

| 컬렉션 | 마이그레이션 전 | 마이그레이션 후 |
|---|---|---|
| groups | 14 | 14 |
| users | 35 | 35 |
| nodes | 64 | 64 |
| commands | 128 | 128 |

100% 보존 ✓. `rs.conf().members[0].host = 172.17.0.1:27017` ✓. oplog `2048MB` ✓. 트랜잭션 commit OK ✓. rest-api 컨테이너 + 9개 service systemd 모두 정상 재기동 ✓. 백업 보관: `/var/lib/mongodb.backup-20260527-2000` (6.4GB).

## 사용 가능해진 것

PyMongo / Beanie 모두 multi-document 트랜잭션 가능.

```python
# PyMongo
async with client.start_session() as session:
    async with await session.start_transaction():
        await coll1.insert_one({...}, session=session)
        await coll2.update_one({...}, session=session)
```

```python
# Beanie
async with mongo_client.start_session() as session:
    async with await session.start_transaction():
        await Group.find_one(...).update({...}, session=session)
        await User.insert_many([...], session=session)
```

**트랜잭션 안에서 호출하는 모든 query에 `session=` 인자 전달 필수**입니다. 빠뜨리면 트랜잭션 밖에서 실행돼 사실상 무방비입니다.

## read 트랜잭션 가이드

read만 하는 경우엔 보통 트랜잭션을 안 쓰는 게 좋습니다.

| 패턴 | 권장 시점 |
|---|---|
| 그대로 두기 (예: `get_user_group_hierarchy`) | 기본값. commit instant 외 race window가 마이크로초 수준이라 실용적 문제 거의 없음 |
| aggregation `$lookup` | 진짜 일관성 필요 + 성능도 한 번에 개선 (네트워크 왕복 2→1). hot path 권장 |
| read 트랜잭션 (`readConcern: snapshot`) | 다수 read를 하는데 호출 빈도 낮은 경우 (배치, 리포트 등) |

hot path(POST 인증 등)에서는 트랜잭션 비용이 부담입니다. aggregation이 더 가볍고 일관성도 보장합니다.

## 핵심 정리

- 단일 노드 운영 환경에서도 **single-node replica set만 활성화하면 트랜잭션을 즉시 쓸 수 있습니다.** 클러스터를 띄울 필요 없습니다.
- 인증된 replica set은 **`keyFile` internal auth가 필수**입니다. 인스톨러는 idempotent한 keyFile 생성 + `rs.initiate` 3단 분기로 신규/마이그레이션/재실행을 한 스크립트에 담아야 안전합니다.
- PyMongo는 connection string의 `replicaSet` 옵션 없이도 자동 발견되지만, **`rs.initiate(host:)`의 host가 모든 클라이언트가 도달 가능한 IP**여야 합니다. docker network에 따라 `172.30.0.1` / `172.17.0.1`이 달라집니다.
- 트랜잭션을 쓰려면 **모든 query에 `session=`을 빠짐없이 전달**해야 합니다. 누락 시 트랜잭션 밖에서 실행돼 효과가 없습니다.

*Orange Platform REST API의 multi-document 트랜잭션 활성화를 위한 MongoDB 인프라 전환 리포트입니다.*
