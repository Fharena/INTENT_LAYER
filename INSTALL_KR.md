# INTENT_LAYER 설치 가이드

이 문서는 현재 MVP package surface 기준의 설치 절차다.

현재 상태:

- npm registry 배포 전이다.
- 검증된 설치 방식은 이 저장소에서 만든 local tarball을 대상 React/Vite/Tailwind 프로젝트에 설치하는 방식이다.
- `npm run eval`은 tarball 생성, 임시 프로젝트 설치, `intent-layer --help`, `intent-layer/vite` import, Vite dev server preview/apply까지 smoke로 검증한다.

## 1. 대상 프로젝트 조건

지원 우선순위:

- Node.js 18 이상
- React
- Vite
- TypeScript / TSX
- Tailwind CSS
- literal `className`
- simple/partial `cn()` / `clsx()`

아직 초반 MVP 범위 밖:

- Next.js 정식 adapter
- styled-components / Emotion
- 전체 CSS cascade 편집
- Figma import
- external npm package source 직접 patch

## 2. Local Tarball 설치

INTENT_LAYER 저장소에서 package tarball을 만든다.

```bash
npm install
npm run typecheck
npm pack
```

대상 프로젝트에서 생성된 tarball을 설치한다.

```bash
npm install /absolute/path/to/intent-layer-0.0.1.tgz
```

registry 배포 후에는 다음 형태를 목표로 한다.

```bash
npm install -D intent-layer
```

## 3. Vite 설정

대상 프로젝트의 `vite.config.ts`에 plugin을 등록한다.

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { intentLayer } from "intent-layer/vite";

export default defineConfig({
  plugins: [intentLayer(), react()]
});
```

`intent-layer/vite`는 현재 검증된 package export다.

## 4. Intent Workspace 초기화

대상 프로젝트 루트에서 실행한다.

```bash
npx intent-layer init
npx intent-layer doctor
```

`init`은 `.intent/` 폴더와 lightweight schema 파일을 만든다.

`doctor`는 다음을 JSON으로 확인한다.

- `package.json`
- `intent-layer` package
- Vite dependency
- React dependency
- Tailwind config
- Vite config
- `intentLayer()` plugin 등록
- JSX/TSX source files
- `.intent` workspace
- `.intent/graph.intent.json`

처음 실행 시 graph가 없으면 warn이 나올 수 있다. dev server를 실행하거나 scan을 돌리면 graph가 생긴다.

```bash
npx intent-layer scan src --write-graph
npx intent-layer doctor
```

## 5. 개발 서버 실행

기존 Vite dev server 대신 wrapper를 쓸 수 있다.

```bash
npx intent-layer dev
```

실행 계획만 확인하려면:

```bash
npx intent-layer dev --dry-run
```

기본값:

```text
host: 127.0.0.1
port: 5173
```

## 6. 출시 전 Smoke Check

대상 프로젝트에서 최소 확인:

```bash
npx intent-layer doctor
npx intent-layer check src --min-supported-direct 0.5 --max-file-transform-ms 20
```

선택적으로 graph를 파일로 쓴다.

```bash
npx intent-layer scan src --write-graph
```

## 7. 현재 측정값

최근 `npm run eval` 기준:

```text
doctor: 10 checks, 10 pass, 0 warn, 0 fail, 2.081ms
missing-plugin doctor fixture: exit 1, fail 1, guidance 3, pass
installed Vite apply refresh: 42.976ms
installed Vite revert refresh: 45.163ms
installed 3-file graph refresh: 125.897ms
package smoke: pass
```

현재 독립 외부 baseline coverage:

```text
shadcn-ui/ui: 100 files, 915 className occurrences, supported direct editable coverage 77.50%
sadmann7/skateshop: 100 files, 866 className occurrences, supported direct editable coverage 79.46%
mckaywrigley/chatbot-ui: 100 files, 601 className occurrences, supported direct editable coverage 66.91%
```

package 수치는 local smoke fixture 기준이다. 외부 coverage report는 `reports/performance/` 아래 copied-file corpus 측정값이며, third-party source는 commit하지 않는다.

## 8. 안전 경계

직접 patch는 다음 조건에서만 수행한다.

- source binding을 찾았다.
- confidence가 충분하다.
- old token이 현재 source에 그대로 있다.
- range patch로 충분하다.
- patch 후 다시 scan/diff를 남길 수 있다.

조건을 만족하지 않으면 직접 patch 대신 `.intent/agent/task_*.md` handoff를 만든다.

문제가 생기면 [FAILURE_MODES_KR.md](./FAILURE_MODES_KR.md)를 먼저 확인한다.

사용자에게 보여줄 데모 흐름은 [DEMO_WALKTHROUGH_KR.md](./DEMO_WALKTHROUGH_KR.md)를 따른다.
