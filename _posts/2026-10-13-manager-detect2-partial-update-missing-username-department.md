---
title: "증상이 반복될 때 Manager 알림창에 사용자명·부서명이 비던 문제 — detect2 경량 메시지가 그리드 행을 통째로 덮어쓴 원인"
excerpt: "같은 증상이 반복되면 서버가 public/node/detect2로 경량 메시지를 보내는데, Manager(C3)가 이 메시지로 그리드 행 전체를 덮어쓰면서 사용자 id·SUID·FilePath 같은 필드가 사라졌다. 서버는 detect2 메시지에서 사용자 정보를 빼지 않도록 고치고, Manager는 전체 교체 대신 필드 단위 업데이트로 바꿔 해결한 과정을 정리한다."
category: tech
date: 2026-10-13
author: kim-tigerj
tags: [MQTT, Manager, AG-Grid, REST API, C3, Orange Platform]
---

## 증상

동일 증상이 반복적으로 일어나면 `public/node/detect2` 토픽으로 증상 정보가 메시지로 Manager에 전달된다. 이 메시지를 받은 뒤부터 증상 알림창에 사용자명·부서명이 빈 값으로 표시되고, 이후 실행·파일 정보 조회도 되지 않는 현상이 있었다.

## 원인

증상이 처음 표시될 때는 REST API로 모든 값이 채워진 상태로 그리드에 들어간다. 그런데 그 뒤 같은 증상이 반복되면서 `public/node/detect2`로 메시지가 오면, C3 Manager는 이 메시지로 해당 증상 행 전체를 통째로 교체하는 로직을 갖고 있었다.

문제는 detect2 메시지가 경량화돼 있다는 점이다. 불필요한 값을 덜어낸 메시지에는 사용자 id, `sprocess`의 SUID, `filelist`의 FilePath·FastHash 같은 필드가 없다. 이 경량 메시지로 그리드 행이 통째로 바뀌면서 두 가지 문제가 났다.

1. 증상을 일으킨 최종 사용자 id가 사라져 부서명·사용자명이 빈 값으로 표시됐다.
2. 해당 증상의 sprocess·filelist를 조회할 때도 사용자 id가 인자로 필요한데, id가 없어 연쇄 조회가 되지 않았다.

그 뒤로는 Manager에서 해당 증상이 제대로 표시되지 않았다.

## 조치

### 1. Server

`public/node/detect2`로 메시지를 보낼 때 사용자 정보(`User` — 신형 Agent가 올려보냄)와 `id`를 그대로 유지한 채 전달하도록 고쳤다. 지금 전송되는 detect2 메시지는 다음과 같다.

```json
{
    "CUID": 2918540984,
    "Desc": "CPU 코어 1개 이상 주기적 점유",
    "Type": 2,
    "Event": 8,
    "Name": "YMeter.exe",
    "Value": "CPU.dll",
    "count": 156,
    "firsttime": "2025-09-23T15:04:25.808000",
    "lasttime": "2025-09-24T04:12:54.241000",
    "user": 1,
    "id": "68a2de730f97315fa861d5f6",
    "User": null
}
```

### 2. Manager(C3)

전달 받은 메시지가 현재 증상 그리드에 이미 있는 행이면, 메시지로 행 전체를 바꾸지 않고 메시지에 있는 필드만 업데이트한다. 그리드 행에 없던 새 키가 메시지에 섞여 있을 때만 병합(merge) 후 트랜잭션으로 갱신하고, 그 외에는 셀 단위로만 값을 바꾼다.

```js
update(data, arr) {
    try {
        if (!data || !this.gridApi) return;

        const rowNode = this.gridApi.getRowNode(this.getKey(data));

        // 없으면 기존대로 추가
        if (!rowNode) {
            if (Array.isArray(arr) && arr.length) {
                this.gridApi.applyTransaction({ add: arr, addIndex: 0 });
            } else {
                this.gridApi.applyTransaction({ add: [data], addIndex: 0 });
            }
            return;
        }
        // 키 필드는 건드리지 않음
        const skipKeys = new Set(['CUID', 'time']);

        // row에 없던 "새 키"가 있는지 먼저 판단
        const hasNewKeys = Object.keys(data).some(k => !skipKeys.has(k) && !(k in rowNode.data));

        if (hasNewKeys) {
            // 새 키가 섞여 있으면 전체 머지 후 트랜잭션 업데이트 (예외 없음)
            const merged = { ...rowNode.data, ...data };
            this.gridApi.applyTransaction({ update: [merged] });
            return;
        }

        // 모두 기존 키면 셀 단위 부분 업데이트
        Object.keys(data).forEach(k => {
            if (skipKeys.has(k)) return;
            rowNode.setDataValue(k, data[k]);
        });
    } catch (e) {
        console.log(e);
        console.log(data, arr);
    }
},
```

전달 받은 메시지가 그리드에 없는 새 증상이면, detect2 메시지만으로 행을 추가하지 않는다. detect2 메시지에는 SUID·DUID·FastHash·FilePath 필드가 없어 다른 화면으로 연결되지 않기 때문에, REST API로 증상 전체 데이터를 받아 그리드에 추가한다.

이 두 동작은 `lasttime`에서 추출한 날짜가 Manager가 보여주고 있는 증상 발생일(`MAIN.yymmdd`)과 같을 때만 수행한다.

## 확인

위 조치 후 C3 Manager에서 증상의 실행·파일·알림이 정상적으로 표시됐다. 같은 로직을 Timeline, Timeline2에도 적용했다.

## 원칙

이번 문제를 계기로 역할을 나눴다.

- MQTT는 컨트롤 신호와 부분 업데이트를 맡는다.
- REST API는 전체 데이터 전달을 맡는다.

---

*Orange Platform Manager(C3)의 MQTT 실시간 업데이트 트러블슈팅 리포트입니다.*
