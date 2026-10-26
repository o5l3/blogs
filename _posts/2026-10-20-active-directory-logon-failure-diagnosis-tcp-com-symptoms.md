---
title: "AD 로그온 지연·실패 진단 — PC 쪽에서 포트별로 원인을 좁히는 방법"
excerpt: "그룹 정책 미적용, 로그온 지연 같은 Active Directory 장애가 보고되면 PC 쪽에서 무엇을 봐야 하는지 정리했다. Kerberos·LDAP·SMB 포트별로 증상을 나누고, TCP·COM 증상과 LiveCmd 명령으로 DC 연결부터 보안 채널까지 추적한다."
category: tech
date: 2026-10-20
author: kim-tigerj
tags: [Windows, Active Directory, Kerberos, 네트워크진단, 트러블슈팅, Orange Platform]
---

## 목적

Active Directory(AD)를 쓰는 환경에서 로그온 지연·실패, 그룹 정책 미적용 같은 장애가 보고될 때, PC 쪽에서 Orange The Client의 TCP 증상·COM 증상과 LiveCmd로 무엇을 보고 어떻게 판정하는지 정리한 절차다.

## AD 장애가 PC에서 드러나는 다섯 곳

| 곳 | 무엇 | PC 쪽 발현 |
|---|---|---|
| DNS | DC 찾기(SRV 레코드) | DNS 서버가 AD DNS가 아니면 DC를 못 찾아 로그온 자체가 안 됨 |
| DC 연결 | Kerberos 88, LDAP 389/636, SMB 445, RPC 135 + 49152~65535, GC 3268 | 포트별 연결 느림·실패 → 로그온 지연, GPO 미적용 |
| 시간 | NTP 123(UDP) | DC와 5분 넘게 어긋나면 Kerberos 전부 실패 |
| 보안 채널 | 머신 계정 암호 | 「트러스트 관계 실패」 |
| 그룹 정책 | SYSVOL·NETLOGON 공유 | 정책 미적용, 로그온 스크립트 대기 |

## 조사 순서

1. 도메인 이름 확인
2. 증상 화면에서 DC 상대 TCP·DNS 증상 수집
3. LiveCmd로 DC 찾기 → 연결 → 시간 → 보안 채널 확인(여기서 대부분 갈림)
4. 정상이면 그룹 정책·이벤트 로그
5. COM 증상·plugin.log로 로그온 경로의 COM 호스트(WMI·NLA) 종료·응답 없음 확인
6. 느린 PC와 정상 PC 각 한 대씩 같은 명령을 돌려 나란히 비교. 전부 정상인데 느리면 로그온 중 뜨는 다른 프로세스(NAC·백신·시작 프로그램) 쪽이지 AD가 아니다

### 1. 도메인 이름 확인

LiveCmd는 SYSTEM 권한으로 돌아 `%USERDNSDOMAIN%`이 비어 있을 수 있다. 첫 명령은 아래 중 하나를 쓴다.

| 명령 | 나오는 것 |
|---|---|
| `wmic computersystem get domain,partofdomain` | 가입 도메인 + 가입 여부. FALSE면 워크그룹이라 AD 조사 대상 아님 |
| `nltest /dsgetdc:<도메인>` | 가입 도메인의 DC·사이트를 한 번에 |
| `systeminfo \| findstr /B /C:"도메인" /C:"Domain"` | 가입 도메인 |
| `echo %USERDNSDOMAIN%` / `echo %USERDOMAIN%` | 사용자 세션에서만. 로컬 계정이면 PC 이름이 나옴 |

이후 `<도메인>`에는 DNS 이름(`xxx.co.kr` 꼴)을 넣는다. `nslookup -type=SRV`는 DNS 이름이어야 동작한다.

### 2. TCP 증상에서 볼 것

증상 화면에서 상대 IP가 DC인 TCP/IP 행(SLOW_CONNECT·연결 실패·방화벽 차단)과 DNS 시간 초과를 포트별로 모으고, 발생 시각을 로그온 시각과 맞춘다. 만든 프로세스가 `lsass.exe`(Kerberos/NTLM), `svchost.exe`(netlogon), `svchost.exe`(gpsvc)면 AD 경로다.

| 포트 | 막혔을 때 |
|---|---|
| 53 | DC 찾기 실패 |
| 88 | 로그온 지연·티켓 실패 |
| 445 | GPO 파일·로그온 스크립트 |
| 135/동적 포트 | 암호 변경·보안 채널 |
| 389/636 | GPO 목록·사이트 조회 |

NAC·VPN 에이전트가 먼저 연결을 잡고 있는지도 같은 화면에서 본다. 123(UDP) 시간 동기화는 TCP 증상에 안 보이므로 LiveCmd로 확인한다.

### 3. LiveCmd 명령 순서

| 단계 | 명령 | 보는 것 |
|---|---|---|
| ① DC 찾기 | `nltest /dsgetdc:<도메인>` | 어느 DC·어느 사이트. 실패면 DNS 문제 |
| | `nslookup -type=SRV _ldap._tcp.dc._msdcs.<도메인>` | SRV 레코드 유무 |
| | `ipconfig /all` | DNS 서버가 AD DNS인가, 접미사 |
| ② 연결 | `powershell -c "Test-NetConnection <DC> -Port 88"`(389, 445, 135도) | 포트별 열림·응답 시간 |
| | `netstat -ano \| findstr ":88 :389 :445"` | 지금 DC와 붙은 프로세스 |
| ③ 시간 | `w32tm /query /status`, `w32tm /stripchart /computer:<DC> /samples:3` | DC와 시간 차 |
| ④ 보안 채널 | `nltest /sc_query:<도메인>`, `nltest /sc_verify:<도메인>` | 머신 계정 암호 틀어짐 |
| ⑤ 티켓 | `klist`, `klist tgt` | TGT 유무, 발급 DC, 만료 |
| | `echo %LOGONSERVER%`, `whoami /all` | 인증한 DC, 그룹 수 |
| ⑥ 그룹 정책 | `gpresult /r /scope computer`(`/scope user`도) | 적용·필터된 GPO, 마지막 적용 시각 |
| | `wevtutil qe Microsoft-Windows-GroupPolicy/Operational /c:30 /rd:true /f:text` | 8001 처리 시간, 7016/7017 실패, 1058/1030 SYSVOL |
| ⑦ 이벤트 | `wevtutil qe System /q:"*[System[Provider[@Name='NETLOGON']]]" /c:30 /rd:true /f:text` | 5719 DC 없음, 5722/5723 보안 채널 |
| | `wevtutil qe System /q:"*[System[Provider[@Name='Microsoft-Windows-Security-Kerberos']]]" /c:30 /rd:true /f:text` | 4 KRB_AP_ERR_MODIFIED, 시간 오류 |
| | `wevtutil qe Security /q:"*[System[(EventID=4625)]]" /c:20 /rd:true /f:text` | 로그온 실패 상태 코드(0xC000006D 암호, 0xC0000234 잠김, 0xC000005E 로그온 서버 없음) |
| | `wevtutil qe System /q:"*[System[Provider[@Name='Microsoft-Windows-Time-Service']]]" /c:20 /rd:true /f:text` | 129·47 시간 동기화 실패 |
| ⑧ 캐시 로그온 | `reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v CachedLogonsCount` | DC 없이 로그온됐는지 |
| ⑨ 하이브리드 | `dsregcmd /status` | Entra 조인·PRT(Microsoft 365 쓰면) |
| ⑩ 로그 | `%windir%\debug\netlogon.log` 끝부분 | DC 찾기 실패 기록 |

## 판정

| PC에서 보이는 것 | 먼저 의심 |
|---|---|
| 로그온 몇 분, 끝나면 정상 | DNS 시간 초과 뒤 캐시 로그온 / GPO 8001 처리 시간 / 로그온 스크립트·네트워크 드라이브 대기 |
| 「로그온 서버를 사용할 수 없습니다」 | DNS 설정, 5719, 53·88 TCP 증상 |
| 「트러스트 관계 실패」 | `sc_verify`, 머신 암호 불일치(복제 지연·이미지 복원) |
| 암호 변경 뒤 계정 잠김 | 옛 암호를 쥔 프로세스(Outlook·매핑 드라이브·서비스) — 4625로 프로세스 확인 |
| Kerberos 이벤트 4 | 시간 차 5분 초과 또는 SPN 중복 |
| GPO 미적용 | 445, 1058/1030, SYSVOL 복제 |
| 특정 PC만 느림 | 그 PC의 DNS·사이트 매핑 — `dsgetdc` 결과 비교 |
| 모든 PC가 한꺼번에 느림 | DC 쪽. PC 조사 범위 밖, DC 이름·시각만 모아 넘김 |

## COM 증상으로 더 볼 것

로컬 COM 호출이 서버 종료로 끊긴 것(COM_LINK_FAIL)만 증상으로 내고, Microsoft·Google 같은 대형 벤더 서명 호출자는 버리는 구성에서는 AD 로그온 경로(gpsvc·lsass·winlogon·인증서 자동 등록)의 COM 실패가 증상에 안 잡힌다. 그래서 세 묶음으로 나눠 본다.

1. **COM_LINK_FAIL 증상에서 볼 것**: 서버(끊긴 COM 호스트)가 로그온 경로 서비스인 행만 고른다. `WmiPrvSE.exe`·`svchost(winmgmt)`(NAC 자세 점검·GPO WMI 필터·인벤토리), `svchost(netprofm·nlasvc)`(네트워크 위치 판정), `svchost(schedule)`(로그온 예약 작업), `dllhost.exe`(서로게이트). 발생 시각을 로그온 시각·GPO 8001과 맞춘다. `WmiPrvSE`가 로그온 직후 되풀이해 죽으면 GPO WMI 필터·NAC 점검이 늦어지는 원인이 된다.
2. **plugin.log에서 볼 것**: `findstr /C:"[COM-HANG]" /C:"[SRV-CRASH]" /C:"[SRV-EXIT]" /C:"[COM-LINK-FAIL]" <드라이브>:\ProgramData\Orange\Log\plugin.log`. COM-HANG은 30초 넘게 응답 없는 호출인데, 로그온 시각 ±5분에 서버가 `winmgmt`·`WmiPrvSE`·`netprofm`이면 GPO WMI 필터·NLA 지연으로 본다. 증상에서 버려진 Microsoft 호출자(`gpsvc`·`explorer`·`taskhostw`·`wscript`)도 plugin.log에는 남는다.
3. **증상이 못 보는 것**: 원격 DCOM(AD CS 인증서 자동 등록)은 Application 로그의 `CertificateServicesClient-AutoEnrollment` 6·13·64로, DCOM 자체 오류는 System 로그 `DistributedCOM` 10000·10005(서버 시작 실패)·10010·10016·10028로, WMI 내부 오류는 `Microsoft-Windows-WMI-Activity/Operational` 5858로 보완한다.

---

*Orange Platform의 Active Directory 장애 진단 절차 정리입니다.*
