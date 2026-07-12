# INTENT_LAYER

[English](./README.md)

INTENT_LAYER는 React/Tailwind 화면을 브라우저에서 클릭하고, 해당 JSX 소스와 Tailwind 토큰을 확인한 뒤 작은 변경을 결정론적으로 적용하는 개발 도구다.

현재 제품 판단은 **동작하는 alpha**다. 사람은 브라우저 패널을, Codex와 Claude는 같은 로컬 MCP 도구를 사용한다. 두 경로 모두 동일한 source binding, 최소 패치, hash 검증과 undo를 거치며, 모든 React 표현식이나 Tailwind 설정을 편집하는 범용 도구는 아니다.

## 핵심 흐름

```text
화면 요소 선택
  -> 소스 파일, 컴포넌트, source hash 확인
  -> 편집 가능한 Tailwind 토큰 선택
  -> 후보를 DOM에만 임시 반영
  -> diff 미리보기
  -> 최소 range patch 적용
  -> 소스와 렌더 결과 검증
  -> 최신 패치 되돌리기
```

간단한 토큰 교체에는 LLM을 호출하지 않는다. 소스 해시나 토큰 위치가 달라졌으면 파일을 수정하지 않고 거부한다.

## 5분 시작

저장소에서 데모를 실행한다.

```bash
npm install
npm run dev
```

브라우저에서 Vite 주소를 열면 Intent Layer 패널이 나타난다.

1. 첫 설정에서 언어와 패널 위치를 고르고, 필요하면 Codex 또는 Claude 연결을 켠다.
2. `설정 완료`를 누른다.
3. `선택`을 누르고 화면 요소를 클릭한다.
4. 토큰 후보를 고르면 DOM에서 먼저 확인할 수 있다. 원복하거나 `미리보기`, `적용` 순서로 source 변경을 확정한다.
5. 문제가 있으면 `되돌리기`를 누른다.

한 줄짜리 순수 JSX text는 같은 패널에서 직접 고칠 수 있다. 표현식, entity, 중첩 element가 섞인 text는 source 의미가 달라질 수 있으므로 read-only다.

선택한 요소가 CSS Grid 안에 있으면 가장 가까운 grid 조상의 `Grid 배치`가 자동으로 열린다. breakpoint를 고르고 열·행 수와 각 자식의 열·행 범위를 GUI로 조정한 뒤 그룹 diff를 한 번에 적용하거나 되돌릴 수 있다. 가장 가까운 layout이 Flex면 `Flex 배치`에서 방향, wrap, 주축/교차축 정렬, gap, 자식별 `align-self`를 조정한다.

설정은 나중에도 패널의 `설정`에서 바꿀 수 있다. AI 연결을 켜면 프로젝트 로컬 `.codex/config.toml` 또는 `.mcp.json`에 Intent Layer 항목만 병합한다. 전역 설정은 수정하지 않는다.

## 다른 Vite 프로젝트에 설치

Node.js 20 이상이 필요하다. 아직 npm registry에 출판하지 않았으므로 로컬 tarball로 검증한다.

```bash
npm pack
cd <target-vite-project>
npm install <intent-layer-tarball>
npx intent-layer init
npm run dev
```

`intent-layer init`은 `.intent` workspace를 만들고 TypeScript AST로 Vite 설정을 확인한 뒤 `intentLayer()`를 React plugin보다 앞에 최소 삽입한다. 이미 설정돼 있으면 파일을 바꾸지 않는다. 정적인 `defineConfig({...})` 또는 plugins 배열이 아니면 추측해서 다시 쓰지 않고 실패 이유를 반환한다.

Vite 설정 파일이 없지만 `@vitejs/plugin-react`가 설치된 일반 React 프로젝트라면 표준 `vite.config.ts`를 만든다. 이후 설정 변경은 브라우저 패널에서 처리한다.

## 검증된 호환성

아래에서 "지원"은 이름이 비슷한 기술 전반이 아니라, 2026-07-12 현재 자동 테스트나 실제 브라우저 라운드트립이 있는 범위를 뜻한다.

| 영역 | 현재 검증된 범위 | 아직 정식 지원이 아닌 범위 |
| --- | --- | --- |
| Runtime | Node.js 20/22 CI, Windows 로컬 Node.js 22.16, npm, pnpm 10.34.5 설치/빌드 gate와 실제 pnpm 브라우저 round trip | Node.js 18 이하, yarn/bun 설치 흐름 |
| React | React 18.3.1과 19.2.7, intrinsic JSX, fragment/conditional/map traversal, `forwardRef`, `Suspense`/portal 안 JSX, import 출처가 확인된 `createElement` | React Server Components, React Native, `cloneElement` source provenance |
| Vite | Vite 6.4.3과 8.1.4 dev server, HMR, 원본 TSX로 합성되는 source map, `.intent` runtime artifact 감시 제외, 정적 config 설정, production 계측 0건 검사 | SSR/library mode, 동적 config 자동 수정 |
| TypeScript | TypeScript 5.9.3 parser, TSX 전체 라운드트립, JSX/TSX 파일 계측 | 빌드된 JSX runtime 호출 분석, 임의 Babel/SWC transform 뒤 source 복원 |
| Tailwind | Tailwind CSS 3.4.19와 4.3.2 브라우저 흐름, 정적 `tailwind.config.*`, v4 `@theme`, variant 보존, 수치로 정렬 가능한 project breakpoint | 동적 config 실행, `raw`/max-only screen 상속, plugin utility의 임의 의미 추론 |
| Tailwind v4 | `@tailwindcss/vite` 설치, `@theme` 색상 후보, DOM 미리보기, HMR patch와 정확한 undo | 외부 plugin이 만든 임의 utility 의미 추론 |
| Browser/OS | Playwright Chromium 149, Windows 로컬, GitHub Actions Ubuntu 경로 | Firefox, WebKit/Safari, macOS |

React Hook, Context, `memo`, `lazy` 같은 API를 오버라이드하지는 않는다. 해당 API를 쓰더라도 프로젝트 소스 안에 intrinsic JSX와 지원 가능한 `className`이 남아 있으면 같은 AST 경로로 처리하며, Hook이 runtime에서 조합한 문자열 자체는 해석하지 않는다. 커스텀 컴포넌트의 `className` prop 호출부도 DOM node로 추측하지 않고, 실제로 렌더된 intrinsic 요소의 구현 소스에 바인딩한다.

## 직접 편집 범위

현재 직접 편집은 JSX의 정적 `className`, `cn()`/`clsx()` 안의 문자열 리터럴, intrinsic `React.createElement()`, 그리고 정적 className이 있는 intrinsic JSX의 단일·한 줄 literal text를 대상으로 한다.

- spacing: padding, margin, gap의 표준 Tailwind scale
- sizing: width, height, min/max, size
- layout: display, grid columns/rows, flex, align/justify, numeric `col-start`/`col-span`/`row-start`/`row-span`
- radius와 typography 크기/굵기/line-height
- 표준 Tailwind color family와 프로젝트 `tailwind.config.*`, Tailwind v4 `@theme`, 보수적으로 식별한 CSS 변수 후보
- shadow, opacity, ring width, transition

후보가 자기 자신 하나뿐인 토큰은 편집 가능으로 표시하지 않는다. 프로젝트 theme는 실행하지 않고 정적 AST/CSS만 읽으며 프로젝트 후보를 기본 palette보다 먼저 보여준다. 해석할 수 없는 동적 config, `cva`, runtime 변수, property access, template expression은 inspect 가능하지만 직접 패치하지 않는다.

`cn()`/`clsx()` literal binding에서는 클릭한 DOM 인스턴스의 실제 class 목록과 비교해 비활성 조건 분기 토큰을 편집 목록에서 숨긴다. 후보를 고르면 source를 건드리지 않고 같은 source binding에서 기존 token이 활성인 렌더만 임시 교체하며, runtime drift가 없으면 원래 `class` 문자열을 그대로 복원한다. 색상은 swatch, spacing은 수치 순서 `-`/`+` control을 제공하고, source `적용`은 서버 diff 미리보기가 성공하기 전까지 잠겨 있다.

Grid Layout Composer는 같은 TSX 파일의 정적 `className`을 가진 기존 grid와 직계 자식만 직접 편집한다. Tailwind 기본 breakpoint와 정적으로 읽은 min-width project breakpoint에서 1~12개의 `grid-cols`/`grid-rows`, `col-start`/`col-span`, `row-start`/`row-span`을 그룹 작업으로 추가·교체·제거한다. `grid-cols-[1.2fr_0.8fr]` 같은 단순 양수 `fr` template은 track 비율 slider로 조정한다.

Flex Layout Composer도 같은 파일·정적 className·유일한 직계 자식 binding 계약을 사용한다. 기존 base `flex`/`inline-flex` container의 direction, wrap, justify, align, project gap과 자식 `align-self`만 편집한다. 반복 source id, 교차 파일 자식, `gap-x`/`gap-y`가 섞인 축별 간격, 임의 plugin token, DOM reorder는 부분 적용하지 않고 read-only로 내린다.

## 안전 규칙

- JSX는 TypeScript AST 한 경로로 분석한다. 문자열이나 주석 속 JSX 모양 텍스트는 instrumentation하지 않는다.
- `data-intent-id`와 overlay client는 Vite 개발 서버 transform에만 넣고 디스크 소스와 production bundle에는 쓰지 않는다.
- apply 전 binding source hash와 원래 토큰을 모두 확인한다.
- preview와 apply 사이에 파일이 바뀌어도 다시 거부한다.
- undo는 적용 후 전체 source hash가 맞는 **최신 pending patch**만 처리한다.
- 여러 Codex/Claude 프로세스의 apply와 undo는 프로젝트 operation lock으로 직렬화하며 저널은 atomic write한다.
- 브라우저 선택은 Vite session별 파일로 보존하고 현재 선택에 `sessionId`와 유효시간을 포함한다. 여러 Vite 서버의 graph publish는 각 서버가 소유한 파일만 교체하고 나머지 파일을 병합한다.
- drift가 있으면 파일 대신 `.intent/conflicts/`에 conflict artifact를 남긴다.
- patch는 전체 파일 codegen이 아니라 원래 source range만 교체한다.
- Grid/Flex 그룹 편집은 모든 className 원문과 source hash를 먼저 검증하고 같은 파일을 한 번만 쓴다. undo는 적용 후 range 전체를 검증한 뒤 그룹을 byte-for-byte 복원한다.
- source를 바꾸는 Vite HTTP 요청은 loopback 연결과 overlay 세션 토큰을 모두 요구한다. LAN 주소로 연 preview는 읽을 수 있어도 편집은 거부된다.

## Codex와 Claude에서 사용

설정에서 provider 연결을 켠 뒤 Codex 또는 Claude를 새로 시작하면 다음 로컬 MCP 도구를 사용할 수 있다.

- `intent_find_elements`, `intent_inspect_element`
- `intent_preview_edit`, `intent_apply_edit`
- `intent_verify_edit`, `intent_undo_edit`

브라우저에서 선택한 요소는 `intent://selection/current`로 공유된다. AI는 source offset이나 raw patch를 보내지 않고 의미 속성과 후보 값만 요청한다. `content.text`는 위와 같은 안전한 literal text 범위에서 기존 6개 MCP 도구로 편집할 수 있다. apply는 expiring preview, source hash, 파일 잠금과 idempotency key를 다시 검증한다. 브라우저가 연결돼 있으면 HMR 뒤 모든 렌더 인스턴스에 새 class token이 존재하는지도 확인한다.

`intent_verify_edit`에서 `runtime: unavailable`은 source가 온전하더라도 `ok: false`다. 다만 MCP tool execution error로 표시하지 않아 Agent가 성공한 source 검증과 누락된 시각 증거를 따로 처리할 수 있다. Source drift나 missing operation은 계속 tool error다.

직접 지원하지 않는 구조 변경은 `handoff-required`로 내려가며, Agent가 일반 코드 편집으로 처리할 수 있도록 정확한 source pointer를 제공한다. 기존 Markdown queue와 HTTP 경로는 기본적으로 꺼져 있으며 설정의 고급 호환성 toggle을 명시적으로 켠 프로젝트에서만 열린다.

MCP 서버를 직접 확인할 때만 CLI를 사용한다.

```bash
npm run build:package
node dist/cli.js mcp --root .
```

## 검증

일상 검증:

```bash
npm run typecheck
npm run test
npm run test:e2e:install
npm run test:e2e
npm run build
npm run test:production-build
npm run test:mcp-package
```

출시 전 전체 검증:

```bash
npm run verify
```

`npm run verify`는 typecheck, Vitest, package/demo build, production bundle 오염 검사, 설치 package MCP smoke, Chromium E2E, 고정 버전 pnpm 설치/빌드, 평가 gate와 제품 A/B 집계를 순서대로 실행한다. `npm run eval`은 그중 tarball 설치, 설치된 CLI와 Vite export/type declaration, 실제 Vite HTTP preview/apply/revert, multi-file graph refresh, 외부 corpus와 62개 성능·안전 gate를 담당한다. 현재 텍스트·Grid·Flex는 각각 20회 grouped round trip에서 부분 쓰기 0건과 byte restore 20/20을 기록했고, preview/apply p95는 각각 2.474/3.663ms, 5.051/3.559ms, 2.706/4.035ms다. 이 수치는 로컬 기계 메커니즘 지연이며 사용자 가치 A/B가 아니다.

`test:e2e`는 React 18/Tailwind 3 Lumina와 React 19/Tailwind 4 Modern fixture에서 설정, 선택, literal text, Grid 행/custom breakpoint, Flex, runtime 조건 분기, DOM 미리보기, HMR, 원본 TSX source map, byte-for-byte undo와 모바일 panel을 검증한다. Modern fixture는 실행 전에 pnpm의 로컬 `file:` package 사본을 강제로 갱신하므로 이전 `dist`로 통과할 수 없다. 하나라도 실패하면 exit code 1로 끝난다. 상세 결과는 [spike-evaluation.json](./reports/performance/spike-evaluation.json)에 기록된다.

테스트용 OS temp와 Playwright browser는 저장소의 `.intent/tmp/` 아래에 둔다. Windows에서는 workspace와 다른 드라이브의 temp 경로를 거부하므로, D 드라이브 저장소 테스트가 다시 C 드라이브를 채우지 않는다.

`npm run benchmark:mcp`는 inspect, preview, apply, undo와 in-memory MCP 호출의 로컬 기계 지연을 [mcp-alpha-evaluation.json](./reports/performance/mcp-alpha-evaluation.json)에 기록한다. 이 수치는 Agent 작업 성공률이나 제품 가치를 증명하지 않는다.

실제 브라우저 선택부터 stdio MCP 적용, 3개 재사용 인스턴스 검증과 undo까지의 기록은 [mcp-browser-roundtrip.json](./reports/performance/mcp-browser-roundtrip.json)에 있다.

외부 corpus 수치는 **현재 allowlist가 관찰된 토큰 중 몇 개에 후보를 제공하는지**를 나타낸다. 실제 편집 성공률이나 패치 품질을 뜻하지 않는다. `npm run eval:product-ab`는 독립 사용자의 동일 작업 Intent Layer/프롬프트 조건을 쌍으로 집계한다. 현재 [product-ab-evaluation.json](./reports/performance/product-ab-evaluation.json)은 표본 0의 `collecting` 상태이며, 5개 저장소·20개 paired task 전에는 제품 우위를 주장하지 않는다.

[외부 호환성 파일럿](./reports/performance/external-compatibility-pilot.json)은 고정된 공개 저장소 5개에서 193개 파일, 1,706개 binding, 가중 직접 편집 binding coverage 84.58%와 pnpm 브라우저 apply/undo 1회를 기록한다. 저자가 직접 실행했고 prompt-only 쌍이 없으므로 이 수치는 독립 A/B에 포함하지 않는다. 파일럿에서 발견한 Vite runtime artifact 재로딩과 pnpm 로컬 패키지 캐시 문제는 각각 회귀 테스트와 강제 재설치 gate로 고정했다.

## CLI

GUI가 기본이며 CLI는 진단, CI와 복구용이다.

```bash
npm run intent:doctor
npx intent-layer init
npm run intent:check -- fixtures/corpus src/App.tsx
npm run intent:scan -- fixtures/corpus src/App.tsx --write-graph
node dist/cli.js --help
```

패키지는 `dist/cli.js`, `dist/vite.js`, `dist/mcp.js`, `intent-layer/vite` type declaration과 browser virtual module bundle을 배포한다. 실행 시 raw TypeScript나 `tsx`에 의존하지 않는다.

## 문서

- [PRODUCT_PLAN_KR.md](./PRODUCT_PLAN_KR.md): 제품 범위와 의사결정
- [DEMO_WALKTHROUGH_KR.md](./DEMO_WALKTHROUGH_KR.md): 재현 가능한 데모
- [FAILURE_MODES_KR.md](./FAILURE_MODES_KR.md): 실패와 복구
- 영어 문서는 같은 이름의 `_EN.md` 또는 [README.md](./README.md)에 있다.

과거 spike, launch, handoff 상태 문서는 Git 이력으로 보존하며 활성 문서로 중복 유지하지 않는다.

## 현재 비범위

- Next.js 정식 adapter
- 특정 렌더 인스턴스만 바꾸기 위한 자동 prop/variant refactor
- `cloneElement`의 모호한 provenance를 직접 편집
- styled-components, Emotion, 전체 CSS cascade 편집
- 동적 Tailwind config 실행 또는 복합 arbitrary value의 일반 편집
- 외부 npm package나 `node_modules` 직접 수정
- Figma import
- 자연어 레이아웃 refactor를 결정론적 패치처럼 적용하는 기능

지원하지 않는 표현은 조용히 잘못 고치지 않고 read-only 또는 `handoff-required`로 내려간다.

## 라이선스

[MIT](./LICENSE)
