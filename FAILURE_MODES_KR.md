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

```ts
import { intentLayer } from "intent-layer/vite";

export default defineConfig({
  plugins: [react(), intentLayer()]
});
```

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

Codex 또는 Claude에 도구가 보이지 않으면 패널 설정의 AI 연결 상태와 프로젝트 `.codex/config.toml`/`.mcp.json`을 확인한 뒤 새 세션을 시작한다. 설정이 있는데도 `serverReady`가 false면 package 설치 또는 `dist/mcp.js` 빌드가 빠진 상태다. Intent Layer는 전역 provider 설정을 수정하지 않는다.

## 13. Grid 배치가 read-only로 표시됨

- `repeated-grid-binding`: `.map()` 등으로 여러 직계 자식이 같은 source id를 공유한다. 각 인스턴스를 다르게 배치하려면 prop/variant 구조로 바꿔야 하므로 Agent 전달을 사용한다.
- `cross-file-grid`: 부모와 직계 자식 구현이 다른 파일에 있다. 부분 적용을 피하기 위해 첫 버전은 같은 파일만 그룹 편집한다.
- `dynamic-grid-classname`: 부모 또는 자식이 `cn()` 조건, 변수, `cva`, template expression을 사용한다. 정적 literal로 단순화할 수 없으면 Agent 전달을 사용한다.
- `multiline-grid-classname` 또는 `noncanonical-grid-classname`: 줄바꿈이나 특수 공백을 보존하기 위해 첫 버전은 직접 편집하지 않는다.
- `unbound-grid-child`: 직계 DOM 자식 중 source binding이 없는 요소가 있다. 해당 요소에 정적 className을 두고 다시 선택한다.
- `repeated-grid-binding`, `cross-file-grid`, `dynamic-grid-classname`은 실패가 아니라 명시적인 지원 경계다. 이 상태에서 일부 자식만 직접 적용하지 않는다.
- `grid-placement-overflow`: 시작 열과 span이 현재 열 수를 넘는다. placement strip 안쪽으로 범위를 다시 고른다.
- `planned-range-mismatch` 또는 `source-hash-mismatch`: preview 뒤 파일이 바뀌었다. source write는 0건이며 새 preview를 만든다.

## 14. Agent task가 오래 `claimed` 상태로 남음

중단된 provider의 task를 queue로 돌린다.

```bash
npm run intent:agent-queue -- --release --task .intent/agent/task_x.md
```

오래된 완료/실패 아티팩트는 명시적으로 정리한다.

```bash
npm run intent:agent-queue -- --prune-days 30
```

prune은 terminal task만 지우며 queued/running task는 지우지 않는다.
