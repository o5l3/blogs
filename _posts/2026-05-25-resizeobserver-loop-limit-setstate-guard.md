---
title: "ResizeObserver loop limit exceeded — 다중 위젯 대시보드에서 setState 가드로 끊는 법"
excerpt: "10개 이상의 위젯이 각자 ResizeObserver를 가진 대시보드에서 'ResizeObserver loop limit exceeded' 스크립트 오류가 떨어집니다. 원인은 크기가 변하지 않았는데도 매번 setState를 호출하는 네 개 위젯이 한 프레임 안에 다른 위젯의 ResizeObserver를 연쇄로 발동시키는 것. 동일 값 가드와 객체 참조 비교 가드 패턴을 정리합니다."
category: tech
date: 2026-05-25
author: kim-tigerj
tags: [React, ResizeObserver, setState, 성능, 트러블슈팅, Orange Platform]
---

## 배경

매니저 상태 모니터링 위젯에서 다음 스크립트 오류가 잡혔습니다.

```
ResizeObserver loop limit exceeded
/manager/dashboard?s=<session-id>
```

대시보드에는 10개 이상의 위젯이 각각 `ResizeObserver`를 사용하고 있고, 그 중 **4개 위젯이 크기가 변하지 않았는데도 매번 `setState`를 호출**해 불필요한 리렌더를 유발하고 있었습니다. 이 리렌더가 다른 위젯의 `ResizeObserver`를 연쇄 발동시켜, 한 프레임 안의 처리 한도를 넘으면 브라우저가 위 에러를 던집니다.

## 원인 분석 — 네 개의 가드 누락

`ResizeObserver` 콜백에서 **크기 변경 가드 없이** `setState`를 호출하는 위젯 4개:

| 위젯 | 파일:라인 | 문제 코드 | 문제점 |
|---|---|---|---|
| `nodesSummary` | `index.tsx:433` | `setContainerWidth(w)` | 같은 값이어도 매번 호출 |
| `ruleManagement` | `index.tsx:93` | `setViewportH(h)` | 같은 값이어도 매번 호출 |
| `detectsByDay2Summary` | `index.tsx:65` | `setCSize({ w, h })` | 매번 새 객체 생성 (참조 비교 실패) |
| `detectsByPeriodSummary` | `index.tsx:477` | `setTmSize({ w, h })` | 매번 새 객체 생성 (참조 비교 실패) |

객체 형태의 state를 새로 만들어 `setState`로 넘기면 React는 참조 비교에서 항상 "다름"으로 판단해 리렌더합니다. ResizeObserver처럼 **고빈도로 호출되는 콜백에서는 1px 이내의 미세 변동도 매번 리렌더로 이어집니다**.

### 올바른 패턴 (다른 차트에서 이미 적용 중)

```ts
setChartSize((p) => {
  if (Math.abs(p.w - width) < 1 && Math.abs(p.h - height) < 1) return p;
  return { w: width, h: height };
});
```

함수형 setState로 이전 값과 1px 미만 차이면 **기존 상태를 그대로 반환**해, React가 변경 없음으로 판정하고 리렌더를 건너뛰게 만듭니다.

## 수정 내용

4개 위젯에 동일한 패턴의 크기 변경 가드를 추가했습니다.

### `nodesSummary/index.tsx`

```ts
// Before
setContainerWidth(w);
// After
setContainerWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
```

### `ruleManagement/index.tsx`

```ts
// Before
setViewportH(entries[0]?.contentRect.height ?? 500);
// After
const h = entries[0]?.contentRect.height ?? 500;
setViewportH((prev) => (Math.abs(prev - h) < 1 ? prev : h));
```

### `detectsByDay2Summary/index.tsx`

```ts
// Before
if (r) setCSize({ w: r.width, h: r.height });
// After
if (r) setCSize((p) => {
  if (Math.abs(p.w - r.width) < 1 && Math.abs(p.h - r.height) < 1) return p;
  return { w: r.width, h: r.height };
});
```

### `detectsByPeriodSummary/index.tsx`

```ts
// Before
setTmSize({ w: entry.contentRect.width, h: entry.contentRect.height });
// After
setTmSize((p) => {
  const { width, height } = entry.contentRect;
  if (Math.abs(p.w - width) < 1 && Math.abs(p.h - height) < 1) return p;
  return { w: width, h: height };
});
```

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/components/widgets/nodesSummary/index.tsx` | ResizeObserver 크기 변경 가드 추가 |
| `src/components/widgets/ruleManagement/index.tsx` | ResizeObserver 크기 변경 가드 추가 |
| `src/components/widgets/detectsByDay2Summary/index.tsx` | ResizeObserver 크기 변경 가드 추가 |
| `src/components/widgets/detectsByPeriodSummary/index.tsx` | ResizeObserver 크기 변경 가드 추가 |

## 검증

배포 후 대시보드를 24시간 이상 운영하여 상태 패널의 스크립트 오류에 `ResizeObserver loop` 에러가 재발하지 않는지 확인합니다.

## 핵심 정리

- `ResizeObserver loop limit exceeded`는 대부분 **여러 위젯의 ResizeObserver가 한 프레임 안에 서로를 연쇄 발동**시키는 패턴에서 발생합니다.
- 원인 위젯은 보통 콜백에서 가드 없이 `setState`를 호출하는 곳입니다. 1px 미만의 미세한 차이도 매번 리렌더로 이어집니다.
- 객체 형태의 state는 참조가 매번 달라져 단순 `===` 비교가 실패합니다. 함수형 `setState`로 **이전 값과 비교 후 변화 없으면 기존 상태를 그대로 반환**하는 패턴이 가장 단순한 해법입니다.

*Orange Platform 매니저 대시보드의 ResizeObserver 연쇄 리렌더를 잡은 분석·수정 리포트입니다.*
