---
title: "DB Migration 체계·서버 모니터링 SNMP 5영역·매니저 상태 패널·커널 드라이버 데드락 — 분기 리뷰 (2026 Q2)"
excerpt: "smahn9123이 서버 DB Migration v0000 baseline 체계와 Python 환경 uv + 3.13 폐쇄망 오프라인 설치를 깔고, SungWoo824가 서버 모니터링 SNMP 5영역 + 카테고리 아코디언과 nginx 리버스 프록시·HTTP/2로 서버 성능을 끌어올리고, kim-tigerj가 매니저 상태 패널에 Core Web Vitals 기반 현장 진단 도구를 내장하고 Z-score 기반 증상 위젯 공통 상태 라벨 기준을 정립했으며, wychoi-orangelabs가 orange.sys Driver Unload 데드락의 진짜 원인(PreSetInfo의 ADS read)을 찾아 PostCreate로 옮기고 MS 서명 프로세스 SL 캡처 인프라를 깔았다."
category: dev-log
date: 2026-05-26
author: Orange Labs
tags: [분기, 백엔드, 프론트엔드, Windows에이전트, 인프라, 플랫폼, 보안, smahn9123, SungWoo824, kim-tigerj, wychoi-orangelabs, kimyh-orange]
---

2026 Q2(4/1 ~ 5/26) 분기 리뷰. 5명이 8개 레포에서 906커밋, +120,883/−66,931 라인(대량 커밋 제외). 두 달 동안 푼 문제를 멤버별로 정리한다.

```
멤버                커밋    +라인      −라인
────────────────────────────────────────────────
smahn9123           372    25,463    18,265
SungWoo824          224    34,991    15,310
kim-tigerj          208    37,665    19,396
wychoi-orangelabs    83    13,065     8,104
kimyh-orange         19     9,699     5,856
```

OJT 단계의 신입(hja, 입사 2026-05-21)은 manager-web 트레이닝 계획 단계라 활동 통계에는 포함하지 않았다.

---

## smahn9123 — 서버 아키텍처 대정비

**서버 DB Migration 체계 구축 — v0000 baseline + 순번 기반 (OR-374)**.
REST API·Service 두 서브모듈이 공유하는 MongoDB에 대해 버전별 마이그레이션이 추적 안 되던 구조(`upgrade.py` 522줄 단일 스크립트)를 정리. Beanie 내장·mongodb-migrations·Liquibase 등 후보를 라이선스·동기성·생태계 활성도로 전수 비교한 끝에 경량 자체 구현이 적합하다는 결론. `servers/migrations/` 공용 위치에 `BaseMigration` + `MigrationRunner` + `v0000_baseline`(`upgrade.py` 흡수) 구조를 짜고, `_migrations` 컬렉션으로 적용 이력 추적. 순번 기반(`v0001`, `v0002` ...) 네이밍으로 VERSION과 1:1 묶지 않아 평소 자유롭게 쓰고 릴리스 시점에만 manifest 작성. 24커밋의 분기 최대 작업.

**서버 Python 환경을 uv + 3.13으로 전환 + 폐쇄망 오프라인 설치 (OR-1045)**.
시스템 `python3 + pip + --break-system-packages` 운영을 `/home/@server/.venv/` uv 기반으로 전환. `pyproject.toml + uv.lock` 한 벌로 개발과 배포 모두 통일하고, Python 3.13 인터프리터를 패키지에 동봉(`@python/cpython-*.tar.gz`)해 폐쇄망에서도 네트워크 없이 설치 가능. 빌드(`uv export --no-dev`)와 설치(`uv pip sync --no-index --find-links wheels/`) 양쪽이 운영 의존성만 다루도록 dev 분리. systemd unit 7개·cron 3개의 python 경로 일괄 `.venv/bin/python`으로 변경. `orange` 계정 범용 pip은 독립 유지. 16커밋.

**Mosquitto 브로커 설정 강화 — 좀비 세션·메모리·로깅·logrotate (OR-1141)**.
기본 설정에 의존하던 브로커를 운영 관점에서 점검. 좀비 persistent session 7일 후 자동 정리(`persistent_client_expiration`), OOM 방어 위한 1GB `memory_limit`, `warning`/`notice`/`connection_messages` 추가로 인증 실패·브로커 상태 가시화, 미사용 비암호화 WS 리스너(3173) 제거로 공격 표면 축소, `max_keepalive` 300초로 dead connection 감지 지연 방지. 또 logrotate가 잘못된 경로(`/var/log/mosquitto`)를 바라봐 개발서버에 36GB 로그가 누적된 사실을 적발해 `/home/orange/mosquitto/`로 교정. 11커밋.

**Nginx 설정 개선 — 보안 헤더 상속 버그 + 폰트 immutable + 진단 로그 (OR-1144)**.
nginx_orange 16개 개선 항목을 도출해 11건 적용. Critical은 `add_header` 상속 함정 — `/manager/` 이하 7개 location에서 HSTS·nosniff·X-Frame-Options가 전부 누락되던 문제를 snippet include로 복구. 자체서명 환경에서 영구 차단 위험 있는 HSTS preload 플래그 제거, X-XSS-Protection을 0으로(폐기 + 공격 악용 가능), Permissions-Policy로 카메라·마이크·결제 등 8개 강력 기능 원천 차단, 폰트는 1년 immutable 캐시, access 로그에 `req_time`/`upstream_resp_time` 등 추가해 nginx vs REST API 병목 즉시 구분. gzip `comp_level`은 측정 데이터(level 5는 CPU 2.71배 vs 압축률 6.2%p) 근거로 1 회귀. 10커밋.

**KISA SW개발 보안 가이드에 따른 서버 코드 검증 (OR-994)**.
KISA(2021) 시큐어코딩 가이드 제4장 구현단계를 기준으로 rest-api/service 코드를 분석해 보안 결함 후보를 도출하고 순차 보강. 10커밋.

**폐쇄망 무인 서버 업데이트 스크립트 — update.sh (OR-1062)**.
외부망 단절 환경에서 운영자 개입 없이 서버를 최신 안정 버전으로 끌어올리는 스크립트. 패키지 검증·서비스 정지·`.venv` 갱신·migration 적용·서비스 재시작을 한 흐름으로 묶고, 중간 실패 시에도 silent skip이 일어나지 않도록 die/경고 정책 정리. 8커밋.

**mosquitto SSL_OP_IGNORE_UNEXPECTED_EOF preload shim 패키징 동봉 (OR-1414)**.
OpenSSL 3.0.x record layer 버그(partial TLS record + close 에러 시 SSL_CTX 공유 상태 손상)를 Ubuntu 24.04가 패치하지 않는 점을 격리 환경에서 확정한 뒤, `SSL_OP_IGNORE_UNEXPECTED_EOF` 플래그를 `LD_PRELOAD`로 주입하는 shim을 패키지에 동봉. WSL Ubuntu 24.04(glibc 2.39)에서 빌드한 사전 빌드 `.so`를 git에 동봉 + Makefile `MAX_GLIBC=2.39` ceiling을 `make verify`가 강제. 운영 서버 `.so`와 byte-identical(sha256) 확정. 11커밋.

**fail2ban 패키지 통합 — firewall.rules `__SSH_PORT__` 토큰화 (OR-1313)**.
인터넷 노출 서버 SSH 무차별 대입을 systemd journal 백엔드 + nftables banaction + 지수 증가 ban + recidive 메타-jail(24h 내 5번 ban → 1주 장기차단)로 차단. install/setup/update/uninstall 4개 스크립트에 일관 통합하고, firewall.rules에 `__SSH_PORT__` 토큰을 도입해 install 시점에 `detect_ssh_port` 헬퍼가 동적 치환하도록 만들어 고객사마다 다른 sshd 포트를 자동 반영.

**Service 계층의 API 스키마 의존 제거 — 순환 import 근본 정리 (OR-1425)** · **nodedetect v3 마이그레이션(OR-1424)** · **Playwright MCP 도입(OR-1361)** · **v3 파일 I/O 비동기 전환(OR-1422)** 등 5월 후반 작업도 동일 라인에서 계속됨.

---

## SungWoo824 — 서버 모니터링·성능 + 매니저 RBAC

**서버 모니터링 고도화 — SNMP OID 5영역 + 카테고리 아코디언 (OR-1055)**.
서버 모니터링에서 SNMP 모니터의 연결 장비 자동 스캔을 추가하고, 모니터링 목록 UI를 카테고리별 아코디언 그룹핑으로 개편. SNMP는 기본 시스템 정보·CPU 로드·메모리·인터페이스 트래픽·IP/인터페이스 매핑 5영역의 OID를 정리하고, 32비트 카운터 롤오버 보정과 비정상 차분 무시 로직까지 포함. SSL 인증서 체크 파싱 버그 수정과 대상 주소 입력 형식 유연화도 함께. 71커밋의 분기 최대 작업.

**서버 성능개선 — nginx 리버스 프록시 + HTTP/2 + WOFF2 폰트 (OR-1130)**.
Manager Web이 `:3181` REST API를 직접 호출하던 구조에서 449개 요청 + CORS preflight + 브라우저 6 커넥션 제한이 직격하던 문제를 nginx `/api/` 리버스 프록시 + HTTP/2 도입으로 정리. Same-Origin이라 preflight가 사라지고, HPACK 헤더 압축으로 반복 헤더 80~90% 감소, 단일 TCP 커넥션에서 멀티플렉싱. NotoSansKR 폰트는 TTF 5.9MB×2 = 11.8MB → WOFF2 4.1MB로 줄였다(jsPDF용 TTF는 별도 폴백 유지). Lighthouse Performance 55점 환경에서 시작한 사전 분석으로 근거를 만든 작업. 17커밋.

**관리자 계정 권한(RBAC) 시스템 — Store + Redis 캐시 + 위젯 ACL 동기화 (OR-1314)**.
`/v3/acl` 통합 라우터(endpoint/widget/feature/role 14개 엔드포인트)와 Store 컬렉션 패턴(`EndpointAclStore`·`WidgetAclStore`·`RoleDefinitionStore`·`FeaturePermissionStore`) + Redis 캐시를 깐 위에서 안정화 마무리. `_check_endpoint_acl`에 `_OPEN_ACCESS_OPERATIONS` 바이패스 추가, 위젯 ACL R/W/D 동기화 버그 수정, role 삭제 시 `FeaturePermissionStore` 캐스케이드 정리, HTTPException → 커스텀 예외 전환, 로그인 응답 ACL 직렬화 camelCase 정합까지.

**LiveCMD Role별 권한 적용 — Agent ACL 확인 엔드포인트 + 403 상세 응답 (OR-1415)**.
Agent용 LiveCMD 권한 확인 엔드포인트를 신설하고, `feature_permission` 빈 배열을 전체차단으로 정의 + 서버 시작 시 기본값 생성. 403 응답에 거부된 method/path/operation_id를 동봉해 매니저의 `PermissionErrorBoundary` 오버레이가 어떤 API가 막혔는지 정확히 표시. 20커밋.

**새 엔드포인트 추가 알림 — is_reviewed 추적 + 토스트 + 미확인 배지 (OR-1359)** · **설정 영역을 위젯 → 기본 내장으로 — ACL OR 합산 버그 근원 해소 (OR-1413)** · **고객사별 기본 ID/root 생성 (OR-1295)** · **Live CMD 타입 추가 — session_denied 감사 (OR-1158)** 등으로 권한 체계 인프라를 완성.

---

## kim-tigerj — 매니저 진단 도구 + 통계 기반 이상 탐지 기준

**매니저 상태 패널 — 현장 진단 도구 내장 (OR-1105)**.
현대해상에서 12대 노드만으로 Manager가 심하게 느려진 사례(OR-1101)를 계기로, 오른편 요약 패널 '상태' 탭에 현장 즉시 진단 도구를 내장. 대시보드 진입과 동시에 `browserCollector`·fetch/WebSocket/error interceptor·`perfStats`가 일제히 가동되어 처음부터 모든 데이터를 기록. Google Core Web Vitals + Lighthouse 가중치로 종합 등급(양호/개선 필요/느림) 산출, 10초 간격 `/health/live` 핑으로 네트워크 vs 서버 병목을 즉시 구분, 캐시 카드(`PerformanceObserver('resource')`)로 폰트 반복 다운로드 같은 문제가 곧바로 드러나도록 설계. 31커밋의 분기 최대 작업.

**증상 요약 위젯 공통 이상 탐지 기준 — Z-score 기반 상태 라벨 (OR-1113)**.
관리자가 룰별 임계값을 설정하지 않아도 위젯이 스스로 '평소 vs 지금'을 판정해 수집 중/정상/상승/급증을 표시하는 통계 기반 기준을 정립. 과거 6일 일별 고유 노드 수의 평균·σ(최소 하한 1.0) 위에서 2σ 초과면 상승, 3σ 초과면 급증으로 판정. 설치 초기처럼 비교 데이터 없는 상태에서는 '정상'이라는 근거 없는 안심을 주지 않고 '수집 중'으로 정직하게 표현. 라벨도 '주의/경고' 같은 판단어 대신 '상승/급증' 같은 사실 전달어. `typeEvent` prop으로 TCP/IP·CPU 점유·DNS 등 전 카테고리 자동 적용 — 향후 모든 증상 요약 위젯의 공통 기준. 12커밋.

**ConPTY 감사로그 개선 — 감사 전용 토픽 + Agent 정제 발행 (OR-991)**.
기존엔 실시간 터미널 렌더링과 감사로그가 같은 토픽을 공유해 `dir` 명령 하나에 20~50개 noise 메시지가 쌓이고 입력/출력 연결도 불가능했다. `public/audit/live-response` 전용 토픽을 신설해 Agent가 정제된 페이로드(`action`·`manager_id`·`command`·`response` 등)를 발행, 동시에 동일 Agent에 여러 관리자가 LiveCMD를 동시 실행하면 한쪽 입력이 다른 쪽에 노출되던 보안 취약점을 세션 점유 모델로 차단.

**매니저 웹 성능 개선 — nginx 캐시 정책 + 폰트 prefetch 중복 제거 (OR-1142)**.
사내 192.168.0.35에서 재현된 느린 매니저 응답의 두 원인을 동시 해소. nginx `/manager` 전체에 걸려 있던 무차별 no-cache를 SPA 진입점·PACKAGE·SW·env 4곳만 no-cache로 좁히고 나머지(폰트/이미지/manifest)는 ETag 304 응답으로 정상화 — OR-1115 buildHash 메커니즘과도 정합. export 유틸이 3개 위젯에서 12MB 폰트를 각자 prefetch하던 중복도 공용 모듈로 통합해 제거.

**BSOD 분석기 마무리 — StackWalker pdb 다운로드 차단 + 콜스택 major 재배치 (OR-1310)** · **nodeInfo 위젯 종료 시 set.STATUS offline 미발송 — OR-1409 회귀 추적 (OR-1418)** · **LiveCMD @ 명령 간헐적 미인식 + 응답 UI 토스트 전환 (OR-1416)** · **패키지에서 p18(Agent UI) 제거 — c3 잔재 정리 (OR-1419)** · **Git·Jira 자동화 시스템 가동 (OR-984)** 등 5월 후반의 정밀 버그 추적도 같은 라인에서 진행.

---

## wychoi-orangelabs — 커널 드라이버 안정성·필터링

**orange.sys Driver Unload 데드락 근본 해소 — ADS read를 PostCreate로 이동 (OR-1290)**.
`sc stop orange` 안 됨 증상의 진짜 원인은 `PreSetInfoCallback`에서 ADS(`:o5l3c`) 읽기 위해 `FltCreateFileEx2`를 부른 것이었다. `FileDispositionInformation` 처리 중 NTFS가 FCB ERESOURCE Exclusive + FILE_OBJECT Busy를 잡고 있는 상태에서 같은 스트림에 Create IRP를 던지면 lock-order inversion으로 드물게 hang → Stream Context 참조 release 안 됨 → `FltUnregisterFilter` 무한 대기 → 결과적으로 Unload 실패. ADS read를 PostCreate(자원 모두 푼 시점)로 이동하고, ERESOURCE → EX_PUSH_LOCK 전환·디버깅 RefTrack 추가·`driver-analyst`로 전수 코드 리뷰 17건 도출 후 P0 UAF(ProcessTable ProcPath freed 메모리 접근) 차단까지. 12커밋, 2일 작업.

**커널 드라이버 MS 서명 프로세스 필터링 — SL 캡처 인프라부터 게이트 0까지 (OR-1350)**.
파일 삭제/오류 룰의 노이즈를 드라이버 단에서 차단하려면 각 프로세스 SignatureLevel이 안정적으로 필요. 두 단계로 정비: ① SL 캡처 인프라 — `PsGetProcessSignatureLevel`을 `MmGetSystemRoutineAddress`로 동적 해결(import 노출 회피), `GetPreCreatedProcess` 경로에서 `EPROCESS->SignatureLevel` 직접 조회, LoadImage가 ProcessNotify보다 먼저 떨어지는 레이스(Edge `CREATE_SUSPENDED`) 처리 위한 `SignaturePending` 캐시, 모듈 콜백 분리(`LoadImageNotifyRoutineForCheckSignatureLevel`). ② File 이벤트 Pre 필터의 게이트 0으로 `SE_SIGNING_LEVEL_MICROSOFT`(8) 이상이면 즉시 차단. 11커밋.

**파일 삭제·오류 증상화 — Rule·드라이버·매니저 3축 동시 진행 (OR-1089)**.
파일 삭제/오류 탐지를 증상화하기 위해 Rule 세트(`FileSharingViolation`·`FileNotFound` 등)·드라이버 코드·매니저 증상 위젯 3축을 묶어서 추진. Rule 메타에는 CGID/CSID/SUID 식별자, evidence·Detail 마크다운 템플릿, priority 분기까지 명시. 공유 위반 시 점유자 식별과 삭제된 파일에 대한 `STATUS_OBJECT_NAME_NOT_FOUND`를 내부 `deleted_file` 테이블과 매칭하는 흐름이 핵심. 14커밋.

**Meter > 네트워크 모니터링 추가 — NetworkMonitor.dll (OR-1087)**.
기존 NetworkTrafficMonitor(MFC 독립 실행형)의 ETW 네트워크 수집 로직을 Meter 플러그인 아키텍처로 포팅. `EVENT_TRACE_FLAG_NETWORK_TCPIP + SYSTEM_LOGGER_MODE`로 프로세스별 TCP/UDP 송수신 바이트 실시간 캡처, `GetIfTable2()`로 활성 NIC 트래픽 합산, `GetExtendedTcpTable/UdpTable`로 네트워크 연결 보유 PID 탐지. 5커밋.

**orange.sys 파일 삭제·오류 탐지 코드 점검 — 형식 필터 + 점유자 추적 (OR-1132)**.
함수 접두어가 DF·FF로 뒤섞여 있던 부분을 풀어쓰기로 통일하고, 파일 형식(pe·압축·dump 3종만 허용) 필터링을 추가해 파일 오류 탐지 개수를 획기적으로 감소. `SHARING_VIOLATION` 발생 시 실패한 FileObject로는 Stream Context 조회가 불가하므로 `FltCreateFileEx2 + IO_IGNORE_SHARE_ACCESS_CHECK`로 임시 열어 점유자 후보 수집, ECP 리스트로 미니필터 재진입 방지, 에이전트 자체 PID는 `HolderEntryAdd`에서 제외.

**WebView2 가상 호스트 매핑 — file:// → https://orange.local (OR-1404)** · **SE_SIGNING_LEVEL 한계 분석 + PE Authenticode 추출 방향 (OR-1423)** · **파일 삭제·오류 필터링 시간 기반 throttle + LRU table 설계 (OR-1427)** 등 5월의 후속 설계도 같은 축.

---

## kimyh-orange — 룰·분석 + 현장 매핑

**증상 → 1:N 명령 워크플로우 단축 (OR-1154)**.
증상 노드 목록에서 '이 PC들 전체에 일괄 명령을 내려서 원인을 확인하고 싶다'는 현장 니즈가 가상 그룹 생성·노드 수동 추가·명령 위젯 호출의 10+클릭으로 끊겨 있던 흐름을 1클릭으로 단축. `summaryNodes` 위젯에 '1:N 명령' 버튼을 두고, `nCommandMain` 위젯이 `autoCreateInitials` prop을 감지해 대상 노드·제목이 미리 세팅된 채로 즉시 열리도록 설계. 가상 그룹 API 호출 없이 노드 ID 배열을 직접 전달.

**순천대 고객사 니즈 분석 — 49일 실측 + 국립대 전산실 통증 매핑 (OR-1420)**.
순천대가 우리 제품의 어떤 측면에서 가치를 느낄지 가설을 좁히기 위해, 49일치 매니저 실측 데이터(TCP 3,493 / DNS 2,574 / 비정상종료 268 / KillProcess 211 / CPU 점유 129건 등)와 7가지 데이터 축(시스템·앱·프로세스·네트워크·세션·ETW + 메타데이터)을 정리. 동시에 국립대 전산실의 6가지 구조적 조건(인력 부족·예산 제약·인프라 5~6팀 분산·감사 부담 등)과 10가지 통증(헬프데스크 본업 잡아먹기·장애 원인 책임 회피·다운타임 즉시 정치 폭탄 등)을 명확히 분리. 영업의 카운터파트는 기능 매칭이 아니라 통증 매칭이라는 결론으로 다음 미팅 전략을 정렬.

**wifi 룰 새 증상 발견 (OR-1223)** · **TCP/IP 룰 노이즈 정리·개선 방안 (OR-1104)** · **자원사용률 계산 기준 탐색 (OR-1334)** — 분석가의 본업 라인. 룰·분석은 '진행 중/해야 할 일' 상태로 길게 열려 있는 것이 정상이며, 실제 고객사 데이터(o5l3.com MongoDB의 수만 건 report·detect)를 파고들어 노이즈를 걷어내는 깊이가 핵심.

---

## 분기 흐름 요약

이번 분기의 큰 줄기를 한 문장씩 묶으면:

- **서버 인프라**: DB Migration 체계가 처음으로 정립됐고, Python 환경이 uv + 3.13으로 격리됐으며, Mosquitto·Nginx·MongoDB 설정 강화와 KISA 보안 검증·fail2ban까지 운영 인프라 자체가 한 번 다시 깔렸다.
- **서버 성능·모니터링**: nginx 리버스 프록시 + HTTP/2 도입으로 매니저 ↔ REST API 라운드트립을 줄이고, SNMP 5영역 기반 서버 모니터링이 본격적으로 들어왔다.
- **매니저 UX·진단**: Core Web Vitals 기반 현장 진단 도구가 상태 패널에 박혔고, 증상 위젯의 상태 라벨이 Z-score 기반 공통 기준으로 통일됐다. ACL 권한 체계도 안정화 마무리.
- **에이전트 커널**: Driver Unload 데드락의 진짜 원인(ADS read 위치)이 식별돼 PostCreate로 옮겨졌고, MS 서명 프로세스 SL 캡처 인프라가 깔리면서 파일 삭제·오류 룰의 노이즈를 드라이버 단에서 컷할 수 있는 토대가 완성됐다.

분기 전체 906커밋의 모양은 '운영 가능성(Operability)을 한 단계 끌어올린 두 달'이다.
