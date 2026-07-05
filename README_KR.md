# INTENT_LAYER

INTENT_LAYER는 AI가 만든 React/Tailwind UI를 사람이 브라우저에서 직접 클릭하고, 소스 위치로 되돌려 안전하게 수정하기 위한 frontend intent layer다.

현재 상태:

> React/Vite/Tailwind click-to-patch MVP 후보. 구조화된 agent handoff/result artifact, 공통 Agent queue, Codex skill/Claude hook 자동 설정, 수치 기반 성능 리포트를 포함한다.

## 핵심 정의

제품의 목표는 단순 UI 수정에서 LLM 호출을 줄이고, 결정론적 코드 조작으로 빠르게 고치는 것이다.

지원하는 흐름:

- 브라우저에서 UI 요소를 클릭한다.
- 클릭한 DOM을 source binding으로 연결한다.
- Tailwind token intent를 확인한다.
- 단순 변경은 range patch로 preview/apply한다.
- 복잡하거나 불확실한 변경은 agent handoff task로 보내고 `.intent-agent-queue.json`에 올린다.
- 적용 결과는 operation log와 intent diff로 검토한다.

## 문서

- `PRODUCT_PLAN_KR.md` - 상세 제품 기획서
- `PRODUCT_PLAN_EN.md` - 영어 제품 기획서
- `LAUNCH_MVP_KR.md` - MVP 출시 계획
- `LAUNCH_MVP_EN.md` - 영어 MVP 출시 계획
- `TECHNICAL_SPIKE_KR.md` - 기술 스파이크 기록
- `TECHNICAL_SPIKE_EN.md` - 영어 기술 스파이크 기록
- `PERFORMANCE_EVALUATION_KR.md` - 수치 기반 성능 평가
- `PERFORMANCE_EVALUATION_EN.md` - 영어 성능 평가
- `DEMO_WALKTHROUGH_KR.md` - MVP 데모 절차
- `DEMO_WALKTHROUGH_EN.md` - 영어 MVP 데모 절차
- `INSTALL_KR.md` - 설치 가이드
- `INSTALL_EN.md` - 영어 설치 가이드
- `ONBOARDING_KR.md` - GUI-first 온보딩 흐름
- `ONBOARDING_EN.md` - 영어 GUI-first 온보딩 흐름
- `FAILURE_MODES_KR.md` - 실패 모드와 대응
- `FAILURE_MODES_EN.md` - 영어 실패 모드 가이드
- `MVP_HANDOFF_KR.md` - MVP 후보 상태와 handoff
- `MVP_HANDOFF_EN.md` - 영어 MVP handoff
- `AGENTS.md` - 이 저장소에서 작업하는 AI coding agent 지침
- `codex.md` - Codex 작업 메모와 사용자 선호

## 빠른 실행

의존성을 설치한다.

```bash
npm install
```

데모 앱을 실행한다.

```bash
npm run dev
```

브라우저 첫 설정:

```text
Vite dev URL 열기 -> Intent Layer 설정 -> 언어/패널/Agent queue 설정 -> 설정 완료
```

설정 화면은 브라우저 패널에서 `.intent/` schema, `.intent/settings.json`, `.intent-agent-queue.json`, Codex project skill, Claude FileChanged hook을 만든다. 이후에도 `설정` 버튼에서 언어, 패널 위치/밀도, 시작 시 접기, setup 자동 열기, Agent queue 자동 설정, Codex/Claude command를 바꿀 수 있다. CLI는 진단과 반복 검증용으로 남기지만, 일상적인 시각 편집의 기본 흐름은 GUI-first다.

검증 명령:

```bash
npm run typecheck
npm run intent:doctor
npm run intent:check -- fixtures/corpus src/App.tsx
npm run eval
npm run build
```

## CLI 사용

로컬 CLI는 다음처럼 직접 실행할 수 있다.

```bash
npm run intent:init
npm run intent:doctor
npm run intent:dev -- --dry-run
npx tsx src/intent/cli.ts --help
node bin/intent-layer.cjs --help
npm run intent:scan -- fixtures/corpus src/App.tsx
npx tsx src/intent/cli.ts check fixtures/corpus src/App.tsx --min-supported-direct 0.5
npx tsx src/intent/cli.ts scan fixtures/corpus src/App.tsx --write-graph
npx tsx src/intent/cli.ts apply --op .intent/operations/example.intent-op.json
npx tsx src/intent/cli.ts diff --diff .intent/diffs/example.intent-diff.yml
npx tsx src/intent/cli.ts agent-context ProductGrid
npx tsx src/intent/cli.ts agent-task --id <intent-id> --change "Describe the desired change"
npx tsx src/intent/cli.ts agent-queue
npx tsx src/intent/cli.ts agent-claim --provider codex --task .intent/agent/task_x.md
npx tsx src/intent/cli.ts agent-launch --provider codex --id <intent-id> --change "Describe the desired change"
npx tsx src/intent/cli.ts agent-launch --provider claude --task .intent/agent/task_x.md
npx tsx src/intent/cli.ts agent-result --id <intent-id> --task .intent/agent/task_x.md --summary "Describe the result"
```

Agent 기본 UX:

```text
Agent handoff -> 작업 만들기 -> .intent-agent-queue.json에 queued
Codex: 설치된 project skill이 queued task를 claim하고 처리
Claude: Claude Code가 열려 있으면 FileChanged hook이 queue 변경을 감지해 처리
완료: agent-result가 task frontmatter를 done으로 표시하고 lock을 해제
```

Codex와 Claude는 같은 task markdown, 같은 signal file, 같은 lock/status 규칙을 사용한다. 둘이 동시에 반응해도 먼저 `.intent/agent/locks/*.lock.json`을 만든 provider만 작업한다.

## 외부 Corpus 측정

외부 React/Tailwind 샘플을 로컬로 가져와 측정할 수 있다. third-party source는 commit하지 않는다.

```bash
npm run import:external-corpus -- <external-react-project-or-samples>
npm run analyze:external-corpus
```

외부 corpus copy는 `.intent/external-corpus*/` 아래에 생성되고, 수치 리포트는 `reports/performance/` 아래에 생성된다.

현재 독립 외부 baseline은 모두 50% MVP evidence gate를 넘는다.

| 프로젝트 | 파일 수 | `className` 수 | supported direct editable coverage |
| --- | ---: | ---: | ---: |
| `shadcn-ui/ui@dbf9c5e` | 100 | 915 | 77.50% |
| `sadmann7/skateshop@e954d54` | 100 | 866 | 79.46% |
| `mckaywrigley/chatbot-ui@81328b6` | 100 | 601 | 66.91% |

## 현재 MVP 판단

현재 MVP 판단은 token taxonomy 확장 여부를 넘어서, 실제 사용 가능한 후보 상태에 가깝다.

통과한 근거:

- direct-edit coverage
- package smoke
- product-sized graph refresh
- 독립 외부 corpus coverage
- 실제 브라우저 click-to-patch QA
- package tarball install smoke
- preview/apply/revert endpoint smoke
- KR/EN onboarding, install, failure mode, demo walkthrough 문서

남은 watch 항목:

- 다른 browser/runtime에서 QA 반복
- strict revert browser round trip 50ms 이하 최적화
- npm registry publish 전 최종 package 문구 정리

## `npm run eval`이 확인하는 것

`npm run eval`은 다음을 수치로 확인한다.

- `npm pack --dry-run`
- 실제 tarball 생성
- 임시 프로젝트 `npm install`
- 설치된 `intent-layer --help`
- 설치된 `intent-layer/vite` import
- 설치된 Vite plugin transform/graph output
- 실제 Vite dev server HTTP smoke
- `/__intent/graph`, `/__intent/setup`, `/__intent/preview`, `/__intent/apply`, `/__intent/revert-last`
- setup/settings update persistence
- apply/revert refresh timing
- 3-file graph refresh
- Agent queue signal, Codex skill, Claude hook 자동 설정
- Codex/Claude agent launch dry-run 계획
- missing-plugin `doctor` failure guidance
- 401-binding transform stress
- 24-file / 624-binding product-sized graph refresh
- external corpus import/report smoke

## 현재 지원 범위

- React + Vite + Tailwind demo UI
- compile-time `data-intent-id` injection
- `.intent/graph.intent.json` sidecar graph
- floating browser overlay
- 브라우저 setup/settings 화면, 한국어/영어 선택, 패널 preference, 온보딩 재표시, Agent queue/hook/command 설정
- overlay 수동 minimize/expand
- 같은 intent id를 가진 렌더 DOM 전체 outline과 shared source scope 표시
- patch preview before apply
- static `className` Tailwind token replacement
- simple `cn()` / `clsx()` literal segment replacement
- unsupported `className` read-only binding
- operation-log-backed undo stack
- pending undo discard
- safe non-top revert
- revert conflict artifact
- agent handoff task/result markdown
- `.intent/agent/task_*.md` task frontmatter status와 `.intent-agent-queue.json` signal
- Codex project skill 자동 생성: `.agents/skills/intent-layer-task-runner/SKILL.md`
- Claude FileChanged hook 자동 설정: `.claude/settings.json`
- `.intent/agent/task_*.md` 기반 Codex/Claude launch plan 호환 경로; 실제 spawn은 설정의 Agent 실행 허용 또는 `INTENT_LAYER_AGENT_RUN=1` 필요
- source hash validation
- operation/diff artifact output
- related source snapshot/diff for read-only handoff
- workspace package import context
- external npm package import reference without patching `node_modules`
- variant/cva related source handoff context
- component snapshot discovery fixtures
- browser click-to-panel, preview, apply, revert metric capture
- external corpus coverage and graph refresh reports

## 아직 범위 밖

- Next.js 정식 adapter
- styled-components / Emotion 편집
- 전체 CSS cascade 편집
- Figma import
- external npm package source 직접 patch
- 넓은 자연어 layout refactor를 deterministic patch처럼 처리하는 흐름

지원하지 않는 케이스는 `.intent/agent/task_*.md` handoff로 내려보내는 것이 현재 MVP의 안전한 동작이다.

## 주요 리포트

```text
reports/performance/corpus-audit.json
reports/performance/ai-corpus-audit.json
reports/performance/spike-evaluation.json
reports/performance/browser-click-metric.json
reports/performance/browser-runtime-availability.json
reports/performance/external-corpus-audit.json
reports/performance/external-corpus-skateshop-audit.json
reports/performance/external-corpus-chatbot-ui-audit.json
```

`reports/performance/external-corpus-audit.json`은 `npm run import:external-corpus -- <path>` 또는 `npm run analyze:external-corpus` 실행 시 갱신된다.
