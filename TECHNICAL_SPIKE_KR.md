# INTENT_LAYER 기술 스파이크

## 1. 목적

이번 스파이크의 목적은 제품 전체를 만드는 것이 아니라, 가장 위험한 가정 하나를 작게 검증하는 것이다.

검증 질문:

```text
React/Vite/Tailwind 프로젝트에서 정적 className을 가진 DOM 요소를 클릭하고,
그 요소를 원본 TSX source range로 연결한 뒤,
Tailwind token 하나를 작은 range patch로 바꿀 수 있는가?
```

이번 단계에서는 큰 패키지 구조, 정교한 intent schema, Next.js, shadcn/ui 전체 지원을 의도적으로 제외했다.

## 2. 구현 범위

포함:

- React + Vite + Tailwind 데모 앱
- Vite compile-time instrumentation
- intrinsic JSX element 대상 `data-intent-id` 삽입
- `.intent/graph.intent.json` sidecar graph 생성
- 브라우저 floating overlay
- element pick -> intent binding 표시
- static `className` token 목록 표시
- simple `cn()` / `clsx()` literal segment token 표시
- unsupported `className` 표현식의 read-only binding 생성
- 지원 가능한 Tailwind token 후보 선택
- apply 전 patch preview
- source hash 검증
- old token 검증
- range patch 적용
- operation log 기반 undo stack과 patch 되돌리기
- pending undo 항목 비파괴 폐기
- undo 충돌 시 `.intent/conflicts/*.intent-conflict.json` 기록
- undo conflict 목록 조회와 pending undo 폐기 처리
- 구조화된 agent handoff task 생성
- 구조화된 agent result 문서 생성
- agent handoff source snapshot, result source diff, selected/component/related `className` semantic token diff 생성
- 브라우저 click-to-panel, preview, apply, revert round-trip latency 측정
- 최소 intent operation/diff 파일 생성
- corpus 분석 스크립트
- Codex-generated 50개 React/Tailwind corpus fixture와 coverage 리포트
- 성능/안전성 평가 스크립트

제외:

- 완성형 제품 UI
- full dynamic `cn()` / `clsx()` patch
- shadcn/ui 전체 패턴 직접 편집
- Next.js
- portal mapping
- props className forwarding
- 전체 프로젝트 AST 상시 분석
- 큰 `.intent.yml` schema
- npm 배포

## 3. 핵심 구현 결정

### 3.1 Compile-time instrumentation

DOM-to-source mapping은 브라우저 런타임에서 추론하지 않는다.

현재 구현은 Vite plugin에서 TSX 파일을 파싱하고, 정적 `className`을 가진 intrinsic JSX element에 `data-intent-id`를 삽입한다.
MVP에서 자주 나오는 static `className`, simple/partial `cn()` / `clsx()`, read-only expression은 먼저 low-level JSX/className scanner로 처리한다.
scanner가 처리하지 못하는 복잡한 syntax는 기존 TypeScript AST 경로로 fallback한다.

대상 예:

```tsx
<section className="grid grid-cols-3 gap-4 p-6">
```

변환 방향:

```tsx
<section className="grid grid-cols-3 gap-4 p-6" data-intent-id="il_...">
```

동시에 sidecar graph에 다음 정보를 저장한다.

```text
intent id
source file
component name
tag name
className source range
className value
token list
source hash
transform time
```

`className={someVariable}`, runtime template literal, variant 함수처럼 직접 patch하기 어려운 경우도 `read-only` binding으로 기록한다.
이 경우 token 목록은 비어 있고 `unsupportedReason`만 남긴다.
사용자는 해당 요소를 선택한 뒤 직접 patch 대신 agent handoff task를 만들 수 있다.

### 3.2 Range patch only

AST code generation으로 파일을 다시 출력하지 않는다.

현재 patch 방식:

1. 선택된 `intent id`로 source binding 조회
2. 파일을 다시 읽음
3. 저장된 `sourceHash`와 현재 파일 hash 비교
4. 저장된 token source range에서 old token 검증
5. old token이 정확히 있으면 해당 token range만 교체
6. operation/diff 파일 생성

되돌리기 방식:

1. apply 성공 시 dev server가 patch 결과를 in-memory undo stack에 push한다.
2. 동시에 `.intent/operations/operation-log.json`에 apply entry를 append한다.
3. `/__intent/revert-last` 호출 시 stack의 마지막 patch range에 `nextToken`이 그대로 있는지 확인한다.
4. 정확히 일치하면 `oldToken`으로 다시 교체한다.
5. revert operation/diff 파일을 생성하고 operation log에 revert entry를 append한다.
6. dev server 메모리 stack이 비어 있으면 operation log에서 아직 revert되지 않은 apply stack을 복원한다.
7. `/__intent/undo-history`가 pending undo stack을 JSON으로 반환하고 overlay가 최근 pending undo 항목을 표시한다.
8. `/__intent/discard-undo`는 사용자가 선택한 pending undo 항목을 소스 변경 없이 operation log에서 폐기 처리한다.
9. `/__intent/revert-undo`는 선택한 pending undo의 저장 range에 `nextToken`이 그대로 있을 때만 non-top revert를 적용한다.
10. stored range의 `nextToken`이 이미 다른 token으로 바뀌었으면 revert를 거부하고 `.intent/conflicts/*.intent-conflict.json`에 expected/actual/restore token과 검토 가이드를 기록한다.
11. `/__intent/conflicts`가 미해결 conflict artifact를 반환하고, `/__intent/resolve-conflict`가 사람이 확인한 conflict를 `discard-pending-undo`로 해결 처리한다.

이 방식은 MVP용 LIFO undo stack이다.
브랜치 히스토리는 현재 pending undo 폐기와 안전한 non-top revert를 지원한다.

source hash가 다르면 patch를 거부한다.
old token이 없으면 patch를 거부한다.

## 4. 주요 파일

```text
vite.config.ts
src/App.tsx
src/intent/vitePlugin.ts
src/intent/instrument.ts
src/intent/patch.ts
src/intent/agentTask.ts
src/intent/agentResult.ts
src/intent/tailwind.ts
src/intent/client.ts
scripts/analyze-classnames.ts
scripts/evaluate-spike.ts
scripts/generate-ai-corpus.ts
scripts/import-external-corpus.ts
fixtures/corpus/*.tsx
fixtures/ai-generated/*.tsx
reports/performance/*.json
```

## 5. 실행 방법

의존성 설치:

```bash
npm install
```

개발 서버:

```bash
npm run dev
```

검증:

```bash
npm run typecheck
npm run eval
npm run build
```

AI corpus fixture 재생성/분석:

```bash
npm run generate:ai-corpus
npm run analyze:ai-corpus
```

로컬 외부 corpus import/분석:

```bash
npm run import:external-corpus -- <external-react-project-or-samples>
npm run analyze:external-corpus
```

외부 corpus 복사본은 `.intent/external-corpus/` 아래에 저장하고 커밋하지 않는다.
기본 리포트는 `reports/performance/external-corpus-audit.json`에 쓴다.

`npm run eval`은 다음을 생성한다.

```text
reports/performance/corpus-audit.json
reports/performance/ai-corpus-audit.json
reports/performance/spike-evaluation.json
```

## 6. Context Pack 사용

사용한 외부 프로젝트:

```text
https://github.com/Fharena/context-pack
```

적용 방식:

1. `context-pack setup --dry-run`으로 생성 계획 확인
2. `context-pack setup`으로 `.context-pack` 문맥 라이브러리 생성
3. `context-pack start --task "Build INTENT_LAYER static className click-to-patch spike with numeric evaluation docs"` 실행
4. 생성된 context pack의 read-first 문서를 읽고 작업 범위를 확인

이번 작업에서 context-pack은 전체 repo를 무작정 읽지 않고 `docs`, `overview` 영역을 먼저 보도록 라우팅했다.
생성된 `.context-pack/packs/CONTEXT_PACK.md`는 임시 파일이므로 커밋하지 않는다.

## 6.1 AI-generated Corpus Audit

MVP direct-edit 표면적을 더 넓게 보기 위해 `fixtures/ai-generated`에 Codex-generated React/Tailwind TSX 샘플 50개를 추가했다.
샘플은 dashboard, landing, shadcn-like card, workflow controls, read-only 변수/variant 패턴을 섞어 만들었다.

측정 결과:

```text
files: 50
className occurrences: 390
static className: 320 / 390 = 82.05%
simple cn/clsx: 20 / 390 = 5.13%
partial cn/clsx: 10 / 390 = 2.56%
read-only: 40 / 390 = 10.26%
supported direct editable coverage: 78.76%
```

해석:

- 50개 Codex-generated corpus에서는 직접 편집 가능한 token 표면적이 50% gate를 넘었다.
- read-only의 주요 원인은 variable reference 20건, property access 10건, variant function 10건이다.
- 이 corpus는 재현 가능한 로컬 benchmark이지만, 외부 프로젝트에서 독립 수집한 corpus는 아니다.

## 6.2 External Corpus Import Harness

외부 프로젝트 코드를 repo에 바로 커밋하지 않기 위해 `scripts/import-external-corpus.ts`를 추가했다.

동작 방식:

- 입력으로 받은 외부 React/Tailwind TSX/JSX 파일을 스캔한다.
- `className`이 없는 파일, test/spec/story 파일, build output, `node_modules`는 기본 제외한다.
- 선택된 파일 복사본을 `.intent/external-corpus/files/`에 저장한다.
- 원본 경로, 복사본 경로, SHA-256 hash, byte 수, `className` 수를 manifest로 남긴다.
- 같은 `analyzeClassNames` 기준으로 coverage를 계산하고 gate 결과를 JSON으로 저장한다.

`npm run eval`의 작은 smoke 결과:

```text
selected files: 3
files scanned: 3
className occurrences: 6
skipped story files: 1
supported direct editable coverage: 75.76%
gate: externalCorpusHarnessPass = true
```

이 smoke는 importer와 report/gate 형식이 동작함을 검증한다.
실제 시장 검증용 수치는 아직 독립 외부 corpus 50-100개를 넣어 다시 측정해야 한다.

### 3.3 Simple cn/clsx literal segment support

현재 MVP는 다음 패턴을 직접 patch할 수 있다.

```tsx
className={cn("grid gap-4 p-6", active && "bg-teal-50")}
className={clsx("rounded-lg px-4 py-2", selected && "bg-teal-700")}
```

지원 방식:

- `cn()` / `clsx()` 호출 안의 문자열 literal segment만 source range로 저장한다.
- 조건 자체는 해석하지 않는다.
- `className` 변수 전달, variant 함수, runtime template literal은 read-only로 둔다.
- 동적 인자가 섞여 있어도 문자열 literal segment는 partial direct-edit 대상으로 삼는다.

## 7. 현재 한계

- 직접 patch 대상은 static `className`과 simple/partial `cn()` / `clsx()` 문자열 literal segment다.
- `cn()` / `clsx()`는 문자열 literal segment만 patch한다.
- `className={someVariable}`는 직접 patch 대신 read-only binding과 agent handoff로 처리한다.
- template literal은 직접 patch 대신 read-only binding과 agent handoff로 처리한다.
- variant 함수와 props forwarding은 직접 patch 대신 read-only binding과 agent handoff로 처리한다.
- undo는 operation log 기반 LIFO stack으로 여러 direct patch를 순서대로 되돌릴 수 있다.
- dev server 재시작 후에도 graph binding이 다시 준비되면 operation log에서 pending undo stack을 복원할 수 있다.
- overlay는 pending undo history를 최근 5개까지 표시하고 다음 revert 대상을 강조하며, 각 pending undo를 비파괴적으로 폐기하거나 안전하게 non-top revert할 수 있다.
- stored range의 `nextToken`이 바뀐 undo 충돌은 직접 되돌리기를 거부하고 `.intent/conflicts/*.intent-conflict.json`에 기록한다.
- overlay는 미해결 undo conflict를 표시하고, 사용자가 확인한 pending undo를 폐기 처리할 수 있다.
- branch undo는 저장 range의 expected token이 그대로 있는 non-top patch를 소스에서 되돌릴 수 있고, 불일치 시 conflict artifact로 거부한다.
- agent handoff는 선택 source window snapshot, component snapshot, related source snapshot, task/result markdown, intent diff 기록을 지원한다.
- agent result는 선택 source window와 선택 component snapshot의 before/after line diff를 기록한다.
- agent result는 단순 변수 참조 read-only binding의 same-file/imported related source diff와 related semantic token diff를 기록한다.
- related semantic token diff는 단순 quoted 변수 선언, imported 변수 선언, simple `cn()` / `clsx()` 변수 선언, 배열/object map/template literal literal segment를 fixture로 검증한다.
- variant 함수 read-only binding은 같은 파일 안의 local `function` / `const` variant 선언, one-hop relative named import, tsconfig paths alias + one-hop/multi-hop named barrel re-export 뒤의 variant 선언을 related source snapshot으로 저장하고, result 기록 시 related source/semantic diff를 남긴다.
- package smoke는 tarball install 뒤 `vite.cjs` wrapper 기반 `/vite` export로 외부 temp fixture를 transform하고 `data-intent-id`/`.intent/graph.intent.json` 생성까지 확인한다.
- 같은 설치 폴더에서 실제 Vite dev server를 띄워 `/src/App.tsx` transform 결과, `/__intent/graph`, `/__intent/preview`, `/__intent/apply` endpoint 응답까지 HTTP로 확인한다.
- 설치된 Vite dev server smoke는 `gap-4 -> gap-6` patch를 실제 source에 적용하고, operation/diff/log artifact 생성과 apply 후 module/graph 갱신까지 확인한다.
- 설치된 Vite dev server smoke는 App/Header/Card 3개 TSX 파일을 graph에 올린 뒤 Card만 `gap-4 -> gap-8`로 바꾸고, graph entry 3개 유지, 변경 파일 token 갱신, 미변경 파일 유지, graph generatedAt 변경까지 확인한다.
- agent result는 선택 source window와 선택 component 범위에서 `className` semantic token diff를 기록한다.
- component snapshot fixture는 function + nested/map/conditional/fragment, arrow block, arrow parenthesized expression, arrow JSX no-parens, memo, forwardRef, HOC, namespace object export 8개 case를 검증한다.
- 아직 전체 파일 의미 변화, props/data flow 변화, variant 함수 의미 변화까지 자동 추론하지는 않는다.
- 실제 브라우저 click-to-panel, preview, apply, revert 시간은 overlay가 `performance.now()`로 측정해 `/__intent/client-metric`에 기록한다.
- 최신 브라우저 측정은 desktop 3회, mobile 390x844 viewport 3회로 반복했다.
- Codex-generated 50개 React/Tailwind corpus에서는 supported direct editable coverage 78.76%를 기록했다.
- 외부 corpus import/analyze harness는 `.intent/external-corpus/` 로컬 복사본, manifest, coverage gate를 생성할 수 있고, eval smoke에서 3개 샘플/75.76% coverage로 통과했다.
- 현재 fixture에서는 warm transform 5ms 목표와 cold transform 10ms 목표를 만족했다.
- 100개 카드/401개 binding을 가진 대형 TSX stress fixture는 20ms 목표를 만족했다.
- 100개 카드/401개 binding 반복 transform fixture에서는 semantic graph fingerprint 기반 write throttling이 통과했다.
- 제품급 multi-file HMR 세션에서는 cache, changed-file filtering, graph write throttling을 더 큰 파일 수와 실제 import graph로 추가 재측정해야 한다.

## 8. 다음 작업

우선순위:

1. `npm run import:external-corpus -- <path>`로 외부 프로젝트에서 독립 수집한 React/Tailwind corpus 50-100개를 넣고 editable coverage를 다시 측정한다.
2. package import와 cross-variable data flow에 대한 agent handoff 문맥을 보강한다.
3. 외부 corpus와 제품급 TSX 파일에서 component snapshot false-positive/false-negative를 재측정한다.
4. 실제 제품급 대형 TSX 파일에서 cache와 graph write throttling을 검증한다.

## 9. Agent Handoff와 Result

직접 편집이 어렵거나 구조 변경이 필요한 작업은 overlay에서 agent task로 넘길 수 있다.

task 생성 흐름:

1. 사용자가 요소를 선택한다.
2. overlay의 `Agent handoff` 입력칸에 원하는 변경을 적는다.
3. `/__intent/agent-task` endpoint가 선택된 source binding을 조회한다.
4. `.intent/agent/task_*.md` 파일을 생성한다.

task 문서에는 다음 항목을 포함한다.

```text
Goal
Selected Component
Current Intent Document
Component Snapshot
Related Source Snapshot
Source Snapshot
Desired Change
Constraints
Files That May Be Edited
Files That Should Not Be Edited
Required Checks
Expected Result
```

이번 구현은 LLM을 호출하지 않는다.
작업을 Codex/Cursor/Claude 같은 외부 agent에게 넘기기 좋은 markdown으로 구조화하는 것만 담당한다.

result 기록 흐름:

1. agent가 작업을 마친 뒤 사용자가 결과 요약을 적는다.
2. `/__intent/agent-result` endpoint가 선택된 source binding을 조회한다.
3. `.intent/agent/result_*.md` 문서를 생성한다.
4. `.intent/diffs/*_agent.intent-diff.yml` 문서를 생성한다.

result 문서에는 다음 항목을 포함한다.

```text
Summary
Source Binding
Task
Changed Files
Checks
Notes
Source Diff
Semantic Intent Diff
Related Source Diff
Related Semantic Intent Diff
Component Source Diff
Component Semantic Intent Diff
Intent Diff
```

이번 단계의 result 기록은 결정론적 감사 로그다.
task 생성 시 선택 source window snapshot과 선택 component snapshot을 저장하고, result 기록 시 현재 source와 비교해 각각 line diff를 남긴다.
단순 변수 참조 read-only binding은 관련 변수 선언을 related source snapshot으로 저장하고, result 기록 시 related source diff와 related semantic token diff를 남긴다.
변수 선언은 같은 파일뿐 아니라 tsconfig paths alias와 다단계 barrel re-export 뒤의 imported 선언까지 따라갈 수 있다.
선택 source window와 선택 component 범위 안의 `className` 값은 before/after token으로 다시 분석해 추가/삭제 token과 category를 intent diff에 남긴다.
소스 파일의 현재 hash를 다시 읽어 `sourceHashChanged`도 기록한다.
component-level semantic diff는 현재 `className` token 기준으로 제한한다.
related source semantic diff는 단순 quoted 변수 선언 문자열, imported 변수 선언 문자열, simple `cn()` / `clsx()` 변수 선언, 배열/object map/template literal의 literal segment를 token 단위로 재분석한다.
variant 함수 read-only binding은 같은 파일 안의 local variant 함수/변수 선언, one-hop relative named import, tsconfig paths alias + one-hop/multi-hop named barrel re-export 뒤의 variant 선언을 related source로 저장해 source diff와 literal token semantic diff를 남긴다.
아직 package import, variant 함수 의미, cross-variable data flow까지 자동 분석하지는 않는다.
전체 파일 의미 변화, props/data flow 변화, variant 함수 의미 변화까지 자동 분석하지는 않는다.

### 9.1 Read-only Handoff

직접 patch할 수 없는 `className`도 선택 가능한 binding으로 남긴다.

예:

```tsx
const cardClass = "grid grid-cols-3 gap-4 rounded-lg p-6";

export function Card() {
  return <div className={cardClass}>Card</div>;
}
```

이 경우 overlay에는 다음처럼 표시된다.

```text
className: read-only
dynamic args read-only: 1
unsupported: variable-reference
```

직접 token patch 버튼은 표시되지 않고, agent handoff task/result 기록만 사용할 수 있다.
단순 변수 참조인 경우 task에는 변수 선언 related source snapshot이 포함되고, result에는 해당 선언의 line diff와 semantic token diff가 기록된다.
imported 변수 선언도 tsconfig paths alias와 barrel re-export를 거쳐 최종 선언 파일을 snapshot 대상으로 삼을 수 있다.

## 10. Browser Metrics

overlay는 실제 사용자 상호작용 시간을 브라우저 안에서 측정한다.

현재 측정 항목:

```text
graphFetchMs
pickToPanelMs
clickToPanelMs
bindingLookupMs
renderMs
preview roundTripMs
preview serverMs
preview renderMs
apply roundTripMs
apply serverMs
apply renderMs
revert roundTripMs
revert serverMs
revert renderMs
```

dev server endpoint:

```text
POST /__intent/client-metric
GET /__intent/client-metrics
DELETE /__intent/client-metrics
```

최신 실제 브라우저 측정은 in-app browser로 `Pick element`를 누른 뒤 `Patch Preview` heading을 선택하고, 첫 typography token을 `text-lg -> text-xl`로 preview/apply한 뒤 `Undo last`로 되돌려 수행했다.
샘플은 desktop 기본 viewport 3회, mobile 390x844 viewport 3회로 나누어 측정했다.

요약:

```text
samples: 6 total = 3 desktop + 3 mobile
click-to-panel max: 2.3ms
preview round trip max: 5.9ms
apply round trip max: 32.3ms
revert round trip max: 36.5ms
```

결과는 `reports/performance/browser-click-metric.json`에 저장한다.
