# INTENT_LAYER 상세 기획서

## 0. 문서 정보

- 제품 가칭: `INTENT_LAYER`
- 문서 버전: `0.1`
- 작성일: `2026-06-29`
- 1차 타깃: AI로 프론트엔드 코드를 만드는 개발자, 바이브코더, 초보 프론트엔드 개발자
- 초기 지원 스택: `React + Vite + Tailwind CSS + TypeScript`

## 1. 한 줄 정의

`INTENT_LAYER`는 AI가 만든 React/Tailwind UI를 사람이 화면에서 직접 선택하고, 의미 단위로 이해하고, 안전하게 수정할 수 있게 해주는 **코드-의도 중간 레이어**이자 **deterministic visual patch tool**이다.

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
AI Integration: optional Codex/Cursor/Claude plugin
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
1. 코드와 화면 사이의 Intent Document 규격
2. AI 호출 없는 deterministic patch
3. line diff가 아닌 intent diff
4. confidence 기반 편집 가능성 표시
5. 코드/문서 drift 감지
6. 에이전트가 raw code가 아니라 intent operation을 다루게 하는 기반
```

즉, 단순 visual editor가 아니라 **UI 코드를 위한 Prisma-like 중간 레이어**를 지향한다.

## 6. 타깃 사용자

### 6.1 1차 사용자

- Cursor, Codex, Claude, v0, Lovable 등으로 React UI를 자주 만드는 사람
- Tailwind는 쓰지만 className을 일일이 고치는 것이 피곤한 사람
- AI가 만든 UI를 시각적으로 빠르게 다듬고 싶은 사람
- 코드는 조금 알지만 line-by-line review가 부담스러운 바이브코더
- 프론트엔드 초보지만 코드 기반 작업을 포기하고 싶지는 않은 사람

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

### 7.1 지원 스택

정식 지원:

```text
React
Vite
TypeScript / TSX
Tailwind CSS
literal className
단순 cn()/clsx()
```

제한적 지원:

```text
shadcn/ui
CSS variables
simple CSS modules
local 및 one-hop relative import 기반 variant/cva handoff context
tsconfig paths alias + one-hop/multi-hop named barrel re-export 기반 variant/cva handoff context
tsconfig paths alias + 다단계 barrel re-export 기반 imported variable handoff context
```

미지원:

```text
Next.js 정식 지원
styled-components
Emotion
복잡한 CSS cascade 편집
Tailwind arbitrary value 전범위
동적 className 완전 해석
package import, variant 함수 의미, cross-variable data flow 기반 variant graph 해석
Figma import
AI 자동 리팩터링
```

### 7.2 지원 편집

v1.0에서 반드시 잘해야 하는 편집 범위:

```text
spacing:
  padding
  margin
  gap

layout:
  flex direction
  grid columns
  width ratio 일부
  alignment 일부

typography:
  font size
  font weight
  line height

color:
  background color
  text color
  border color

shape:
  border radius
  border width

responsive:
  sm/md/lg variant 표시
  단순 breakpoint별 값 수정
```

### 7.3 v1.0 핵심 기능

1. 브라우저 오버레이
2. 요소 선택
3. 소스 파일/컴포넌트 추적
4. Tailwind token을 의미 knob로 표시
5. knob 변경 시 deterministic code patch
6. safe patch preview
7. undo/revert
8. intent diff
9. confidence 표시
10. `.intent.yml` 문서 생성/갱신

## 8. 사용자 경험

### 8.1 설치

```bash
npm install -D intent-layer
```

`vite.config.ts`:

```ts
import { intentLayer } from "intent-layer/vite"

export default {
  plugins: [intentLayer()]
}
```

실행:

```bash
npm run dev
npx intent-layer
```

현재 MVP package surface는 `bin/intent-layer.cjs` wrapper와 package `/vite` export로 검증한다. `npm run eval`은 `npm pack --dry-run`, 실제 tarball 생성, 임시 폴더 설치, 설치된 `intent-layer --help`, 설치된 `intent-layer-spike/vite` import, 설치된 plugin transform/graph, 실제 Vite dev server의 graph/preview/apply, 3-file graph refresh smoke를 package smoke gate로 측정한다. 공개 npm package 이름과 외부 사용자용 install guide 문구는 launch polish에서 확정한다.

### 8.2 기본 흐름

```text
1. 사용자가 React/Vite/Tailwind 앱 실행
2. 브라우저 오른쪽 아래에 Intent Layer 버튼 표시
3. 선택 모드 진입
4. 화면 요소 클릭
5. 패널에 다음 정보 표시
   - 컴포넌트 이름
   - 파일 경로
   - 역할/의도
   - 편집 가능한 layout/style 속성
   - confidence
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

## 9. Intent Document 규격

제품의 핵심 자산은 새 문서 규격이다.

권장 확장자:

```text
*.intent.yml
*.intent-diff.yml
*.intent-op.json
```

내부 저장:

```text
.intent/
  graph.intent.json
  components/
    ProductGrid.intent.yml
    ProductCard.intent.yml
  operations/
    2026-06-29_001.intent-op.json
  diffs/
    last.intent-diff.yml
  schema/
    intent.schema.json
    intent-op.schema.json
    intent-diff.schema.json
```

### 9.1 Intent Document 예시

```yaml
version: 0.1
kind: component-intent

component:
  id: cmp_product_grid
  name: ProductGrid
  source:
    file: src/components/ProductGrid.tsx
    export: ProductGrid
    range:
      start: 120
      end: 420

purpose:
  label: 상품 목록 그리드
  description: 상품 배열을 카드 형태로 반복 표시한다.
  confidence: 0.82
  origin: ai-assisted

structure:
  root:
    id: node_grid_root
    role: collection
    label: 상품 카드 목록
    source:
      file: src/components/ProductGrid.tsx
      xid: x_8f31a
      range:
        start: 180
        end: 390
    repeat:
      sourceExpression: products
      itemName: product
    layout:
      type:
        value: grid
        confidence: 1.0
        binding:
          kind: tailwind-token
          token: grid
      columns:
        value: 3
        unit: count
        editable: true
        confidence: 1.0
        binding:
          kind: tailwind-token
          token: grid-cols-3
          range:
            start: 214
            end: 225
      gap:
        value: 16
        unit: px
        editable: true
        confidence: 1.0
        binding:
          kind: tailwind-token
          token: gap-4
          range:
            start: 226
            end: 231

validation:
  sourceHash: "fingerprint:..."
  generatedAt: "2026-06-29T00:00:00Z"
```

### 9.2 중요한 필드

`binding`:

```text
문서가 코드와 연결되는 핵심 필드.
binding 없는 intent는 설명일 뿐 patch 불가.
```

`confidence`:

```text
추적 확실도.
낮으면 read-only 또는 AI-assisted 모드로 처리.
```

`origin`:

```text
deterministic: 코드에서 확실히 추출
ai-assisted: AI가 의미 추정
user-authored: 사람이 확인/수정
```

`sourceHash`:

```text
코드와 intent 문서 drift 감지.
MVP 구현은 local deterministic source fingerprint를 사용하고,
필요하면 배포 단계에서 cryptographic hash로 교체할 수 있다.
```

## 10. 내부 아키텍처

### 10.1 패키지 구조

```text
packages/
  core/
    intent schema
    operation model
    diff model
    confidence model

  tailwind/
    token parser
    scale resolver
    token replacement

  react/
    JSX AST adapter
    component/source mapping

  vite/
    Vite plugin
    data-intent-id injection
    HMR integration

  server/
    local intent server
    source lookup
    patch apply
    cache

  overlay/
    browser overlay UI
    element picker
    knobs panel
    patch preview
    pending undo history and branch undo controls

  cli/
    init
    dev
    scan
    diff
    check
```

MVP 구현 순서는 `init`/`dev`/`scan`/`check`/`apply`/`diff`/`agent-context`/`agent-task`/`agent-result`를 먼저 제공한다.

### 10.2 의존성 원칙

`core`는 특정 프레임워크에 묶이면 안 된다.

```text
core는 React, Vite, Tailwind, VS Code를 직접 알면 안 됨.
adapter가 normalized data를 core에 넘김.
```

좋은 분리:

```text
Core:
  IntentNode
  IntentProperty
  SourceBinding
  PatchOperation
  ValidationResult

Adapters:
  React AST
  Tailwind tokens
  Vite HMR
  Browser DOM
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
DOM id 추가 오버헤드: node당 20 bytes 내외 목표
sidecar graph write: 의미 fingerprint 변경 시에만 수행
external corpus 검증: 외부 source는 `.intent/external-corpus/` 로컬 복사본과 manifest로만 측정
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

가까운 경쟁 축:

- Onlook: React visual editor
- Piny: VS Code/Cursor 안에서 React/Tailwind visual edit
- Frontman: browser-based AI frontend agent
- stagewise: UI 선택 후 agent에 context 전달
- Plasmic/Puck: React visual builder
- v0/Bolt/Lovable/Replit: AI app/UI builder

`INTENT_LAYER`가 피해야 할 포지션:

```text
또 하나의 Tailwind visual editor
또 하나의 AI app builder
또 하나의 React page builder
```

차별 포지션:

```text
AI-generated frontend code를 위한 intent layer.
Line diff와 raw className 사이에 사람이 검수 가능한 semantic layer를 만든다.
```

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

- [ ] React/Vite/Tailwind 데모 프로젝트 지원
- [ ] `data-intent-id` 삽입
- [ ] source sidecar map 생성
- [ ] browser overlay
- [ ] 요소 선택
- [ ] source lookup
- [ ] Tailwind spacing/layout/color/radius token parser
- [ ] knob panel
- [ ] range patch
- [ ] undo/revert + pending history
- [ ] intent diff
- [ ] `.intent` 폴더 생성
- [ ] confidence 표시
- [ ] patch 실패 시 안전 중단
- [ ] 문서/튜토리얼

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

### v0.1

- Vite plugin
- React TSX source mapping
- Tailwind spacing knob
- patch preview

### v0.2

- color/radius/typography
- intent document 저장
- intent diff
- undo/revert

### v0.3

- simple `cn()`/`clsx()` support
- responsive variants
- confidence model
- selected component summary

### v1.0

- 안정적인 Vite/React/Tailwind 지원
- 문서화
- 튜토리얼
- 예제 프로젝트
- npm 배포
- 초기 사용자 피드백 루프

### v1.1+

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
- HMR 반영 300ms 내외

정성:

- 사용자가 "이건 AI에게 말로 시킬 필요가 없다"고 느끼는가
- AI가 만든 UI를 검수하는 시간이 줄어드는가
- line diff보다 intent diff가 더 이해하기 쉬운가
- 초보자가 CSS/Tailwind 파일을 직접 뒤지는 빈도가 줄어드는가

## 20. 최종 판정

이 제품은 시장이 없는 아이디어는 아니다. 하지만 단순 visual editor로 만들면 이미 늦었다.

살아남는 조건:

```text
1. Intent Document 규격을 제품의 핵심으로 만든다.
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
