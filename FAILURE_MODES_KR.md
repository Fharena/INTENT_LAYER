# INTENT_LAYER Failure Mode Guide

이 문서는 MVP에서 일부러 안전하게 실패해야 하는 상황과 대응법을 정리한다.

## 1. `doctor`가 `vite-plugin` fail을 반환함

증상:

```text
intentLayer() was not found in the Vite config.
```

원인:

- `vite.config.*`에 `intentLayer()`가 없다.
- `intent-layer/vite` import가 없다.
- plugin이 `plugins` 배열 밖에 있다.

해결:

```bash
npx intent-layer init
```

`init`이 `unsupported-config`를 반환하면 plugins 값이 함수 계산, 변수 참조 등 정적으로 고칠 수 없는 형태다. 이 경우 파일은 바뀌지 않는다. 수동으로 `intentLayer()`를 React plugin보다 앞에 넣고 다시 확인한다.

확인:

```bash
npx intent-layer doctor
```

이번 평가 harness는 이 실패 케이스를 별도 fixture로 검증한다.

## 2. `.intent/graph.intent.json` warn

증상:

```text
Intent graph file does not exist yet.
```

원인:

- 아직 Vite transform이 실행되지 않았다.
- 아직 `scan --write-graph`를 실행하지 않았다.

해결:

```bash
npx intent-layer scan src --write-graph
```

또는 dev server를 실행한 뒤 대상 TSX module을 로드한다.

```bash
npx intent-layer dev
```

## 3. `source-files` fail

증상:

```text
No JSX/TSX source files found
```

원인:

- 기본 입력 `src`에 `.tsx` / `.jsx` 파일이 없다.
- 앱 소스가 `app`, `components`, `packages/ui/src` 같은 다른 폴더에 있다.

해결:

```bash
npx intent-layer doctor app components packages/ui/src
npx intent-layer scan app components packages/ui/src --write-graph
```

## 4. `check` coverage fail

증상:

```text
supportedDirectCoverage below threshold
```

원인:

- 동적 `className` 비율이 높다.
- variant 함수, 변수 참조, template expression이 많다.

해결:

- coverage threshold를 낮추기 전에 unsupported reason distribution을 확인한다.
- 직접 patch가 어려운 binding은 agent handoff 대상으로 둔다.
- 단순 `cn()` / `clsx()` literal segment로 옮길 수 있는 부분만 정리한다.

```bash
npx intent-layer check src --min-supported-direct 0.5
```

## 5. Patch가 `source-hash-mismatch`로 거부됨

증상:

```text
source-hash-mismatch
```

원인:

- preview 이후 source가 바뀌었다.
- graph가 현재 source와 drift 상태다.

해결:

```bash
npx intent-layer scan src --write-graph
```

그 다음 다시 preview/apply한다.

## 6. Patch가 old token mismatch로 거부됨

증상:

```text
old token was not found at the expected range
```

원인:

- source range는 맞지만 token이 이미 바뀌었다.
- formatter나 다른 agent가 같은 영역을 수정했다.

해결:

- 현재 source를 다시 scan한다.
- 이전 operation을 강제로 적용하지 않는다.
- 필요하면 agent handoff task를 생성한다.

## 7. `className`이 read-only로 표시됨

증상:

```text
className: read-only
unsupported: variable-reference | variant-function | template-expression
```

원인:

- 직접 range patch가 안전하지 않은 표현식이다.

해결:

- 직접 patch 대신 agent handoff를 사용한다.
- task/result artifact에서 related source snapshot과 semantic diff를 확인한다.

## 8. External npm package source는 직접 patch하지 않음

증상:

```text
External Import Reference
```

원인:

- `className`이 외부 npm package의 variant/helper에서 왔다.

해결:

- `node_modules`를 직접 수정하지 않는다.
- local wrapper, local override, 또는 앱 쪽 className 추가로 해결한다.

## 9. 독립 외부 corpus evidence가 아님

증상:

```text
mvpEvidence.usableAsMvpEvidence = false
sourceKind = local-smoke-fixture
```

의미:

- importer/report/gate loop는 동작하지만, 시장성 또는 MVP coverage 증거로 쓰면 안 된다.

해결:

```bash
npm run import:external-corpus -- <independent-react-tailwind-project-or-samples>
```

독립 수집 샘플 50-100개로 다시 측정한다.

## 10. Undo가 `undo-not-latest` 또는 `revert-source-hash-mismatch`로 거부됨

`undo-not-latest`는 더 최근의 pending patch가 있다는 뜻이다. 최근 작업부터 순서대로 되돌린다.

`revert-source-hash-mismatch`는 patch 적용 이후 파일이 바뀌었다는 뜻이다. Intent Layer는 저장된 offset을 신뢰하지 않고 파일을 그대로 보존하며 `.intent/conflicts/`에 기록한다. 현재 소스를 검토한 뒤 새로 요소를 선택하거나 pending undo를 의도적으로 discard한다.

## 11. 미리보기, 적용 또는 되돌리기가 요청 오류로 실패함

패널은 dev server 종료, 잘못된 HTTP 응답, JSON 파싱 실패를 상태 영역에 표시한다. Vite dev server가 실행 중인지 확인하고 새로고침한다. 오류 중에는 버튼을 잠시 비활성화하며, 실패한 요청만으로 소스 파일을 수정하지 않는다.

- `unsafe-intent-request`: source 변경 요청이 loopback 주소가 아니거나 overlay 세션 토큰이 없다. 편집할 브라우저는 dev server가 실행되는 같은 컴퓨터에서 `127.0.0.1` 또는 `localhost`로 연다. LAN 편집을 우회해서 허용하지 않는다.

## 12. MCP 편집 또는 검증이 거부됨

- `preview-expired`: 5분이 지난 preview다. `intent_preview_edit`부터 다시 수행한다.
- `source-hash-mismatch`: preview 뒤 파일이 바뀌었다. 현재 요소를 다시 inspect한다.
- `file-locked`: GUI나 다른 AI 작업이 같은 파일을 수정 중이다. 해당 작업이 끝난 뒤 새 preview를 만든다.
- operation journal lock은 서로 다른 파일을 고치는 provider도 짧게 직렬화한다. 5초 이상 계속 잠기면 중단된 Intent Layer 프로세스와 `.intent/runtime/locks/` 상태를 확인한다.
- `idempotency-key-conflict`: 다른 preview에 이미 쓴 key다. 새 작업 key를 사용한다.
- `runtime: unavailable`: source는 검증됐지만 Vite 또는 브라우저가 연결되지 않았다. 시각 검증 성공으로 해석하지 않는다.
- `runtime: drifted`: source는 바뀌었지만 일부 렌더 인스턴스에 새 token이 없다. HMR 상태와 동적 className 조건을 확인한다.

## 13. DOM 미리보기가 원복되거나 조건부 토큰이 보이지 않음

후보 선택 직후의 색상/간격 변경은 source patch가 아니라 임시 DOM 미리보기다. 다른 요소 선택, 패널 재렌더, Grid/Flex 작업, apply 또는 undo를 시작하면 자동으로 원복된다. 서버 `미리보기`가 성공하기 전에는 `적용` 버튼도 잠겨 있다.

`cn()`/`clsx()` literal 조건 분기에서는 클릭한 DOM 인스턴스에 실제로 없는 token을 숨긴다. 다른 분기를 고치려면 앱 상태를 그 분기로 바꾼 뒤 요소를 다시 선택한다. 미리보기 중 React가 같은 요소의 `class`를 새로 렌더했다면 원복 동작은 오래된 snapshot으로 덮지 않고 React의 최신 결과를 보존한다. 이 경우 요소를 다시 선택해 현재 source/runtime 상태에서 시작한다.

Codex 또는 Claude에 도구가 보이지 않으면 패널 설정의 AI 연결 상태와 프로젝트 `.codex/config.toml`/`.mcp.json`을 확인한 뒤 새 세션을 시작한다. 설정이 있는데도 `serverReady`가 false면 package 설치 또는 `dist/mcp.js` 빌드가 빠진 상태다. Intent Layer는 전역 provider 설정을 수정하지 않는다.

## 14. Literal text 편집기가 보이지 않거나 거부됨

- `text-not-literal`: 자식이 하나의 JSX text가 아니거나 표현식/중첩 element가 있다. 구조 변경으로 간주해 직접 편집하지 않는다.
- `invalid-literal-text`: 새 값이 비어 있거나 500자를 넘거나, 앞뒤 공백·줄바꿈·`<>{}&`가 있다. JSX 문법이나 entity 의미를 바꾸지 않는 한 줄 plain text만 허용한다.
- `old-text-mismatch` 또는 `source-hash-mismatch`: 선택 뒤 source가 바뀌었다. 파일을 쓰지 않으므로 요소를 다시 선택해 preview한다.

## 15. Grid 배치가 read-only로 표시됨

- `repeated-grid-binding`: `.map()` 등으로 여러 직계 자식이 같은 source id를 공유한다. 각 인스턴스를 다르게 배치하려면 prop/variant 구조로 바꿔야 하므로 Agent 전달을 사용한다.
- `cross-file-grid`: 부모와 직계 자식 구현이 다른 파일에 있다. 부분 적용을 피하기 위해 첫 버전은 같은 파일만 그룹 편집한다.
- `dynamic-grid-classname`: 부모 또는 자식이 `cn()` 조건, 변수, `cva`, template expression을 사용한다. 정적 literal로 단순화할 수 없으면 Agent 전달을 사용한다.
- `multiline-grid-classname` 또는 `noncanonical-grid-classname`: 줄바꿈이나 특수 공백을 보존하기 위해 첫 버전은 직접 편집하지 않는다.
- `unbound-grid-child`: 직계 DOM 자식 중 source binding이 없는 요소가 있다. 해당 요소에 정적 className을 두고 다시 선택한다.
- `repeated-grid-binding`, `cross-file-grid`, `dynamic-grid-classname`은 실패가 아니라 명시적인 지원 경계다. 이 상태에서 일부 자식만 직접 적용하지 않는다.
- `grid-placement-overflow`: 시작 열과 span이 현재 열 수를 넘는다. placement strip 안쪽으로 범위를 다시 고른다.
- `grid-row-placement-overflow`: 시작 행과 span이 현재 행 수를 넘는다. 행 수 또는 자식의 행 범위를 조정한다.
- `unsupported-breakpoint`: project screen을 숫자 min-width 순서로 증명할 수 없다. `raw`, max-only, CSS variable, 동적 config screen은 직접 편집 탭에 넣지 않는다.
- `unsupported-grid-token`: arbitrary template에 `minmax()`, CSS 변수, named line 또는 양수가 아닌 track이 있다. 현재 slider는 `grid-cols-[1.2fr_0.8fr]`처럼 양수 `fr`만 직접 편집한다.
- `planned-range-mismatch` 또는 `source-hash-mismatch`: preview 뒤 파일이 바뀌었다. source write는 0건이며 새 preview를 만든다.

## 16. Flex 배치가 read-only로 표시됨

- `repeated-flex-binding`, `unbound-flex-child`: 직계 자식이 source id를 공유하거나 binding이 없다. 인스턴스별 배치는 prop/variant refactor가 필요하다.
- `cross-file-flex`, `dynamic-flex-classname`, `multiline-flex-classname`, `noncanonical-flex-classname`: 그룹 전체를 같은 파일의 정적 단일행 className으로 검증할 수 없다. 일부만 적용하지 않는다.
- `not-static-flex`: 부모에 base `flex` 또는 `inline-flex` token이 없다. responsive에서만 Flex가 되는 container는 현재 직접 편집하지 않는다.
- `unsupported-flex-token`: `gap-x`/`gap-y`, unknown justify/items/self utility처럼 effective layout을 안전하게 모델링할 수 없는 token이 있다.
- `invalid-flex-gap`: 요청한 gap이 표준 또는 정적으로 읽은 project candidate가 아니다.
- Flex composer는 `order`와 DOM drag reorder를 제공하지 않는다. 시각 순서와 keyboard/screen-reader 순서가 달라지는 변경은 Agent refactor로 검토한다.

## 17. Agent task가 오래 `claimed` 상태로 남음

레거시 Markdown 큐는 기본 비활성화다. HTTP에서 `legacy-agent-disabled` 또는 404가 나오면 패널 설정의 `기존 Agent 큐 (고급 호환성)`을 명시적으로 켠다. 일반 Codex/Claude 편집은 로컬 MCP를 우선한다.

중단된 provider의 task를 queue로 돌린다.

```bash
npm run intent:agent-queue -- --release --task .intent/agent/task_x.md
```

오래된 완료/실패 아티팩트는 명시적으로 정리한다.

```bash
npm run intent:agent-queue -- --prune-days 30
```

prune은 terminal task만 지우며 queued/running task는 지우지 않는다.

## 18. 프로젝트 색상, 간격 또는 breakpoint 후보가 보이지 않음

candidate provider는 `tailwind.config.{js,ts,cjs,mjs,cts,mts}`의 정적 object와 `src/index.css`, `src/styles.css`, `src/globals.css`, `app/globals.css` 등 알려진 CSS 진입점만 읽는다. config를 실행하지 않는다. 함수로 계산한 theme, 외부 import로만 정의된 scale 또는 다른 위치의 CSS는 자동 후보가 아닐 수 있다. breakpoint는 길이로 환산 가능한 string/object `min`과 v4 `--breakpoint-*`만 순서화하며, `raw`, max-only, `var()` 값은 제외한다. 표준 후보는 계속 표시되며 source patch 안전성에는 영향이 없다.

## 19. Codex가 다른 브라우저 탭의 선택을 읽음

각 Vite session의 선택은 따로 보존되지만 `intent://selection/current`는 살아 있는 session 중 가장 최근 선택을 반환한다. 응답의 `sessionId`, `selectedAt`, `freshUntil`, `route`를 확인한다. 의도한 탭에서 요소를 다시 선택하면 current가 갱신된다. 만료된 선택을 자동으로 성공 컨텍스트로 간주하지 않는다.

## 20. `.intent` 파일이 바뀔 때 Vite가 반복해서 reload됨

현재 plugin은 **해당 Vite project root 아래의** `.intent/**`와 `.intent-agent-queue.json*`만 watcher에서 자동 제외한다. 반복 reload가 보이면 설치된 `intent-layer`가 최신 빌드인지 먼저 확인하고 dev server를 완전히 재시작한다. 사용자 `server.watch.ignored` 규칙은 합쳐져야 하며, 다른 plugin이 `ignored`를 나중에 덮어쓰는 경우 그 plugin 설정에도 project-root 기준의 같은 두 패턴을 추가한다. 전역 `**/.intent/**`는 `.intent/tmp` 아래 테스트 프로젝트 전체까지 무시하므로 사용하지 않는다. production build에는 이 watcher 설정이나 overlay 계측이 들어가지 않는다.
