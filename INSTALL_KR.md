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

브라우저에서 local URL을 열면 dev mode에서 Intent Layer 패널이 우하단에 자동으로 뜬다.
패널은 어두운 glass UI로 표시되며, Next/Vite dev tool처럼 하단 fixed 요소와 겹치면 가능한 범위에서 자동으로 위로 피한다.

기본 GUI 흐름:

```text
Pick element -> UI 요소 선택 -> Preview -> Apply -> Undo last
Minimize / Expand로 페이지를 벗어나지 않고 패널을 접거나 펼친다
```

Agent handoff GUI:

```text
Agent handoff -> Create task -> Plan Codex / Plan Claude
Agent handoff -> Run Codex / Run Claude
```

`Plan`은 `.intent/agent/task_*.md`에서 실행 명령만 만든다. 외부 process는 시작하지 않는다. `Run`은 같은 계획을 사용하지만, 대상 프로젝트에 `INTENT_LAYER_AGENT_RUN=1`이 설정되어 있을 때만 실제 spawn한다.

현재 기본 command plan:

```bash
codex exec --sandbox workspace-write "Read .intent/agent/task_x.md and implement the requested change..."
claude -p "Read .intent/agent/task_x.md and implement the requested change..."
```

필요하면 실행 파일 이름을 override할 수 있다.

```bash
INTENT_LAYER_CODEX_COMMAND=/path/to/codex
INTENT_LAYER_CLAUDE_COMMAND=/path/to/claude
```

CLI 대체 경로:

```bash
npx intent-layer agent-launch --provider codex --id <intent-id> --change "Describe the desired change"
npx intent-layer agent-launch --provider claude --task .intent/agent/task_x.md
```

CLI 명령은 setup, 진단, 반복 검증용이다. 일상적인 시각 편집은 브라우저 패널에서 시작하는 것이 기본 UX다.

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
doctor: 10 checks, 10 pass, 0 warn, 0 fail, 2.694ms
missing-plugin doctor fixture: exit 1, fail 1, guidance 3, pass
installed Vite apply refresh: 194.581ms
installed Vite revert refresh: 127.724ms
installed 3-file graph refresh: 123.273ms
package smoke: pass
```

설치형 Vite dev server refresh smoke target은 OS watcher와 temp install 환경의 흔들림을 고려해 2500ms로 둔다. 실제 브라우저 UX gate는 별도로 click-to-panel 100ms, preview/apply 50ms, revert 100ms 기준으로 본다.

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
