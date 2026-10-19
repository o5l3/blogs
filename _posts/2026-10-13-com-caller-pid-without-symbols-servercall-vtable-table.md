---
title: "심볼 없이 COM 호출자 PID를 알아내다 — combase 버전별 ServerCall vtable 표"
excerpt: "WmiPrvSE·dllhost 같은 공용 COM/RPC 호스트가 남의 호출을 처리하다 크래시했을 때, 그 호출자 프로세스의 PID는 PDB 심볼에만 있는 ServerCall vtable 오프셋으로 찾아야 한다. 심볼 다운로드가 금지된 폐쇄망 엔드포인트에서, combase 버전별로 미리 뽑은 vtable·오프셋 표로 심볼 없이 같은 값을 얻어내는 방법을 정리한다."
category: tech
date: 2026-10-13
author: kim-tigerj
tags: [Windows, COM, RPC, combase, 덤프분석기, 심볼, Orange Platform]
---

## 배경

공용 COM/RPC 호스트(WmiPrvSE·dllhost 등)가 남의 호출을 처리하다 크래시하면, 그 호출을 건 프로세스(유발자)의 PID를 알아야 원인을 좁힐 수 있다. 유발자 PID는 크래시 스레드 스택에 있는 `combase!ServerCall` 객체의 `+0x94`(`_dwClientPid`)에 있다.

문제는 이 값을 읽으려면 두 가지를 알아야 하는데, 둘 다 PDB(심볼)에만 있다는 점이다.

- 스택의 어떤 .rdata 주소가 ServerCall vtable인지
- `_dwClientPid`가 그 객체에서 정확히 몇 바이트 위치에 있는지(오프셋)

제품은 엔드포인트에서 심볼 다운로드를 금지한다. combase.dll 자체는 엔드포인트에 있지만 레이아웃 정보가 없고, RTTI도 쓰지 않아(ObjectLibrary 자체 타입식별 방식) 바이너리만 봐서는 구조를 알 수 없다. 그래서 미리 뽑아 둔 표가 필요했다.

## 방식

combase 바이너리를 `TimeDateStamp:SizeOfImage`로 식별해, 그 버전의 `{ServerCall 계열 vtable RVA 집합, _dwClientPid·_uCallTraceId·_moid 오프셋}`을 json 표로 만들어 분석기에 동봉한다.

런타임에는 심볼 없이 다음 순서로 유발자 PID를 얻는다.

1. 덤프의 모듈 목록에서 combase 베이스 주소를 얻는다.
2. 스택에 있는 객체의 vtable 포인터를 `베이스 + RVA`와 정확히 대조한다.
3. 클러스터 검증을 한다 — `_moid`가 GUID 형태인지, `_uCallTraceId`가 0이 아닌지, PID가 4의 배수이면서 자기 자신의 PID와 다른지.
4. 검증을 통과하면 그 오프셋 위치의 값을 유발자 PID로 `Report["TriggerProcessId"]`에 기록한다.

PID를 프로세스 이름으로 바꾸는 작업은 에이전트가 수집해 둔 이력에서 한다.

표는 개발 PC에서 만든다. WinBindex로 combase의 전 버전 목록을 받고, MS 심볼 서버로 각 버전의 PDB를 내려받은 뒤, 추출기가 RVA와 오프셋을 뽑아 json에 이어 붙인다(자동화).

## 실측 근거

Windows 11(빌드 26200)에서 받은 WmiPrvSE 덤프로 검증했다. 심볼을 쓴 방식(정답)은 호출자 PID 4944(winmgmt 브로커)를 냈고, `_dwClientPid` 오프셋 0x94를 이 값으로 확인했다.

처음에는 모양만 보는 휴리스틱(vtable 대조 없이 패턴만 맞으면 통과)으로 시도했는데, 옆에 있는 다른 combase 객체의 포인터 반쪽을 `(traceId, pid)`로 잘못 읽어 452라는 오탐 PID를 냈다. 이 시행착오로 정확한 vtable 대조가 필수라는 것을 확인했다.

## 운용

릴리즈마다 그 시점까지 나온 Windows 10 이상 combase 버전을 표에 추가한다. 고객사가 최신 Windows를 바로 쓰지 않고 에이전트는 자주 갱신되므로, 표에 없는 버전이 실제로 걸릴 공백은 사실상 없다. 표를 갱신할 때는 재배포 없이 json 파일만 바꾸면 된다.

## 한계

표에 없는(아직 못 뽑은) combase 빌드를 만나면 「유발자 미상(버전 미등록)」으로 표시하고, 그 덤프가 들어오면 해당 버전을 표에 추가한다. 아주 오래된 구버전은 ServerCall의 타입과 레이아웃 자체가 달라 추출기가 PDB별로 따로 처리해야 하고, 매핑이 안 되는 희귀 빌드는 미상으로 둔다.

## 관계

같은 기능을 다루는 OR-2246은 개발 PC에서 심볼을 쓰는 검출과 「관련 정보」 탭을 만들었다. 이번 작업은 그 검출을 심볼 없이 폐쇄망 엔드포인트에서 동작시키는 표·추출기·분석기 쪽이다.

---

*Orange Platform 덤프 분석기의 COM 크래시 원인 식별 기능 구현기입니다.*
