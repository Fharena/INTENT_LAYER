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
