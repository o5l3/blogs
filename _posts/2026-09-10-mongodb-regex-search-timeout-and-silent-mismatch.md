---
title: "MongoDB 정규식 검색이 워커를 28초 묶고 결과까지 빠뜨린 이유"
excerpt: "감사 로그 검색어를 이스케이프하지 않고 MongoDB $regex에 넣어, 파국적 역추적이 워커를 최대 28초 점유하고 일부 문서는 조용히 불일치로 처리됐다. 기본 검색을 부분 일치로 바꾸고 정규식은 선택 기능과 5초 상한으로 분리한 과정을 정리한다."
category: tech
date: 2026-09-10
author: smahn9123
tags: [MongoDB, PCRE2, 정규식, ReDoS, 감사로그, 검색, 백엔드, Orange Platform]
---

## 개요

감사 로그의 `keyword_value`와 명령 템플릿의 `title`이 이스케이프 없이 `$regex`로 들어갔다. 검색어 하나가 워커를 15~28초 점유했고, 더 심한 경우 검색이 결과를 조용히 빠뜨렸다.

기본 검색은 부분 일치로 바꿨다. 정규식은 화면에서 켜는 선택 기능으로 남기되 실행 시간에 상한을 걸었다. 검색 대상 표에서 빠져 있던 baseline 카테고리도 추가했다.

## 현상 1. 검색어 하나로 워커를 묶는다

기존 질의는 사용자가 입력한 값을 그대로 정규식으로 사용했다.

```python
query[keyword] = {"$regex": keyword_value, "$options": "i"}
```

MongoDB 8.0과 실제 감사 로그 형태의 문서 14,210건으로 측정했다. `detail`은 "매니저 로그인", "가상 그룹 생성: 개발팀 (VG_DEV_001)", "baseline 라벨 추가 [cpu_high] verdict=routine" 등 코드가 실제로 쓰는 7~63자 한글 문장이다. 시험용 문자열을 따로 심지 않았다.

| 검색 값 | 수정 전 | 수정 후 |
|---|---:|---:|
| `매니저 로그인` | 9.8ms / 965건 | 10.1ms / 965건 |
| `(.+)+(?!)` | 17,848ms | 8.6ms(정규식 끔) / 5초 상한(켬) |
| `((.+)+)+(?!)` | 28,081ms | 동일 |
| `(.+)+[^\s\S]` | 20,025ms | 동일 |
| `(.*)*(?!)` | 22,389ms | 동일 |
| `[` | 500 오류 | 8.6ms / 1,820건 |

### 어떤 패턴은 느리고 어떤 패턴은 빠른가

정규식 성능 문제의 예로 자주 쓰이는 `(a+)+$`는 이 자료에서 9ms 만에 끝났다. `detail`에 `a`가 길게 이어지는 값이 없어 첫 글자에서 바로 실패하기 때문이다. 이 패턴만 시험하면 문제가 없는 것처럼 보인다.

PCRE2는 패턴이 반드시 요구하는 리터럴 문자가 문서에 없으면 역추적 없이 즉시 실패시킨다. `(.+)+Z`가 12ms로 끝난 이유다.

느린 패턴은 이 두 조건을 모두 피한다. `.`은 아무 글자나 받으므로 자료 내용을 가리지 않는다. `(?!)`, `[^\s\S]`, `\b\B`는 리터럴 문자를 요구하지 않으면서 반드시 실패한다. 비용은 문서마다 발생하므로 조회 기간이 길수록 증가한다.

## 현상 2. 결과가 조용히 틀린다

`(a*)*$`는 문자열 끝의 빈 문자열과 일치하므로 모든 문서를 찾아야 한다. 실제로는 14,210건 중 0건을 돌려줬다. 역추적이 PCRE2 한계에 걸리면 해당 문서가 조용히 불일치로 처리되기 때문이다. 짧은 문자열 2건에 같은 패턴을 적용하면 정상적으로 2건이 나온다. 자료가 많을 때만 결과가 틀렸다.

감사 로그는 조회 결과가 조용히 비어서는 안 되는 자료다. 실행 시간 상한만으로는 이 문제를 막지 못한다. 정규식 모드를 기본값으로 두지 않은 이유다.

## 현상 3. 특수문자가 서버 오류가 된다

`[`, `*`, `(`처럼 정규식 문법으로 완성되지 않은 값은 `OperationFailure`를 내고 API 응답은 500이 됐다. baseline 감사 기록은 `detail`에 `[cpu_high]` 같은 값을 쓰므로 대괄호 검색은 정상적인 사용이다. 수정 후에는 이 검색으로 1,820건을 찾았다.

## 기본은 부분 일치, 정규식은 선택 기능

`regex=true`를 함께 보낼 때만 검색어를 정규식으로 해석한다. 기본값은 부분 일치다.

- 실행 시간 상한을 걸어도 조용한 결과 누락은 남는다. 이 성질을 아는 사용자가 정규식 모드를 직접 켜도록 했다.
- 문서에는 정규식 검색이라고 적혀 있었지만 manager-web에는 정규식을 만드는 코드가 없었다. 기본값을 바꿔도 기존 화면 기능은 사라지지 않는다.
- 일반 사용자가 기대하는 동작도 부분 일치다. 기존에는 `get.WMI`의 점이 임의 문자로 작동해 `getXWMI`까지 찾았다.
- 명령 템플릿 API 설명은 이미 "템플릿 이름 부분 일치 필터"였다. 이 API는 정규식 모드를 열지 않고 검색어만 이스케이프했다.

## 정규식 실행 시간은 5초로 제한

`SEARCH_TIMEOUT_MS`를 5,000ms로 정했다. `maxTimeMS`가 파국적 역추적을 실제로 중단하고, 제한 시간에서 ±10ms 안에 명시적 예외를 내는 것을 확인했다. 정상 검색은 7~10ms였다.

| 상황 | 응답 |
|---|---|
| 실행 시간 초과 | `KeywordSearchTimeoutError(422)` / `KEYWORD_SEARCH_TIMEOUT` |
| 정규식 문법 오류 | `InvalidKeywordPatternError(422)` / `INVALID_KEYWORD_PATTERN` |
| 허용되지 않은 필드 | `InvalidKeywordFieldError(422)` |

목록 조회는 `find` 커서를 쓰므로 인자 이름이 `max_time_ms`다. 건수 조회는 `aggregate`로 실행되는 `count()`를 쓰므로 `maxTimeMS`다. 서로 바꿔 쓰면 각각 `TypeError`와 `OperationFailure(unknown field)`가 발생한다.

정규식을 파이썬 `re`로 미리 검사하지 않았다. `(?<name>x)`, `\K`, `a{1,`처럼 PCRE2는 받지만 파이썬이 거절하는 표현이 있어 정상 패턴을 막을 수 있기 때문이다. MongoDB가 반환한 오류 코드로 문법 오류를 판정했다.

## 함께 수정한 항목

### baseline 카테고리 누락

`KEYWORD_FIELDS`에 baseline이 없어 검색이 기본 필드로 처리됐다. baseline 감사 기록은 `data.key_id`와 `data.label`에 값을 쓰는데, 이 필드로 검색하면 422가 반환됐다. 적재 경로는 7곳이었다. 라우터의 Swagger 카테고리 목록도 같은 표로 만들기 때문에 문서에서도 baseline이 빠져 있었다.

`AuditCategory`의 `policy`와 `report`는 코드 어디에서도 기록하지 않는 값이라 검색 표에 넣지 않았다.

### 명령 템플릿 제목 필터

명령 템플릿 제목 검색에도 같은 결함이 있었다. 제목 길이는 100자로 제한돼 피해 규모는 작지만, 100자 제목 200건에서 360ms가 걸렸고 `[`는 500 오류를 냈다. 이 경로에는 `re.escape`만 적용했다.

## `$regex` 사용처 전수 점검

`app/`의 `$regex` 사용처를 모두 확인했다.

| 위치 | 상태 |
|---|---|
| `usecases/audit_log/_query.py` | 수정 |
| `usecases/command_template/command_template_list_case.py` | 수정 |
| `models/mongo/detect_node.py`, `usecases/network_zone/*`, `usecases/sprocess/*`, `api/v3/schemas/sprocess.py`, `api/v2/v2_router.py`, `infra/db/base_document.py`, `usecases/baseline/*` | 기존부터 `re.escape` 적용 |

## 변경 범위

| 파일 | 변경 |
|---|---|
| `app/usecases/audit_log/_query.py` | 기본 `re.escape`, 정규식 모드, 실행 시간 상한, 오류 변환, baseline 항목 |
| `app/usecases/audit_log/get_audit_log_{list,count}_case.py` | 실행 시간 상한과 오류 변환 연결 |
| `app/models/mongo/audit_log/audit_base.py` | `paginate_all`에 `max_time_ms` 추가 |
| `app/exceptions/audit_log_exceptions.py` | 예외 2종 추가 |
| `app/api/v3/audit_log.py` | `regex` 파라미터 추가 |
| `app/usecases/command_template/command_template_list_case.py` | `re.escape` 적용 |
| `docs/audit_log.md` | 정규식과 실행 시간 제한 설명 추가 |
| 테스트 | 48건 추가 |

## 검증

- 전체 테스트 2,446건 통과
- 실 MongoDB 8.0에서 수정 전후 `build_query`를 실제로 호출해 정상 검색어의 결과 수가 같은지 확인
- UseCase 전체 경로에서 정규식 모드의 `^매니저` 4,057건, `baseline|Summary` 4,026건 확인
- 파국적 패턴이 5.005초에 422를 반환하고 목록과 건수가 모든 경우에 같은 수를 반환하는지 확인
- `re.escape` 결과를 PCRE2가 리터럴로 해석하는지 인쇄 가능한 ASCII 전 문자와 실제 검색어 109건으로 확인
- `AuditDocument` 하위 클래스를 열거해 기록되는 카테고리가 검색 표에서 빠지지 않는지 검사하는 회귀 테스트 추가

배포 순서는 백엔드를 manager-web보다 먼저 잡았다. 기존 manager-web은 파라미터를 인코딩하지 않아 `+`가 공백으로 바뀌었기 때문에 위험한 정규식이 서버에 도달하지 않았다. 인코딩을 먼저 고치면 그때부터 문제가 드러난다.

기본 모드에서는 `.`이 와일드카드로 동작해 더 많이 잡히던 검색 결과가 줄어든다. 이제는 실제 점 문자만 찾는다. 앵커 없는 대소문자 무시 검색이라 `COLLSCAN`이지만, 14,210건에서 10ms였으므로 별도 인덱스는 두지 않았다.

*Orange Platform 감사 로그 검색의 정규식 성능과 결과 정확성 분석 리포트입니다.*
