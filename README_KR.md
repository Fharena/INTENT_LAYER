# INTENT_LAYER

[English](./README.md)

INTENT_LAYER는 React/Tailwind 화면을 브라우저에서 클릭하고, 해당 JSX 소스와 Tailwind 토큰을 확인한 뒤 작은 변경을 결정론적으로 적용하는 개발 도구다.

현재 제품 판단은 **동작하는 alpha**다. 사람은 브라우저 패널을, Codex와 Claude는 같은 로컬 MCP 도구를 사용한다. 두 경로 모두 동일한 source binding, 최소 패치, hash 검증과 undo를 거치며, 모든 React 표현식이나 Tailwind 설정을 편집하는 범용 도구는 아니다.

## 핵심 흐름

```text
화면 요소 선택
  -> 소스 파일, 컴포넌트, source hash 확인
  -> 편집 가능한 Tailwind 토큰 선택
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
4. 토큰 후보를 고르고 `미리보기`, `적용` 순서로 확인한다.
5. 문제가 있으면 `되돌리기`를 누른다.

선택한 요소가 CSS Grid 안에 있으면 가장 가까운 grid 조상의 `Grid 배치`가 자동으로 열린다. breakpoint를 고르고 각 자식의 열 범위를 드래그한 뒤, 그룹 diff를 미리보고 한 번에 적용하거나 되돌릴 수 있다.

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

## 직접 편집 범위

현재 직접 편집은 JSX의 정적 `className`, `cn()`/`clsx()` 안의 문자열 리터럴과 intrinsic `React.createElement()`을 대상으로 한다.

- spacing: padding, margin, gap의 표준 Tailwind scale
- sizing: width, height, min/max, size
- layout: display, grid columns, flex, align/justify, numeric `col-start`/`col-span`
- radius와 typography 크기/굵기/line-height
- 표준 Tailwind color family와 프로젝트 `tailwind.config.*`, Tailwind v4 `@theme`, 보수적으로 식별한 CSS 변수 후보
- shadow, opacity, ring width, transition

후보가 자기 자신 하나뿐인 토큰은 편집 가능으로 표시하지 않는다. 프로젝트 theme는 실행하지 않고 정적 AST/CSS만 읽으며 프로젝트 후보를 기본 palette보다 먼저 보여준다. 해석할 수 없는 동적 config, `cva`, runtime 변수, property access, template expression은 inspect 가능하지만 직접 패치하지 않는다.

Grid Layout Composer는 같은 TSX 파일의 정적 `className`을 가진 기존 grid와 직계 자식만 직접 편집한다. base/sm/md/lg에서 1~12열의 `grid-cols`, `col-start`, `col-span`을 그룹 작업으로 추가·교체·제거하며, `grid-cols-[1.2fr_0.8fr]` 같은 단순 양수 `fr` template은 track 비율 slider로 조정한다. 반복된 source id, 교차 파일 자식, 동적 className, 복합 `minmax()` template, DOM 순서 변경은 안전하게 read-only로 내린다.

## 안전 규칙

- JSX는 TypeScript AST 한 경로로 분석한다. 문자열이나 주석 속 JSX 모양 텍스트는 instrumentation하지 않는다.
- `data-intent-id`는 Vite transform 결과에만 넣고 디스크 소스에는 쓰지 않는다.
- apply 전 binding source hash와 원래 토큰을 모두 확인한다.
- preview와 apply 사이에 파일이 바뀌어도 다시 거부한다.
- undo는 적용 후 전체 source hash가 맞는 **최신 pending patch**만 처리한다.
- 여러 Codex/Claude 프로세스의 apply와 undo는 프로젝트 operation lock으로 직렬화하며 저널은 atomic write한다.
- 브라우저 선택은 Vite session별 파일로 보존하고 현재 선택에 `sessionId`와 유효시간을 포함한다. 여러 Vite 서버의 graph publish는 각 서버가 소유한 파일만 교체하고 나머지 파일을 병합한다.
- drift가 있으면 파일 대신 `.intent/conflicts/`에 conflict artifact를 남긴다.
- patch는 전체 파일 codegen이 아니라 원래 source range만 교체한다.
- Grid 그룹 편집은 모든 className 원문과 source hash를 먼저 검증하고 같은 파일을 한 번만 쓴다. undo는 적용 후 range 전체를 검증한 뒤 그룹을 byte-for-byte 복원한다.
- source를 바꾸는 Vite HTTP 요청은 loopback 연결과 overlay 세션 토큰을 모두 요구한다. LAN 주소로 연 preview는 읽을 수 있어도 편집은 거부된다.

## Codex와 Claude에서 사용

설정에서 provider 연결을 켠 뒤 Codex 또는 Claude를 새로 시작하면 다음 로컬 MCP 도구를 사용할 수 있다.

- `intent_find_elements`, `intent_inspect_element`
- `intent_preview_edit`, `intent_apply_edit`
- `intent_verify_edit`, `intent_undo_edit`

브라우저에서 선택한 요소는 `intent://selection/current`로 공유된다. AI는 source offset이나 raw patch를 보내지 않고 의미 속성과 후보 값만 요청한다. apply는 expiring preview, source hash, 파일 잠금과 idempotency key를 다시 검증한다. 브라우저가 연결돼 있으면 HMR 뒤 모든 렌더 인스턴스에 새 class token이 존재하는지도 확인한다.

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
npm run test:e2e
npm run build
npm run test:mcp-package
```

출시 전 전체 검증:

```bash
npm run eval
```

`npm run eval`은 tarball 설치, 설치된 CLI와 Vite export, 실제 Vite HTTP preview/apply/revert, multi-file graph refresh, Grid 그룹 apply/undo, 외부 corpus와 56개 성능·안전 gate를 실행한다. `test:e2e`는 Lumina 사이트에서 설정, 선택, 비대칭 Grid 비율 변경, HMR, byte-for-byte undo와 모바일 panel을 Chromium으로 검증한다. 하나라도 실패하면 exit code 1로 끝난다. 상세 결과는 [spike-evaluation.json](./reports/performance/spike-evaluation.json)에 기록된다.

`npm run benchmark:mcp`는 inspect, preview, apply, undo와 in-memory MCP 호출의 로컬 기계 지연을 [mcp-alpha-evaluation.json](./reports/performance/mcp-alpha-evaluation.json)에 기록한다. 이 수치는 Agent 작업 성공률이나 제품 가치를 증명하지 않는다.

실제 브라우저 선택부터 stdio MCP 적용, 3개 재사용 인스턴스 검증과 undo까지의 기록은 [mcp-browser-roundtrip.json](./reports/performance/mcp-browser-roundtrip.json)에 있다.

외부 corpus 수치는 **현재 allowlist가 관찰된 토큰 중 몇 개에 후보를 제공하는지**를 나타낸다. 실제 편집 성공률이나 패치 품질을 뜻하지 않는다. `npm run eval:product-ab`는 독립 사용자의 동일 작업 Intent Layer/프롬프트 조건을 쌍으로 집계한다. 현재 [product-ab-evaluation.json](./reports/performance/product-ab-evaluation.json)은 표본 0의 `collecting` 상태이며, 5개 저장소·20개 paired task 전에는 제품 우위를 주장하지 않는다.

## CLI

GUI가 기본이며 CLI는 진단, CI와 복구용이다.

```bash
npm run intent:doctor
npx intent-layer init
npm run intent:check -- fixtures/corpus src/App.tsx
npm run intent:scan -- fixtures/corpus src/App.tsx --write-graph
node dist/cli.js --help
```

패키지는 `dist/cli.js`, `dist/vite.js`, `dist/mcp.js`와 browser virtual module bundle을 배포한다. 실행 시 raw TypeScript나 `tsx`에 의존하지 않는다.

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
