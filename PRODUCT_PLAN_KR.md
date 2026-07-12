# INTENT_LAYER 상세 기획서

## 0. 문서 정보

- 제품 가칭: `INTENT_LAYER`
- 문서 버전: `0.1`
- 작성일: `2026-06-29`
- 1차 타깃: AI로 프론트엔드 코드를 만드는 개발자, 바이브코더, 초보 프론트엔드 개발자
- 초기 지원 스택: `React + Vite + Tailwind CSS + TypeScript`

### 0.1 현재 구현 기준선 (2026-07-12)

현재 상태는 범용 제품이 아니라 **AI-native 동작 alpha**다. 화면 선택, TypeScript AST source binding, 의미 기반 Tailwind 후보, minimal range patch, source hash 기반 undo를 브라우저 GUI와 로컬 MCP가 같은 `IntentService`를 통해 사용한다. Markdown Agent queue는 기본 경로가 아니라 고급 호환성 기능이다.

현재 구현 원칙:

- JSX 분석은 fast scanner와 AST 이중 구현이 아니라 TypeScript AST 한 경로를 사용한다.
- intrinsic JSX와 `React.createElement()`은 지원하되 `cloneElement` provenance는 추측하지 않는다.
- 후보가 실제로 둘 이상일 때만 토큰을 editable로 표시한다.
- AI는 source offset이나 raw patch를 전달할 수 없고 `intentId + semantic property + candidate value`만 요청한다.
- apply는 expiring preview, source hash, atomic file lock과 idempotency key를 검증한다.
- 브라우저가 연결되어 있으면 Vite HMR 뒤 실제 렌더 인스턴스의 class token을 검증한다.
- undo는 임의 순서 branch undo가 아니라 최신 pending patch부터 처리한다.
- 서로 다른 MCP 프로세스의 apply/undo는 프로젝트 operation lock으로 직렬화하고, 공용 저널은 atomic rename으로 기록한다.
- Vite의 source-changing HTTP 요청은 loopback 연결과 세션 토큰을 모두 요구한다.
- 브라우저가 없으면 source 검증 결과와 별개로 전체 verify는 성공으로 반환하지 않는다.
- Vitest 회귀 테스트, GitHub Actions CI, 실패 시 exit 1인 평가 gate를 출시 기준으로 사용한다.
- npm tarball은 raw TypeScript 대신 `dist/` JavaScript를 포함한다.
- 활성 문서는 README, PRODUCT_PLAN, DEMO_WALKTHROUGH, FAILURE_MODES의 KR/EN 네 쌍으로 제한한다.

이 문서 뒤쪽의 장기 package 구조와 v1 아이디어는 구현 완료 사실이 아니라 가설로 읽어야 한다.

## 1. 한 줄 정의

`INTENT_LAYER`는 사람과 AI가 같은 React/Tailwind source binding과 안전 패치 엔진을 사용하는 **결정론적 UI actuator**다.

짧은 문장:

> AI가 만든 UI를 말로 다시 시키지 말고, 화면에서 직접 만지고, 의미 diff로 검수하고, 안전한 코드 patch로 반영한다.

영문 포지션:

> DevTools for AI-made React UI.

## 2. 왜 필요한가

AI 코딩 도구는 큰 덩어리의 UI와 로직을 빠르게 만든다. 하지만 실제 작업에서는 사람이 직접 보면 10초 만에 고칠 수 있는 미세 조정이 계속 발생한다.

예:

- 카드 간격을 조금 줄이기
- 오른쪽 패널 너비를 넓히기
- 모바일에서 버튼을 아래로 내리기
- 제목 크기를 한 단계 줄이기
- `div` 반복 구조를 사람이 이해 가능한 컴포넌트 의미로 접기
- AI가 만든 변경사항을 line diff가 아니라 의미 단위로 검수하기

현재 방식은 비효율적이다.

```text
사람: 카드 간격 좀 줄여줘.
AI: 전체 컴포넌트 일부를 다시 작성.
사람: 아니, 그 카드 말고 아래 카드.
AI: 다른 className 수정.
사람: 다시 코드 확인.
```

이 루프는 느리고, 비결정적이며, 작은 수정에도 불필요하게 AI 호출을 요구한다.

`INTENT_LAYER`는 이 문제를 다음 방식으로 푼다.

```text
화면 요소 클릭
→ 원본 코드와 연결
→ 의미 단위 속성 표시
→ 사람이 직접 값 조정
→ deterministic patch 생성
→ HMR로 즉시 반영
→ intent diff로 변경사항 검수
```

## 3. 제품이 아닌 것

명확한 비범위를 잡아야 한다.

`INTENT_LAYER`는 다음이 아니다.

- Expo/RN 같은 앱 프레임워크
- v0/Bolt/Lovable 같은 AI 앱 빌더
- Figma 대체 디자인 도구
- Webflow 같은 노코드 빌더
- 모든 CSS/JS를 완벽히 해석하는 범용 웹 역공학 도구
- 매 수정마다 LLM을 호출하는 AI 에이전트
- 기존 React/Tailwind 프로젝트를 자체 DSL로 강제 이전시키는 프레임워크

제품의 중심은 AI가 아니라 **Intent Core**다.

```text
AI = 보조 해석자
Intent Core = 결정적 매핑/패치 엔진
사람 = 의미 단위 검수자/조작자
```

## 4. 제품 포지션

### 4.1 짧은 포지션

> AI-native frontend를 위한 Intent Inspector & Visual Patch Tool.

### 4.2 긴 포지션

AI가 생성한 React/Tailwind 코드를 그대로 line diff로 검수하기 어렵다. `INTENT_LAYER`는 실제 화면과 원본 코드 사이에 규격화된 intent 문서를 두고, 사람이 layout/style/structure/behavior를 의미 단위로 읽고 수정할 수 있게 한다.

### 4.3 프레임워크인가, 툴인가, 에이전트 플러그인인가

1차 제품 형태는 **툴체인**이다.

```text
Core: Intent Engine
Runtime: browser overlay + local server
Integration: Vite plugin
Distribution: CLI + optional editor extension
AI Integration: optional Codex/Cursor/Claude command plan / plugin
```

프레임워크가 아니다. 사용자가 새 프레임워크로 갈아타게 만들면 도입 장벽이 너무 높다. 기존 React/Tailwind 프로젝트에 붙는 도구여야 한다.

에이전트 플러그인은 중요하지만 1차 본체가 아니다. 에이전트는 intent graph를 읽고 더 좋은 작업을 할 수 있게 하는 소비자 중 하나다.

## 5. 핵심 차별점

경쟁 제품은 보통 다음 중 하나다.

- AI로 UI 생성
- 화면에서 스타일 수정
- UI 선택 후 AI에게 컨텍스트 전달
- React visual builder

`INTENT_LAYER`의 차별점은 다음이다.

```text
1. 코드와 화면을 잇는 source binding과 semantic operation 계약
2. AI 호출 없는 deterministic patch
3. line diff가 아닌 intent diff
4. source hash 기반 drift 거부와 guarded undo
5. 사람 GUI와 AI MCP가 공유하는 동일한 patch engine
6. 지원하지 않는 편집을 숨기지 않는 read-only/handoff 경계
```

즉, 단순 visual editor가 아니라 사람과 AI가 함께 쓰는 **guarded UI source actuator**를 지향한다.

## 6. 타깃 사용자

### 6.1 1차 사용자

- Cursor, Codex, Claude, v0, Lovable 등으로 React UI를 자주 만드는 사람
- Tailwind는 쓰지만 className을 일일이 고치는 것이 피곤한 사람
- AI가 만든 UI를 시각적으로 빠르게 다듬고 싶은 사람
- 코드는 조금 알지만 line-by-line review가 부담스러운 바이브코더
- 프론트엔드 초보지만 코드 기반 작업을 포기하고 싶지는 않은 사람

이 사용자층에서는 GUI가 1차 조작면이어야 한다. CLI는 설치, 진단, 반복 평가, 자동화용 보조 수단으로 둔다.

첫 실행 설정도 GUI-first여야 한다. Vite plugin 등록 후 브라우저 overlay에서 한국어/영어 선택, `.intent` workspace 생성, source binding 상태 확인과 프로젝트 로컬 Codex/Claude MCP 연결까지 처리한다. AI 연결은 사용자가 켠 provider만 설정하고 전역 config는 수정하지 않는다. 같은 화면은 완료 후에도 Settings로 재진입할 수 있어야 하며, 기존 Agent queue와 CLI spawn 설정은 접힌 고급 호환성으로 둔다.

### 6.2 2차 사용자

- 프론트엔드 개발자
- 디자이너형 개발자
- AI 코드 리뷰 도구 제작자
- UI 컴포넌트 라이브러리 관리자
- 디자인 시스템 운영자

### 6.3 초기 비타깃

- 순수 디자이너
- 노코드 사용자
- 복잡한 CSS-in-JS 프로젝트
- 대형 엔터프라이즈 디자인 시스템
- 모든 프레임워크를 즉시 지원해야 하는 팀

## 7. v1.0 제품 범위

v1.0은 "작지만 바로 출시 가능한 제품"이어야 한다.

### 7.1 지원 계약과 검증 매트릭스

지원 여부는 네 단계로 말한다.

| 상태 | 의미 |
| --- | --- |
| 검증 완료 | 자동 회귀 테스트와 실제 브라우저 흐름이 모두 있다. |
| 부분 지원 | source fixture 또는 parser 테스트는 있지만 설치부터 브라우저 적용까지의 전체 증거는 없다. |
| 미검증 | 구조상 동작할 수 있어도 release contract로 주장하지 않는다. |
| 의도적 제외 | 잘못 고칠 위험이나 범위 비용 때문에 read-only 또는 Agent handoff로 보낸다. |

2026-07-12 기준 실제 검증 환경은 Node.js 20/22, npm, pnpm 10.34.5, React 18.3.1/19.2.7, Vite 6.4.3/8.1.4, TypeScript 5.9.3, Tailwind CSS 3.4.19/4.3.2, Playwright Chromium 149다. Windows에서 전체 검증했고 GitHub Actions는 Ubuntu의 Node.js 20/22 경로를 갖는다. yarn/bun, Firefox/WebKit, macOS는 아직 정식 지원이 아니다.

React API를 재구현하거나 Hook을 오버라이드하지 않는다. 이 제품의 지원 단위는 API 이름이 아니라 **브라우저 DOM으로 렌더되는 intrinsic JSX가 원본 JSX/TSX에 어떤 형태로 남아 있는가**다. [React API reference](https://react.dev/reference/react)의 Hook, Context, `memo`, `lazy`, transition API는 intrinsic JSX를 그대로 포함하면 일반 AST traversal을 통과하지만, runtime에서 만든 class 문자열은 추론하지 않는다.

| React source 형태 | 상태 | 동작 |
| --- | --- | --- |
| 함수/arrow component의 intrinsic JSX와 정적 `className` | 검증 완료 | DOM 선택, source binding, token patch, HMR, undo |
| class component의 `render()` 안 intrinsic JSX | 부분 지원 | binding과 component 이름 단위 테스트 완료. 실제 브라우저 E2E는 아직 없다. |
| fragment, conditional, `map`, `forwardRef`, `Suspense` fallback, portal 인자의 JSX | 부분 지원 | AST traversal 단위 테스트 완료. portal/모든 wrapper의 실제 클릭 E2E는 아직 없다. |
| `import React from "react"`, namespace import, named/aliased import의 intrinsic `createElement` | 부분 지원 | module import 이름과 literal tag/object props를 확인한다. nested scope에서 같은 이름을 shadowing하는 edge case는 아직 미검증이다. |
| `cn()`/`clsx()`의 문자열 인자와 양쪽이 문자열인 조건 분기 | 검증 완료 | literal range만 편집하며 클릭한 DOM의 class 목록에 없는 비활성 분기는 패널에서 숨긴다. React 19 `cn()` 조건 분기는 브라우저 E2E, `clsx()`는 같은 parser 경로의 회귀 fixture로 검증한다. |
| 재사용 컴포넌트 구현 내부 intrinsic 요소 | 검증 완료 | 같은 source id의 모든 렌더 인스턴스에 적용되고 shared 상태를 표시한다. |
| `<Button className=...>` 또는 `<motion.div>` 같은 커스텀/member 컴포넌트 호출부 | 의도적 제외 | prop이 실제 DOM에 전달된다고 추측하지 않고 구현 내부 요소에 바인딩한다. |
| `cloneElement`, import 없는 전역 `React.createElement`, compiled `jsx/jsxs` 호출 | 의도적 제외 | provenance 또는 원본 source range가 불명확하다. |
| React Server Components, server-only DOM, React Native | 미검증 | 현재 Vite browser DOM adapter의 범위 밖이다. |

[Vite plugin contract](https://vite.dev/guide/api-plugin)의 `apply: "serve"` 경계를 사용한다. 계측과 overlay는 개발 서버에서만 동작하며 production bundle은 금지 marker 0건을 별도 gate로 검사한다. MagicString range insertion이 원본 TSX `sourcesContent`를 포함한 source map을 반환하고 Vite/React 후속 transform과 합성되는지 브라우저 E2E로 검사한다. `.intent/**`와 queue signal은 Vite watcher에서 제외해 graph/operation 기록이 page reload를 다시 일으키지 않게 한다.

Tailwind CSS 3의 정적 config와 표준 utility를 검증했고, Tailwind CSS 4.3.2의 [`@theme` 변수](https://tailwindcss.com/docs/theme), `@tailwindcss/vite` dev/build, project color 후보, HMR patch와 undo를 React 19/Vite 8 브라우저 fixture로 검증했다. config 코드를 실행하거나 plugin utility 의미를 추론하지 않는다.

### 7.2 직접 편집 계약

현재 직접 편집하는 범위:

- spacing: padding, margin, gap, 유효한 음수 margin
- sizing: width, height, min/max, size
- layout: display, numeric grid columns/column start/span, flex direction/wrap/value, align/justify/content/self
- typography: font size, font weight, line height
- color: background, text, border, divide, ring/outline/decoration/accent/caret/fill/stroke/shadow color의 알려진 palette와 정적 project token
- shape/effect: border radius, shadow size, opacity, ring width, transition 종류
- variant: 기존 responsive/state/arbitrary variant prefix를 보존한 단일 token 교체
- content: 정적 className binding이 있는 intrinsic JSX의 단일·한 줄 literal text

Grid Layout Composer는 일반 token dropdown보다 좁다. 같은 TSX 파일, 정적 한 줄 `className`, 기존 `grid` 부모와 바인딩된 직계 자식, Tailwind 기본 및 정적으로 읽은 min-width project breakpoint, 1~12개 열/행, numeric start/span, 단순 양수 `fr` 열 template만 그룹 편집한다.

Flex Layout Composer는 같은 binding 계약에서 기존 base `flex`/`inline-flex` 부모의 direction, wrap, justify, align, project gap과 자식별 `align-self`만 그룹 편집한다.

현재 read-only 또는 handoff 범위:

- runtime variable, property access, template expression, object형 `clsx`, `cva`/variant 의미
- `raw`/max-only/동적으로 계산된 breakpoint, Grid/Flex order·DOM reorder
- `minmax()`, named line, CSS variable를 포함한 복합 arbitrary Grid template
- cross-file Grid/Flex 자식, 반복된 source id의 인스턴스별 배치, 축별 Flex `gap-x`/`gap-y`, 외부 package source patch
- styled-components, Emotion, 전체 CSS cascade, CSS Modules declaration 직접 편집
- Next.js/RSC adapter, Figma import, 결정론적 패치로 위장한 AI 자동 리팩터링

### 7.3 다음 기능과 정리 결정

P0 안정화는 production 계측 제거, React factory provenance 확인, semantic flex 후보 분리, invalid negative utility 거부, 프로젝트 드라이브 temp 격리, 오래된 raw-TS bin 제거까지 완료했다.

P1에서 runtime-active 조건 분기 필터, source apply 전 DOM-only preview, color swatch, 수치 순서 spacing stepper, guarded literal text, project breakpoint/Grid row, Flex composer, Vite source map/자체 artifact 감시 제외, React 19/Tailwind CSS 4/Vite 8의 npm·pnpm 호환성 gate를 완료했다. 남은 외부 검증은 다음과 같다.

1. 5개 이상 독립 저장소의 실제 작업으로 prompt-only 대비 첫 성공 시간과 patch 품질을 A/B 측정한다.
2. yarn/bun은 실제 사용자 수요가 확인될 때 설치 호환성을 검증한다.
3. A/B와 초기 사용자 피드백이 통과한 뒤 npm registry 공개 배포를 승인한다.

정리 원칙:

- 기본 비활성인 legacy Markdown Agent queue는 동결한다. 회귀 수정 외 새 analyzer/CLI/UI를 추가하지 않고, 실제 사용 증거가 없으면 v1 전에 별도 compatibility package로 추출하거나 제거한다.
- `.intent/components/*.intent.yml` 영속 문서, confidence model, AI semantic label은 현재 direct-edit 가치를 높이지 않으므로 v1 release gate에서 제외한다. 독립 A/B 결과가 필요성을 보여줄 때만 재개한다.
- corpus coverage는 parser 범위 지표일 뿐 제품 성공률이 아니다. 새 prose benchmark 문서를 만들지 않고 JSON report만 갱신한다.
- Next.js, VS Code extension, Figma와 새 styling adapter는 React/Vite/Tailwind 호환성 matrix와 실제 사용자 A/B가 통과하기 전 시작하지 않는다.

## 8. 사용자 경험

### 8.1 설치

```bash
npm install -D intent-layer
npx intent-layer init
npm run dev
```

`init`은 workspace 생성과 정적인 Vite config AST patch를 한 번에 처리한다. 기존 설정은 멱등적으로 유지하고, 동적 plugins 표현식은 파일을 건드리지 않고 거부한다. 현재 package surface는 빌드된 `dist/cli.js`와 `intent-layer/vite` export로 검증한다. `npm run eval`은 tarball 생성과 임시 설치, 설치된 CLI/Vite plugin, 실제 Vite dev server의 graph/preview/apply/revert, multi-file graph refresh, missing-plugin doctor guidance를 gate로 실행한다. 상세 수치는 `reports/performance/spike-evaluation.json`에만 기록하며 gate 하나라도 실패하면 exit code 1로 끝난다.

### 8.2 기본 흐름

```text
1. 사용자가 React/Vite/Tailwind 앱 실행
2. 브라우저 오른쪽 아래에 Intent Layer 버튼 표시
3. 선택 모드 진입
4. 화면 요소 클릭
5. 패널에 다음 정보 표시
   - 컴포넌트 이름
   - 파일 경로
   - source hash와 className binding 종류
   - 편집 가능한 layout/style 속성
   - shared render 수와 unsupported reason
6. 사용자가 padding/gap/color 등 수정
7. 적용 전 patch preview 표시
8. Apply 클릭
9. 코드 patch 저장
10. Vite HMR로 즉시 반영
11. intent diff에 변경 기록
```

### 8.3 예시

원본:

```tsx
<div className="grid grid-cols-3 gap-4 p-6">
  {products.map(product => (
    <ProductCard product={product} />
  ))}
</div>
```

패널:

```text
ProductGrid
src/components/ProductGrid.tsx

Layout
- columns: 3
- gap: 16px

Spacing
- padding: 24px
```

사용자 조작:

```text
columns: 3 -> 2
gap: 16px -> 24px
```

patch:

```tsx
<div className="grid grid-cols-2 gap-6 p-6">
```

intent diff:

```yaml
changes:
  - target: ProductGrid.layout.columns
    label: 한 줄 카드 개수
    from: 3
    to: 2
  - target: ProductGrid.layout.gap
    label: 카드 간격
    from: 16px
    to: 24px
```

## 9. 현재 Intent Artifact 계약

현재 핵심 자산은 큰 서술형 문서가 아니라 **검증 가능한 source binding과 semantic operation**이다.

| Artifact | 현재 상태 | 역할 |
| --- | --- | --- |
| `.intent/graph.intent.json` | 사용 중 | Vite session들이 publish한 최신 DOM-to-source binding graph |
| `.intent/operations/*.intent-op.json` | 사용 중 | apply/undo에 필요한 원문, 적용 후 hash, range와 상태 |
| `.intent/diffs/*.intent-diff.yml` | 사용 중 | 사람이 읽는 semantic change summary |
| `.intent/components/*.intent.yml` | 예약, 자동 생성 안 함 | 독립 A/B가 지속적 component intent의 가치를 증명할 때만 재개 |
| `.intent/schema/` | setup 자산 | 현재 artifact 형식과 workspace version 확인 |

직접 patch에서 source path와 offset을 AI나 브라우저가 임의로 제출할 수 없다. 서버가 현재 graph의 element id와 semantic property로 binding을 다시 찾고, project root 내부 경로인지 확인하며, preview/apply/undo마다 source hash와 원문을 검증한다.

`purpose`, `origin`, 수치형 `confidence` 같은 필드는 구현된 사실이 아니다. 이를 다시 도입하려면 사용자에게 보이는 결정 또는 안전 경계를 실제로 개선하는 회귀 테스트가 먼저 필요하다. 현재의 안전 판정은 모호한 점수 대신 `editable`, 구체적인 `unsupportedReason`, stale hash와 runtime verification 상태로 표현한다.

## 10. 내부 아키텍처

### 10.1 현재 alpha 구조

```text
src/intent/
  types.ts           domain contract
  instrument.ts      TypeScript AST source binding
  tailwind.ts        token and semantic property adapter
  graphStore.ts      graph revision, publish, reload
  intentService.ts   GUI/HTTP/MCP shared use cases
  patch.ts           preview, apply, operation log, guarded undo
  fileLock.ts        per-source atomic lock
  runtimeSession.ts  selection and live Vite session
  vitePlugin.ts      transform, HTTP and HMR adapter
  client.ts          browser overlay
  mcp/               stdio tools, resources and client setup
```

외부에서 독립 버전이 필요한 실제 consumer가 생기기 전에는 monorepo package 분리를 하지 않는다. `vitePlugin.ts`와 MCP는 파일을 직접 수정하지 않고 모두 `IntentService`를 호출한다. MCP의 6개 도구는 stdio로만 노출하며 remote HTTP/OAuth server는 현재 범위가 아니다.

### 10.2 의존성 원칙

서비스와 patch core는 특정 AI provider나 브라우저 DOM에 묶이면 안 된다.

```text
IntentService는 Codex, Claude, MCP transport를 직접 알면 안 됨.
Vite, browser, Tailwind, MCP adapter가 normalized data를 넘김.
```

좋은 분리:

```text
Core:
  IntentGraphStore
  IntentService
  SourceBinding / semantic property
  PatchOperation / ValidationResult

Adapters:
  TypeScript React AST
  Tailwind token semantics
  Vite HTTP/HMR and Browser DOM
  MCP stdio
```

## 11. 추적/성능 전략

대형 프로젝트에서 느려지면 제품은 실패한다.

핵심 원칙:

> 전체 프로젝트를 계속 이해하지 말고, 사용자가 보고 선택한 부분부터 점진적으로 이해한다.

### 11.1 최소 instrumentation

DOM에는 짧은 id만 삽입한다.

```html
<div data-intent-id="a1b2c3">
```

무거운 메타데이터는 sidecar map에 둔다.

```json
{
  "a1b2c3": {
    "file": "src/components/ProductGrid.tsx",
    "range": [120, 156],
    "component": "ProductGrid"
  }
}
```

### 11.2 On-demand AST 분석

전체 파일을 항상 분석하지 않는다.

```text
요소 클릭
→ intent id 확인
→ file/range lookup
→ 해당 파일만 AST parse
→ 해당 JSX node 주변만 분석
```

### 11.3 Tailwind 분석도 선택 요소 중심

분석 범위:

```text
selected node
parent 3 levels
direct children 일부
```

### 11.4 성능 목표

```text
Vite transform 추가 비용: 파일당 5ms 이하 목표
요소 선택 -> 패널 표시: 100ms 이하
단순 patch 저장: 50ms 이하
HMR 반영: 기존 Vite 속도 유지
installed Vite smoke HMR refresh: apply 51.556ms, 3-file change 118.416ms, smoke target 500ms 이하
DOM id 추가 오버헤드: node당 20 bytes 내외 목표
sidecar graph write: 의미 fingerprint 변경 시에만 수행
external corpus 검증: 외부 source는 `.intent/external-corpus/` 로컬 복사본과 manifest로만 측정, report는 `sample.sourceKind`와 `mvpEvidence`로 smoke fixture와 독립 외부 evidence를 구분
product-sized graph refresh: generated 24-file/624-binding fixture는 통과했지만 실제 외부 프로젝트 HMR로 재측정
```

## 12. AI 사용 원칙

수정 하나하나에 AI agent를 호출하면 안 된다.

기본 조작은 deterministic해야 한다.

AI가 들어갈 지점:

- 최초 intent label/purpose 생성
- 모호한 구조 설명
- 복잡한 리팩터링 제안
- intent diff 요약
- 코드 변경의 의미 추론
- 에이전트가 작업 전 intent graph를 읽는 경우

AI가 들어가면 안 되는 지점:

- padding/gap/color/radius 같은 직접 조작
- 단순 Tailwind token 교체
- patch apply
- undo/revert
- validation

원칙:

```text
AI는 해석자.
Intent Core는 조작자.
사용자는 승인자.
```

## 13. 기술적 난점

### 13.1 DOM to Source Mapping

클릭한 DOM이 어떤 JSX 노드에서 왔는지 정확히 찾아야 한다. Vite plugin과 AST instrumentation이 필요하다.

### 13.2 동적 className

다음과 같은 코드가 난관이다.

```tsx
className={cn("grid gap-4", isActive && "bg-blue-500")}
```

v1.0에서는 단순 케이스만 지원하고, 모호하면 read-only로 둔다.

### 13.3 CSS Cascade

computed style은 실제 결과를 알려주지만 어떤 코드가 원인인지는 알려주지 않는다. 따라서 v1.0은 Tailwind token 중심으로 간다.

### 13.4 Patch 안정성

파일 전체 rewrite는 위험하다. range 기반 최소 patch가 필요하다.

### 13.5 Intent Drift

문서가 코드와 어긋나면 제품 신뢰가 무너진다. `sourceHash`, `binding`, `validation`이 필수다.

## 14. 경쟁 제품과 차별화

### 14.1 2026년 7월 정성 수요 조사

이 조사는 대표성 있는 시장 통계가 아니라 공개 사용자 발언과 현재 제품 문서를 이용한 방향 검증이다.

- [Lovable 사용자는 border color 하나를 바꾸는 데 AI credit을 쓰는 경험](https://www.reddit.com/r/lovable/comments/1uisn68/visual_edits_ugh/)을 이탈 이유로 들었다. 단순 미세 편집은 무료이고 즉시 실행되어야 한다.
- [Claude 사용자는 브라우저에서 요소를 고르고 바로 변경을 요청하는 흐름](https://www.reddit.com/r/ClaudeAI/comments/1tok0a8/visual_ui_editing_with_claude_click_element_in/)을 찾고 있다. screenshot 설명보다 정확한 selection context가 수요다.
- [Bolt 사용자는 한 수정이 기존 동작을 깨뜨리고 파일 전체를 다시 쓰는 문제](https://www.reddit.com/r/boltnewbuilders/comments/1i7l1yo/i_really_like_boltnew_but_one_challenge_ive/)를 반복해서 지적한다. minimal patch, preview, undo는 부가 기능이 아니라 구매 신뢰의 핵심이다.
- [react-rewrite](https://www.reddit.com/r/tailwindcss/comments/1smk5vu/i_built_a_visual_editor_overlay_for_react_that/)처럼 실제 저장소에 AST patch를 쓰는 도구도 등장했다. 직접 코드 반영 자체는 더 이상 유일한 차별점이 아니며, 잘못된 node를 절대 고치지 않는 신뢰성과 설치 마찰이 승부처다.

따라서 확인된 수요는 "또 하나의 AI 생성기"가 아니라 **AI 비용 없이 가능한 미세 편집, 정확한 요소 지목, 기존 코드 보존, 로컬 저장소 소유권**이다.

### 14.2 현재 경쟁 지도

| 제품 | 현재 중심 | INTENT_LAYER가 정면 경쟁하지 않을 부분 |
| --- | --- | --- |
| [Onlook](https://www.onlook.com/for/react) | 디자이너용 광범위 React canvas, AI 생성, 여러 styling system | 전체 디자인 툴과 무한 canvas |
| [Piny](https://getpiny.com/) | IDE 안의 Tailwind visual control, custom theme, direct code edit | VS Code extension 자체 |
| [stagewise](https://docs.stagewise.io/) | browser를 포함한 완전한 agentic IDE와 diff review | 모델 실행기와 범용 IDE |
| [Domscribe](https://www.domscribe.com/) | build-time stable ID, source와 live DOM 사이의 양방향 MCP context | context 조회만으로 승부하는 포지션 |
| [Impeccable Live](https://impeccable.style/docs/live/) | 선택 요소에 AI 디자인 variant를 생성하고 하나를 source에 반영 | AI 디자인 생성 품질 경쟁 |
| [react-rewrite](https://github.com/donghaxkim/react-rewrite) | deterministic AST write-back, drag/reorder/text edit | 넓은 canvas 조작 기능 경쟁 |

`INTENT_LAYER`가 피해야 할 포지션:

```text
또 하나의 Tailwind visual editor
또 하나의 AI app builder
또 하나의 React page builder
```

차별 포지션:

```text
사람과 여러 AI client가 함께 쓰는 provider-neutral deterministic UI operation layer.
semantic property -> guarded preview -> minimal patch -> source/runtime verify -> undo를 하나의 계약으로 만든다.
```

### 14.3 조사에서 도출한 제품 결정

다음 우선순위:

1. spacing/color/text 같은 작은 직접 편집은 AI 호출 없이 로컬에서 계속 무료로 제공한다.
2. wrong-node 0건, 전체 파일 rewrite 0건, unavailable runtime을 성공으로 표시하지 않는 것을 제품 신뢰 지표로 둔다.
3. 하드코딩 palette를 늘리기보다 프로젝트 Tailwind theme와 CSS variable에서 후보를 읽는 adapter를 만든다.
4. Grid/Flex GUI는 기존 layout container의 의미 토큰만 다룬다. DOM 순서 변경과 동적 반복 구조는 agent handoff로 내린다.
5. 독립 저장소에서 prompt-only 대비 첫 성공 시간, 재시도 횟수, wrong-node, undo 사용률을 측정한 뒤 기능 범위를 넓힌다.

지금 하지 않을 것:

- 무한 canvas, 자유 배치 canvas, sibling reorder. 기존 Grid/Flex의 제한된 semantic control만 예외다.
- Next.js와 여러 framework 동시 확장
- AI가 디자인 variant 여러 개를 생성하는 기능
- 범용 agent IDE 또는 자체 모델 실행기

legacy Agent queue/launch 계층은 alpha 호환성으로 보존하지만 기본 설정, 요소 패널, HTTP route에서 닫는다. 설정의 고급 호환성 toggle을 켠 경우에만 queue route와 pickup integration을 활성화한다. evaluator는 전용 `.intent/tmp/evaluation-agent`를 사용해 실제 큐를 오염시키지 않는다.

### 14.4 검증된 구조 변경과 남은 위험

- selection은 Vite session별 파일에 저장하고 현재 선택에 `sessionId`와 30분 freshness를 기록한다. 죽은 process의 session은 제거한다. AI resource가 여러 활성 session 중 최신 선택을 반환한다는 규칙은 구현됐지만, 사용자가 오래된 탭을 계속 살려 둔 경우 어떤 탭을 의도했는지는 UI에서 확인해야 한다.
- graph publish는 per-file ownership과 atomic lock으로 디스크 graph를 병합한다. 두 store가 서로 다른 파일을 publish하고 한 파일을 삭제하는 fixture가 통과한다. 같은 파일을 동시에 다른 source 상태로 연 경우에는 마지막 source hash가 이기며 patch 단계가 drift를 다시 거부한다.
- candidate provider는 `tailwind.config.*`의 정적 object와 알려진 CSS/Tailwind v4 `@theme` 위치만 읽는다. config를 실행하지 않으며 동적 import, 함수 계산, 복합 arbitrary value는 일반화하지 않는다. 후보는 선택 시 조회해 graph에 중복 저장하지 않는다.
- breakpoint provider는 기본 Tailwind screen과 숫자로 환산 가능한 string/object `min`, v4 `--breakpoint-*`만 순서화한다. `raw`, max-only, CSS variable 값은 responsive 상속 순서를 증명할 수 없어 탭에서 제외한다.
- `client.ts`와 `cli.ts`는 크지만 파일 크기만을 이유로 지금 재작성하지 않는다. Grid Composer, literal text 또는 theme adapter에서 함께 수정되는 request/render 부분만 추출한다.

### 14.5 Grid Layout Composer 설계

#### 해결하려는 작업

사용자가 비대칭 카드 배치를 만들 때 `두 번째 카드는 4열부터 5칸, 세 번째 카드는 다음 줄 전체`처럼 길게 설명하지 않고, 실제 자식 블록의 열 범위를 GUI에서 고른 뒤 작은 Tailwind 패치로 확정한다.

이 기능은 범용 페이지 빌더가 아니다. 이미 존재하는 CSS Grid의 의미를 읽고, 아래 속성만 결정론적으로 편집하는 좁은 도구다.

```text
부모: grid-cols-N, grid-rows-N 또는 grid-cols-[1.2fr_0.8fr]
자식: col-start/span-N, row-start/span-N
variant: base, 기본 Tailwind screen, 정적으로 순서화한 project screen
```

#### UX 흐름

1. 사용자가 화면의 grid 부모를 선택한다.
2. 패널은 실제 직계 자식과 source binding을 대조한다.
3. breakpoint 탭과 열·행 수 stepper를 보여주고, 단순 fractional template이면 열 track 비율 slider를 보여준다.
4. 각 자식의 1~12열/행 placement strip에서 시작 위치와 span을 선택한다.
5. `미리보기`가 영향받는 source binding 수와 className 전후를 보여준다.
6. `적용`은 하나의 그룹 작업으로 source를 한 번만 쓴다.
7. 기존 `되돌리기`가 그룹 전체를 한 번에 복원한다.

같은 source binding이 화면에 여러 번 렌더링되면 source scope 영향 수를 먼저 표시한다. 화면 한 인스턴스만 다르게 만들려면 prop/variant 구조 변경이 필요하므로 직접 적용하지 않는다.

#### 첫 구현의 지원 계약

직접 편집:

- React/Vite가 만든 `data-intent-id`가 있는 grid 부모와 모든 직계 자식
- 부모와 자식 binding이 한 source 파일에 있음
- 부모와 자식의 `className`이 정적 문자열임
- 부모에 base `grid`가 있고 effective 열 수가 1~12 범위임. 명시적 base 열이 없으면 CSS Grid의 implicit 1열로 본다.
- 기본 Tailwind screen과 정적으로 순서화 가능한 project min-width screen을 한 breakpoint씩 편집
- `grid-cols`, `grid-rows`, `col-start`, `col-span`, `row-start`, `row-span` 토큰의 추가, 교체, 제거
- 양수 `fr` track만으로 된 단순 arbitrary template의 비율 변경

읽기 전용 또는 Agent 전달:

- `.map()` 결과처럼 같은 source id가 직계 자식에서 반복됨
- 자식 component 구현이 다른 파일에 있음
- `cn()`/`clsx()`의 조건 분기, `cva`, 변수 참조, template expression
- DOM 순서 변경, absolute placement, masonry, subgrid
- `raw`, max-only 또는 동적으로 계산된 project screen
- `minmax()`, CSS variable, line name 또는 12열을 넘는 arbitrary grid template

#### 가장 어려운 점과 결정

**여러 source range의 원자성**

부모와 여러 자식을 따로 적용하면 중간 실패 때 레이아웃이 반쪽만 바뀐다. 첫 구현은 모든 binding이 같은 파일일 때만 허용하고, 전체 source hash와 각 className 원문을 모두 검증한 뒤 메모리에서 결과를 만든 다음 파일을 한 번만 쓴다. 여러 파일 트랜잭션은 crash recovery까지 필요하므로 아직 지원하지 않는다.

**토큰 추가/삭제와 offset 이동**

기존 단일 토큰 교체만으로는 `col-start`가 없던 자식을 배치할 수 없다. 각 className literal을 하나의 최소 편집 범위로 만들고, 원본 range와 적용 후 range를 모두 operation에 저장한다. apply는 원본 range를 내림차순으로, undo는 적용 후 range를 내림차순으로 처리한다.

**재사용 component와 runtime instance의 차이**

DOM 자식이 세 개여도 source id가 같으면 세 개를 따로 배치할 수 없다. 직계 자식 id 중복을 검출해 direct edit을 거부하고, source-level 변경이 모든 렌더에 미치는 경우 영향 수를 표시한다.

**반응형 상속**

`md:` 값이 없으면 base/sm 값이 상속된다. inspect 결과는 explicit 값과 effective 값을 분리한다. 요청은 사용자가 실제로 바꾼 속성만 보내며, `null`은 해당 breakpoint 토큰 제거를 뜻한다. 이 구분 없이 effective 값을 다시 쓰면 불필요한 responsive token이 늘어난다.

**DOM 배치와 source 배치의 불일치**

브라우저는 선택된 부모의 실제 직계 자식 id만 전달하고, 서버는 현재 graph에서 id, 파일, class kind, token을 다시 해석한다. 브라우저가 source offset이나 raw patch를 보내지 못하게 한다.

#### 내부 데이터 흐름

```text
selected grid DOM
  -> parent id + ordered direct-child ids
  -> server-side support inspection
  -> semantic layout request (breakpoint/row/column/start/span)
  -> guarded grouped className preview
  -> expiring preview id
  -> operation lock + file lock + full validation
  -> one source write + intent-op + intent-diff
  -> graph refresh + HMR
  -> grouped undo
```

#### 검증 기준

- 지원 fixture에서 부분 적용 0건
- stale hash와 한 개 className mismatch 주입 시 source write 0건
- 그룹 undo 후 byte-for-byte 원복 100%
- 지원되지 않는 반복/교차 파일 fixture의 잘못된 direct edit 0건
- 3~8개 자식 layout preview p95 20ms 이하, apply p95 50ms 이하
- 독립 사용자 과제에서 prompt-only 대비 첫 성공 시간 또는 재시도 횟수 중 하나를 30% 이상 개선

2026-07-12 로컬 evaluator에서 custom breakpoint와 row placement를 포함한 8개 자식 Grid 20회가 부분 쓰기 0건, byte restore 20/20, preview/apply p95 5.051/3.559ms를 기록했다. 기계 안전/지연 gate는 통과했지만 독립 사용자 A/B는 표본 0이므로 drag reorder와 여러 파일 트랜잭션은 계속 보류한다.

### 14.6 Flex Layout Composer 설계

Flex는 기존 base `flex`/`inline-flex` 부모와 직계 자식을 GUI로 읽고, direction, wrap, justify, align, project gap, 자식 `align-self`만 바꾼다. 방향과 wrap은 mode control, 정렬과 gap은 option control, 결과는 작은 Flex canvas에서 먼저 확인한다.

Grid와 같은 안전 계약을 사용한다. 모든 참여자는 한 파일의 정적 단일행 className이어야 하고, runtime 직계 자식 id가 유일해야 한다. 서버가 breakpoint 상속과 token 범위를 다시 해석하고, expiring preview 뒤 전체 source hash와 각 원문을 검증한 다음 파일을 한 번만 쓴다. `gap-x`/`gap-y`, unknown plugin utility, 반복 id, 교차 파일 자식은 전체 작업을 거부한다.

DOM 순서와 keyboard/screen-reader 순서가 달라질 수 있는 `order`/drag reorder는 지원하지 않는다. 2026-07-12 evaluator의 8개 자식 Flex 20회는 부분 쓰기 0건, byte restore 20/20, preview/apply p95 2.706/4.035ms를 기록했다.

## 15. 제품화 전략

### 15.1 출시 형태

1차:

```text
npm package
Vite plugin
browser overlay
local server
CLI
```

2차:

```text
VS Code/Cursor extension
Codex/Claude agent plugin
Next.js adapter
```

### 15.2 가격/배포 가설

초기에는 오픈소스 코어 + 유료 Pro 기능이 적합하다.

오픈소스:

- Vite plugin
- Tailwind knobs
- browser overlay
- local patch

유료 가능:

- AI intent labeling
- team intent review
- complex intent diff
- repo-wide semantic scan
- design system adapter
- CI intent regression report

단, v1.0은 수익화보다 adoption이 중요하다.

## 16. 출시 가능한 v1.0 체크리스트

필수:

- [x] React/Vite/Tailwind 데모 프로젝트 지원
- [x] `data-intent-id` 삽입
- [x] source sidecar map 생성
- [x] browser overlay
- [x] 요소 선택
- [x] source lookup
- [x] Tailwind spacing/layout/color/radius token parser
- [x] knob panel
- [x] range patch
- [x] undo/revert + pending history
- [x] intent diff
- [x] `.intent` 폴더 생성
- [x] patch 실패 시 안전 중단
- [x] 문서/튜토리얼
- [x] literal text와 Grid/Flex grouped patch 회귀 테스트
- [x] React 18/19, Tailwind 3/4, Vite 6/8, npm/pnpm 호환 gate
- [ ] 5개 이상 독립 저장소·20개 paired task 제품 A/B
- [ ] 승인된 npm registry 공개 배포와 초기 사용자 피드백 루프

## 17. 2주 기술 스파이크

성공 여부를 빠르게 판단하기 위한 최소 실험.

목표:

```text
React/Vite/Tailwind 페이지에서
카드를 클릭하고
gap/padding/radius를 panel에서 바꾸면
TSX className이 바뀌고
HMR로 즉시 화면이 반영된다.
```

스파이크 범위:

1. Vite plugin 작성
2. JSX node에 `data-intent-id` 삽입
3. sidecar map 생성
4. overlay에서 요소 선택
5. className literal 찾기
6. Tailwind token 파싱
7. `gap-4 -> gap-6` patch
8. intent diff 출력

성공 판정:

```text
AI에게 말로 시키는 것보다 빠르다는 느낌이 드는가?
코드 patch가 충분히 작고 안전한가?
대형 프로젝트에서도 느려지지 않을 구조인가?
```

## 18. 로드맵

### v0.1 (완료)

- [x] Vite plugin
- [x] React TSX source mapping
- [x] Tailwind spacing knob
- [x] patch preview

### v0.2 (부분 완료)

- [x] color/radius/typography
- 보류: component intent document 저장은 독립 A/B가 필요성을 보일 때 재개
- [x] intent diff
- [x] undo/revert

### v0.3 (부분 완료)

- [x] simple `cn()`/`clsx()` support
- [x] responsive variants
- 보류: confidence model은 v1 release gate에서 제외
- [x] selected component summary

### v0.4 (현재 alpha)

- [x] provider-neutral local MCP
- [x] loopback/session-token HTTP boundary
- [x] multi-process operation journal
- [x] 같은 파일 정적 Grid Layout Composer와 단순 fractional track 조절
- [x] project Tailwind theme/CSS variable candidate adapter
- [x] guarded literal text edit와 MCP `content.text`
- [x] project breakpoint와 Grid row/start/span
- [x] 같은 파일 정적 Flex Layout Composer
- [x] session-scoped selection과 multi-Vite graph merge fixture
- [ ] 5개 이상 독립 저장소의 실제 작업 20개 A/B (`product-ab-evaluation.json`: collecting, 0 paired tasks)
- [x] legacy Agent HTTP/UI opt-in 경계와 evaluator artifact 격리
- [x] Lumina/Modern Chromium setup/literal/Grid/Flex/HMR/undo/mobile CI
- [x] dev-only instrumentation과 production bundle marker 0건 gate
- [x] import provenance 기반 React `createElement` binding
- [x] runtime-active conditional token 구분과 DOM-only candidate preview
- [x] Vite transform source map과 원본 TSX 브라우저 합성 gate
- [x] React 19/Tailwind 4/Vite 8 npm 호환성 fixture
- [x] pnpm 10.34.5 fresh-install 호환성 fixture와 외부 pnpm 브라우저 round trip
- [x] evaluator 62개 gate와 텍스트/Grid/Flex 각 20회 byte-restore benchmark

### v1.0

- 안정적인 Vite/React/Tailwind 지원
- 문서화
- 튜토리얼
- 예제 프로젝트
- npm 배포
- 초기 사용자 피드백 루프

### v1.1+

아래 항목은 독립 A/B와 v1 compatibility gate가 통과한 뒤에만 시작한다.

- Next.js adapter
- VS Code extension
- AI semantic labeling
- agent plugin
- design system token integration

## 19. 성공 지표

정량:

- 요소 선택 후 패널 표시 평균 100ms 이하
- 단순 patch 성공률 95% 이상
- patch 후 syntax error 0건
- 지원 가능한 Tailwind class 인식률 90% 이상
- HMR 반영 300ms 내외, installed smoke gate는 500ms 이하

정성:

- 사용자가 "이건 AI에게 말로 시킬 필요가 없다"고 느끼는가
- AI가 만든 UI를 검수하는 시간이 줄어드는가
- line diff보다 intent diff가 더 이해하기 쉬운가
- 초보자가 CSS/Tailwind 파일을 직접 뒤지는 빈도가 줄어드는가

## 20. 최종 판정

이 제품은 시장이 없는 아이디어는 아니다. 하지만 단순 visual editor로 만들면 이미 늦었다.

살아남는 조건:

```text
1. source binding과 semantic operation contract를 제품의 핵심으로 만든다.
2. deterministic patch를 기본 경로로 삼는다.
3. AI는 보조층으로만 사용한다.
4. React/Vite/Tailwind로 좁게 시작한다.
5. "visual editor"가 아니라 "AI 코드 검수/편집 중간 레이어"로 포지셔닝한다.
```

시작할 가치:

```text
있음.
단, 2주 스파이크에서 "와, 이거 말로 AI에게 시키는 것보다 낫다"가 나오지 않으면 접는다.
```
