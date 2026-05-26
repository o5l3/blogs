---
title: "Mosquitto 2.0 'Unable to write pid file' 원인 — 권한 강등과 systemd 디렉터리 소유권 충돌"
excerpt: "Mosquitto 2.0은 설정을 읽자마자 비특권 사용자로 권한을 낮춥니다. config에 user를 직접 지정했는데도 기동 시 'Unable to write pid file' 오류가 난다면, 설치 시 자동 생성된 systemd 유닛이 /run/mosquitto·/var/log/mosquitto 소유권을 mosquitto 사용자로 넘기기 때문입니다. 원인과 해결을 정리합니다."
category: tech
date: 2026-04-20
author: SungWoo824
tags: [Mosquitto, MQTT, systemd, Linux, 권한, 트러블슈팅]
---

## Mosquitto 2.0의 달라진 권한 동작

2.0 이전에는 Mosquitto가 root로 실행되면 TLS 인증서 로드·리스너·로깅을 먼저 한 뒤 비특권 `mosquitto` 사용자로 내려갔습니다. **2.0부터는 설정 파일을 읽은 즉시** 구성된 비특권 사용자(기본 `mosquitto`, 없으면 `nobody`)로 권한을 낮춥니다.

결과적으로 Mosquitto가 root로 접근하는 파일은 **설정 파일뿐**이고, 그 외 모든 파일(PID·로그·지속성 데이터·TLS 인증서)은 **강등된 사용자가 읽고 쓸 수 있어야** 합니다.

## 증상

설정에 사용자를 직접 지정한 경우를 봅시다.

```conf
user orange
pid_file /run/mosquitto/mosquitto.pid
persistence_location /var/lib/mosquitto/
log_dest file /var/log/mosquitto/mosquitto.log
listener 3183
protocol websockets
certfile /home/.ssl/server.crt
keyfile  /home/.ssl/server.key
```

`user orange`이므로 Mosquitto는 기동 직후 `orange` 사용자로 내려갑니다. 그런데 서비스가 뜰 때 이런 오류가 납니다.

```
Error: Unable to write pid file.
```

## 원인 — systemd 유닛이 소유권을 가로챈다

Mosquitto를 패키지로 설치하면 자동 생성되는 systemd 유닛(`/usr/lib/systemd/system/mosquitto.service`)을 보면, 기동 전에 `/run/mosquitto`와 `/var/log/mosquitto`의 **소유권을 `mosquitto` 사용자로 이전**하는 단계가 들어 있습니다.

즉 config에서는 `orange`로 권한을 낮추라고 했는데, 런타임 디렉터리는 `mosquitto` 소유라 `orange`가 `/run/mosquitto/mosquitto.pid`에 쓸 수 없습니다. **설정상의 실행 사용자와 systemd가 만든 디렉터리 소유자가 어긋나는 것**이 핵심입니다.

## 해결 방향

설정의 실행 사용자와 런타임 디렉터리 소유권을 일치시킵니다. 두 가지 접근:

1. **소유권을 실행 사용자에 맞추기** — `/run/mosquitto`, `/var/log/mosquitto`, `/var/lib/mosquitto`와 TLS 인증서/키를 실행 사용자(`orange`)가 읽고 쓸 수 있도록 정렬. 단 `/run`은 재부팅 시 초기화되므로, 일회성 `chown`이 아니라 부팅마다 보장돼야 합니다.
2. **systemd 유닛에서 보장** — 패키지 기본 유닛을 그대로 두지 말고 드롭인(`/etc/systemd/system/mosquitto.service.d/override.conf`)으로 `RuntimeDirectory`/`LogsDirectory`와 그 소유자를 실행 사용자에 맞게 지정하거나, `ExecStartPre`의 chown 대상을 일치시킵니다. `/run`은 `RuntimeDirectory=mosquitto`로 systemd가 매 기동 시 올바른 소유자로 만들게 하는 방식이 깔끔합니다.

핵심 원칙은 하나입니다 — **"Mosquitto가 쓰는 모든 경로는 강등 후 사용자가 접근 가능해야 한다."** PID·로그·persistence·인증서까지 빠짐없이 그 사용자 소유여야 합니다. (Let's Encrypt 인증서를 쓰면 갱신 훅에서 인증서 권한도 함께 맞춰야 합니다.)

---

*Orange Platform 서버 구성에서 정리한 기술 트러블슈팅 노트입니다.*
