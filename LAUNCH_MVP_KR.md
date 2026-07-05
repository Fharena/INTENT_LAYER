# INTENT_LAYER 출시형 MVP 계획

## 0. 방향 전환

초기 MVP를 작게 잡는 대신, Codex/AI 에이전트를 적극 활용해 빠르게 출시 가능한 수준까지 끌어올린다.

기존 최소 MVP:

```text
React/Vite/Tailwind 요소 클릭
→ Tailwind token 편집
→ 코드 patch
→ intent diff
```

확장된 출시형 MVP:

```text
React/Vite/Tailwind 프로젝트에 붙는 AI-friendly intent layer
→ 화면 선택/편집
→ intent 문서 생성
→ intent diff
→ AI 에이전트용 context 생성
→ Codex/Claude 실행 계획 생성
→ 구현되지 않은 작업은 agent pipeline으로 위임
→ 사용자 승인 후 patch 적용
```

핵심 제품 철학:

> deterministic engine이 가능한 것은 즉시 처리하고, 아직 엔진이 처리하지 못하는 것은 현재 사용 중인 AI agent에게 구조화된 작업으로 넘긴다.

## 1. 출시형 MVP 한 줄

> AI가 만든 React/Tailwind UI를 화면에서 직접 수정하고, 직접 처리하기 어려운 변경은 Codex/AI agent에게 intent-aware task로 넘겨주는 AI-native frontend editing layer.

## 2. 왜 크게 잡아도 되는가

이 제품의 사용자 자체가 AI-assisted 개발자다. 따라서 제품은 처음부터 다음을 전제해도 된다.

- 사용자는 Codex/Cursor/Claude 같은 AI coding agent를 쓴다.
- 사용자는 raw code보다 intent/summary/diff를 먼저 보고 싶어 한다.
- deterministic patch가 가능한 범위는 빠르게 처리해야 한다.
- deterministic patch가 어려운 범위는 AI에게 넘겨도 된다.
- 단, AI에게 넘길 때도 자연어 한 덩어리가 아니라 구조화된 intent task여야 한다.
- 외부 agent 실행은 기본적으로 command plan이며, 직접 실행은 명시적 opt-in이어야 한다.

즉 제품은 둘 중 하나가 아니다.

```text
visual editor only  X
AI agent only       X
```

정답은:

```text
deterministic intent core
+ AI agent handoff pipeline
```

## 3. v1.0 출시 범위

### 3.1 지원 스택

정식 지원:

```text
React
Vite
TypeScript / TSX
Tailwind CSS
literal className
simple cn()/clsx()
shadcn/ui common patterns
```

베타 지원:

```text
Next.js App Router
CSS variables
simple CSS modules
component props mapped to style
```

미지원:

```text
styled-components
Emotion
complex CSS cascade editing
full design system inference
Figma import
arbitrary framework support
```

### 3.2 deterministic direct edit

AI 호출 없이 즉시 처리해야 하는 것:

```text
padding
margin
gap
border radius
border width
background/text/border color
font size
font weight
line height
grid columns
flex direction
alignment
simple responsive variants
```

### 3.3 AI handoff edit

AI에게 구조화된 작업으로 넘기는 것:

```text
레이아웃 구조 변경
컴포넌트 분리
반복 구조 정리
조건부 렌더링 추가
empty/loading/error state 추가
모바일 전용 구조 변경
복잡한 cn()/clsx() 정리
Tailwind class가 너무 복잡한 경우
디자인 intent 이름 붙이기
컴포넌트 목적 설명 생성
```

### 3.4 사용자 승인 모델

AI handoff는 자동 적용하지 않는다.

```text
1. 사용자가 화면에서 의도를 선택/입력
2. Intent Layer가 structured agent task 생성
3. Codex/AI가 patch 제안
4. Intent Layer가 patch를 분석
5. intent diff로 요약
6. 사용자가 승인
7. 적용
```

## 4. 제품 모드

### 4.1 Inspect Mode

화면 요소를 클릭해 의미와 source binding을 본다.

표시:

```text
component
source file
DOM path
JSX range
role
purpose
editable properties
confidence
stale/drift state
```

### 4.2 Direct Edit Mode

확실히 추적 가능한 속성을 즉시 수정한다.

예:

```text
gap-4 -> gap-6
grid-cols-3 -> grid-cols-2
rounded-lg -> rounded-xl
text-sm -> text-base
```

### 4.3 Intent Diff Mode

변경 전후를 line diff가 아닌 의미 diff로 본다.

예:

```yaml
changes:
  - target: ProductGrid.layout.columns
    from: 3
    to: 2
  - target: ProductCard.style.radius
    from: 8px
    to: 12px
```

### 4.4 Agent Handoff Mode

직접 편집이 어려운 변경을 AI agent에게 넘긴다.

예:

```text
사용자: 이 상품 카드 목록에 empty state를 추가하고 싶음.
Intent Layer:
  - 현재 component intent 추출
  - source binding 포함
  - desired change를 operation으로 표현
  - agent task markdown 생성
Codex:
  - 코드 수정
Intent Layer:
  - diff 분석
  - intent diff 생성
  - 승인 요청
```

### 4.5 Agent Context Mode

현재 선택된 요소/컴포넌트의 AI용 context를 생성한다.

명령:

```bash
intent-layer agent-context ProductGrid
intent-layer agent-task --from-selection
```

출력:

```text
.intent/agent/ProductGrid.context.md
.intent/agent/task_2026-06-29_001.md
```

## 5. AI Agent용 Markdown 설명서

제품은 처음부터 AI가 읽을 수 있는 문서를 생성해야 한다.

### 5.1 프로젝트 루트 문서

```text
INTENT_LAYER.md
```

역할:

- 제품이 사용하는 intent 규격 설명
- agent가 수정 가능한 파일/수정하면 안 되는 파일 명시
- deterministic patch 우선 원칙 설명
- intent 문서 갱신 규칙 설명
- 작업 후 실행할 검증 명령 설명

### 5.2 작업 단위 문서

```text
.intent/agent/task_*.md
```

예:

```md
# Intent Agent Task

## Goal

Add an empty state to `ProductGrid` while preserving the current grid layout intent.

## Selected Component

- Component: `ProductGrid`
- Source: `src/components/ProductGrid.tsx`
- Intent doc: `.intent/components/ProductGrid.intent.yml`

## Constraints

- Do not rewrite the whole component.
- Preserve existing Tailwind spacing tokens unless needed.
- Add an empty state when `products.length === 0`.
- Update the intent document if behavior changes.

## Required Checks

```bash
npm run typecheck
npm run lint
npx intent-layer check ProductGrid
```
```

### 5.3 Agent Result 문서

```text
.intent/agent/result_*.md
```

내용:

```text
files changed
intent properties changed
confidence changes
checks run
known risks
```

## 6. 문서 규격

### 6.1 파일 구조

```text
.intent/
  graph.intent.json
  components/
    ProductGrid.intent.yml
  operations/
    2026-06-29_001.intent-op.json
  diffs/
    2026-06-29_001.intent-diff.yml
  agent/
    ProductGrid.context.md
    task_2026-06-29_001.md
    result_2026-06-29_001.md
  schema/
    intent.schema.json
    intent-op.schema.json
    intent-diff.schema.json
```

### 6.2 Intent Document

역할:

```text
현재 코드가 어떤 UI 의도를 구현하는지 기록.
코드와 source binding을 유지.
```

### 6.3 Intent Operation

역할:

```text
사용자 또는 AI가 의도 단위로 수행한 변경 기록.
undo/replay/audit 가능.
```

### 6.4 Intent Diff

역할:

```text
변경 전후를 사람이 이해 가능한 의미 단위로 표시.
AI 변경 검수에 사용.
```

### 6.5 Agent Task

역할:

```text
deterministic engine이 직접 처리하지 못한 작업을 AI agent에게 넘기는 구조화된 작업 문서.
```

## 7. 출시형 MVP 기능 목록

### 7.1 Core

- source id instrumentation
- source sidecar map
- intent graph
- source binding
- confidence model
- drift detection
- operation log
- intent diff

### 7.2 Tailwind Direct Edit

- spacing parser
- color parser
- layout parser
- typography parser
- responsive variant parser
- token replacement
- className order 보존
- patch preview
- undo/revert

### 7.3 Browser Overlay

- element picker
- selection outline
- component/source panel
- intent inspector
- direct edit controls
- pending undo history와 branch undo controls
- confidence badge
- stale badge
- agent handoff button
- intent diff viewer

### 7.4 CLI

```bash
intent-layer init
intent-layer doctor
intent-layer dev
intent-layer scan
intent-layer check
intent-layer diff
intent-layer agent-context
intent-layer agent-task
intent-layer agent-result
intent-layer apply
```

현재 구현된 MVP CLI smoke 범위:

```bash
intent-layer init
intent-layer doctor
intent-layer dev
intent-layer scan
intent-layer check
intent-layer apply
intent-layer diff
intent-layer agent-context
intent-layer agent-task
intent-layer agent-result
```

`init`은 `.intent` 기본 폴더와 lightweight schema 파일을 만든다.
`doctor`는 package/Vite/React/Tailwind/source/plugin/intent graph 상태를 JSON으로 자가진단한다.
`dev`는 local Vite dev server를 `127.0.0.1:5173` 기준으로 실행하며, `--dry-run`으로 command plan을 검증할 수 있다.
`scan`은 repo의 JSX/TSX binding, read-only 원인, editable token coverage, transform time을 JSON으로 출력한다.
`check`는 같은 결과에 최소 gate를 적용하고 실패 시 non-zero exit code를 반환한다.
`apply`는 `.intent-op.json`의 단일 Tailwind token replace를 기존 safe patch 엔진으로 적용한다.
`diff`는 `.intent-diff.yml` 파일을 JSON으로 요약해 CLI/CI에서 확인 가능하게 한다.
`agent-context`는 `.intent/graph.intent.json`에서 repo/선택 binding/지원·미지원 표면을 AI용 markdown으로 요약한다.
`agent-task`는 `.intent/graph.intent.json`의 binding id와 desired change를 받아 `.intent/agent/task_*.md`를 생성한다.
`agent-result`는 task file, summary, changed files, checks를 받아 `.intent/agent/result_*.md`와 `.intent-diff.yml`을 생성한다.

MVP 검증용 script는 외부 React/Tailwind corpus를 `.intent/external-corpus/` 로컬 복사본으로 가져오고, manifest와 editable coverage gate를 `reports/performance/external-corpus-audit.json`에 기록할 수 있다.

### 7.5 Agent Integration

v1.0에서 완전 자동 agent 내장은 필수 아님. 대신 다음을 지원한다.

```text
AI용 md 생성
Codex/Cursor/Claude에 붙여넣기 쉬운 task 문서
agent 결과 diff 분석
intent check
intent doc update suggestion
```

## 8. 구현되지 않은 기능을 AI 파이프라인으로 처리하는 방식

제품은 미구현 기능을 숨기지 않는다.

예:

```text
This edit is not supported by Direct Edit yet.
Create an AI handoff task?

[Create Agent Task]
```

Agent Task에는 다음이 포함된다.

```text
selected element
source file/range
related source snapshot for variable/variant handoff
related dependency snapshots for one-hop same-file, imported-source, and related-declaration named-import variable handoff
external import reference for external package handoff
current intent
desired change
constraints
required checks
patch style
```

MVP의 related source snapshot은 같은 파일 변수 선언, object property className 선언, 같은 파일 및 imported source 내부 one-hop 변수 dependency snapshot, related 선언 내부 named import dependency snapshot, workspace package import 뒤의 변수 선언, tsconfig paths alias와 다단계 barrel re-export 뒤의 imported 변수 선언, one-hop relative named import, tsconfig paths alias와 one-hop/multi-hop named barrel re-export 뒤의 `variant/cva` 선언까지 지원한다.
external npm package import는 source snapshot 대신 `External Import Reference`로 package/import/usage/guidance를 기록하고, `node_modules` 직접 편집은 금지한다.
external npm package source 분석/직접 patch, variant 함수 의미 분석, 임의 깊이 cross-file/transitive variable data flow는 agent handoff 문서에 명시된 미지원 범위로 남긴다.

이렇게 하면 제품은 아직 직접 편집하지 못하는 기능도 workflow를 제공한다.

핵심:

```text
미구현 = 실패가 아니라 agent handoff로 graceful degradation
```

## 9. 성능/오버헤드 기준

크게 잡아도 성능 원칙은 유지한다.

```text
항상 하는 일:
  - 짧은 data-intent-id 삽입
  - sidecar map 유지

선택 시 하는 일:
  - 해당 file AST parse
  - 해당 node 주변 분석

요청 시 하는 일:
  - intent summary 생성
  - AI handoff task 생성
  - repo-wide scan
```

목표:

```text
element select -> panel: <100ms
direct patch apply: <50ms
intent diff small change: <1s
Vite transform overhead: <5ms/file target
sidecar graph write: semantic fingerprint 변경 시에만 발생
product-sized graph refresh: generated 24-file/624-binding fixture 통과, 실제 외부 프로젝트 HMR 재측정 필요
```

## 10. 출시형 MVP 개발 순서

### Phase 1: Core Loop

1. Vite plugin
2. `data-intent-id`
3. sidecar source map
4. browser overlay
5. click -> source lookup
6. Tailwind spacing patch

### Phase 2: Product Loop

1. direct edit panel
2. patch preview
3. undo/revert
4. `.intent` folder
5. intent op
6. intent diff

### Phase 3: AI-native Loop

1. `INTENT_LAYER.md`
2. agent context generation
3. agent task markdown generation
4. result diff analyzer
5. intent check command

### Phase 4: Launch Polish

1. demo project
2. docs
3. landing README
4. install guide: local tarball install, `intent-layer/vite` wrapper export smoke, 설치된 plugin transform/graph smoke, 실제 Vite dev server HTTP preview/apply, apply refresh, 3-file graph refresh smoke, 외부 사용자용 `INSTALL_KR/EN.md` 구현
5. failure mode guide: `FAILURE_MODES_KR/EN.md` 구현, missing-plugin doctor guidance gate 통과
6. examples for Codex/Cursor

## 11. 출시 기준

출시 가능 판단:

```text
1. 지원 스택에서 직접 편집이 안정적으로 동작
2. patch 실패 시 코드 손상 없음
3. intent diff가 line diff보다 명확함
4. AI handoff task가 실제 Codex 작업에 유용함
5. 사용자가 작은 UI 변경을 AI에게 말로 시키지 않아도 됨
```

## 12. 핵심 데모

### 데모 1: Direct edit

```text
AI가 만든 상품 그리드
→ 카드 클릭
→ columns/gap/radius 수정
→ 코드 patch
→ HMR 반영
→ intent diff 확인
```

### 데모 2: Agent handoff

```text
상품 그리드 선택
→ "empty state 추가" 입력
→ agent task 생성
→ Codex가 구현
→ Intent Layer가 diff 분석
→ 사용자가 승인
```

### 데모 3: AI-friendly docs

```text
Codex가 INTENT_LAYER.md와 ProductGrid.intent.yml을 읽고
raw code가 아닌 intent-aware 방식으로 수정한다.
```

## 13. 최종 제품 인상

출시형 MVP가 사용자에게 줘야 하는 느낌:

```text
이건 단순 visual editor가 아니다.
AI가 만든 코드를 내가 이해하고 통제할 수 있게 해주는 레이어다.
작은 건 내가 바로 고치고,
큰 건 AI에게 구조화해서 맡기고,
결과는 의미 단위로 검수한다.
```
