---
title: "MQTT 메시지가 브로커 한도를 넘자 노드가 1분마다 접속이 끊긴 문제 — CONNACK Maximum Packet Size로 미리 걸러내기"
excerpt: "한 노드가 1분마다 MQTT에 붙었다가 2~4초 뒤 'oversize packet'으로 끊기기를 1,116번 반복했다. 원인은 mosquitto의 max_packet_size 한도였다. MQTT 5의 CONNACK Maximum Packet Size를 받아 두고 보내기 직전에 크기를 거르는 설계로 고쳤다."
category: tech
date: 2026-10-19
author: kim-tigerj
tags: [MQTT, mosquitto, 네트워크, 에이전트, Orange Platform]
---

## 현상

한 노드가 특정 시점부터 1분마다 MQTT에 붙고, 2~4초 뒤 브로커가 「oversize packet」으로 끊었다. 같은 날 1,116번 반복됐고, 다른 노드는 0번이었다. 브로커(mosquitto 2.1.2)의 한도는 `max_packet_size 2,000,000`이다.

sprocess 업로드와 1:N 명령이 모두 MQTT 위에서 돌아 함께 막혔다. HTTP로 가는 RULE·PACKAGE 전송은 정상이었다. 노드의 로컬 DB(log.cdb)가 3GB를 넘었는데, 보내지 못한 `server_data`가 쌓인 것으로 추정했다.

## 원칙

- 고정 크기로 미리 버리지 않는다.
- 서버가 명확히 거절한 것만 버린다. 명확한 거절은 MQTT 5의 CONNACK `Maximum Packet Size`와 DISCONNECT 이유 코드(`0x95` 등)로 정의한다.
- 에이전트는 MQTT 5로 통일한다.
- 거절해 버린 건은 `agent.error.log`에 한 줄 남긴다.

## 설계

연결마다 CONNACK의 `Maximum Packet Size`를 받아 둔다. 보내기 직전 PUBLISH 한 건의 실제 크기가 그 값을 넘으면 보내지 않는다. 저장된 건이면 `server_data`에서 지운다. 서버가 보낸 DISCONNECT 이유 코드는 기록만 한다.

QoS0은 소켓에 쓰자마자 성공으로 처리되기 때문에, DISCONNECT 이유 코드 `0x95`가 와도 어느 건이 걸렸는지 그 순간에는 확정할 수 없다. 그 밖의 끊김은 지금처럼 재시도한다.

## 남은 일

- 해당 노드의 `server_data`를 조회해 큰 메시지의 정체를 확인한다(1분마다 새로 만들어지는 것인지).
- `server_data`에는 바이트 상한이 없다(건수 1만 행만 제한). 조회 결과를 보고 상한·정리 시점을 보강한다.
- 밀린 건의 재전송 속도(1초에 한 건)를 확인한다.
- sprocess 쪽이면 성능 점수(pscore) 계산과 함께 판단한다.

---

*Orange Platform 에이전트의 MQTT 연결 안정화 작업 정리입니다.*
