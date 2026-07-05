# INTENT_LAYER GUI 온보딩

이 문서는 Vite로 새 React 프로젝트를 만든 사용자가 CLI 입력을 최소화하고 브라우저 안에서 INTENT_LAYER 설정을 끝내는 흐름을 설명한다.

## 목표

대상 사용자는 vibe-coder다. 설치 후 첫 경험은 명령어 목록이 아니라 작은 setup wizard여야 한다.

원칙:

- Vite 설정에 `intentLayer()`만 등록하면 브라우저 패널이 설정을 안내한다.
- `.intent/` workspace 생성은 패널에서 처리한다.
- 언어, 패널 위치/밀도, 시작 시 접기, setup 자동 열기, Agent queue 자동 설정, Agent 실행 허용, Agent command는 패널에서 바꾸고 `.intent/settings.json`에 저장한다.
- Codex는 project skill, Claude는 FileChanged hook으로 같은 Agent queue를 본다.
- 브라우저 패널은 기본적으로 외부 프로세스를 직접 실행하지 않는다. 실제 Agent 실행 버튼/CLI spawn은 설정에서 명시적으로 켜거나 `INTENT_LAYER_AGENT_RUN=1`이 설정된 경우에만 열린다.

## 새 Vite 프로젝트 기준 흐름

1. 사용자가 Vite React 프로젝트를 만든다.
2. `intent-layer`를 설치한다.
3. `vite.config.ts`에 plugin을 등록한다.
4. 기존처럼 Vite dev server를 실행한다.
5. 브라우저 우하단에 Intent Layer 패널이 뜬다.
6. 첫 실행이면 `처음 설정` 화면이 열린다.
7. 사용자는 한국어/영어와 기본 패널 설정을 고르고 `설정 완료`를 누른다.
8. 패널이 `.intent/` 폴더, schema, `.intent/settings.json`, `.intent-agent-queue.json`, Codex skill, Claude hook 설정을 생성한다.
9. 이후에는 `선택`으로 UI를 클릭해 direct edit 또는 Agent handoff를 시작한다.

## 중간 설정 변경

완료 후에도 패널 상단 `설정` 버튼으로 같은 화면에 다시 들어간다.

현재 GUI에서 바꿀 수 있는 항목:

- 언어: 한국어 / English
- 패널 위치: 왼쪽 / 오른쪽
- 패널 밀도: 기본 / 컴팩트
- 시작 시 접기
- 설정 필요 시 setup 자동 열기
- Codex 작업 스킬
- Claude 자동 픽업
- Agent 실행 허용
- Codex command
- Claude command
- 온보딩 다시 보기

패널 위치와 밀도는 저장 직후 바로 반영된다. `시작 시 접기`는 다음 새로고침부터 적용된다.

## Setup 화면에서 확인하는 것

- Workspace: `.intent/`와 schema 파일 준비 여부
- Language: 현재 overlay 언어
- Graph: Vite transform 후 source binding 생성 여부
- Agent: queue signal, Codex skill, Claude hook, Codex/Claude command 탐지와 실행 잠금 상태

## 패널 시각화 구조

선택 후 패널은 초보자와 시니어가 같은 화면을 다른 깊이로 읽을 수 있게 구성한다.

- 단계 rail: `선택 -> 근거 확인 -> 수정 -> 검토` 순서로 현재 위치를 보여준다.
- Intent 맵: 컴포넌트, source file, source hash, `className` 모드, 수정 가능 token 수, shared source 영향 범위를 함께 보여준다.
- 직접 수정: 결정론적으로 patch 가능한 Tailwind token만 select/preview/apply로 노출한다.
- Agent 전달: 직접 patch가 모호하거나 큰 변경은 같은 queue/status/lock 규칙을 쓰는 task로 넘긴다.
- 검토: undo history와 conflict 상태를 같은 패널에서 확인한다.

설계 의도:

- 초보자는 다음 행동을 먼저 본다.
- 시니어는 patch 전에 source binding, source hash, shared render count, unsupported reason을 확인한다.
- HMR 중 overlay 코드가 바뀌면 stale 패널을 제거하고 새 runtime version으로 다시 그린다.

## Agent Hook UX

Agent handoff는 provider 버튼을 먼저 고르는 흐름이 아니다. 사용자는 변경 내용을 적고 `작업 만들기`를 누른다.

```text
Agent handoff -> 작업 만들기 -> Agent 큐
```

생성되는 것:

```text
.intent/agent/task_*.md
.intent-agent-queue.json
.intent/agent/locks/*.lock.json  // claim 후 생성
```

Codex는 `.agents/skills/intent-layer-task-runner/SKILL.md`를 통해 queued task를 읽고 `agent-claim --provider codex`로 claim한다.

Claude는 Claude Code가 열려 있을 때 `.claude/settings.json`의 `FileChanged` hook으로 `.intent-agent-queue.json` 변경을 감지한다.

작업 완료 시 `agent-result`가 task frontmatter를 `done`으로 바꾸고 lock을 해제한다. 실패 시 `agent-fail`이 `failed` status를 남긴다.

호환/진단용으로 Codex/Claude command plan과 직접 실행 경로는 남겨둔다. 다만 실제 CLI spawn은 설정의 `Agent 실행 허용`이 켜져 있거나 환경변수 `INTENT_LAYER_AGENT_RUN=1`이 있을 때만 가능하다.

## 저장되는 파일

```text
.intent/
  README.md
  settings.json
  graph.intent.json
  schema/
  operations/
  diffs/
  agent/
.intent-agent-queue.json
.agents/skills/intent-layer-task-runner/SKILL.md
.claude/settings.json
```

`settings.json` 예시:

```json
{
  "version": 1,
  "language": "ko",
  "onboardingCompletedAt": "2026-07-05T00:00:00.000Z",
  "updatedAt": "2026-07-05T00:00:00.000Z",
  "overlay": {
    "dock": "right",
    "density": "comfortable",
    "defaultCollapsed": false,
    "autoOpenSetup": true
  },
  "agent": {
    "runEnabled": false,
    "codexCommand": null,
    "claudeCommand": null,
    "codexSkillEnabled": true,
    "claudeHookEnabled": true
  }
}
```

## 아직 남은 UX 과제

- Vite config 자동 수정은 아직 하지 않는다. 사용자가 plugin import/call을 한 번은 추가해야 한다.
- Agent 실제 실행 허용은 GUI 설정에서 켤 수 있고, 자동화/CI에서는 `INTENT_LAYER_AGENT_RUN=1` env override로도 열 수 있다. 기본 UX는 shared queue pickup이다.
- Next.js adapter는 아직 별도 과제다.
- custom component call-site와 forwarded `className`은 다음 React compatibility roadmap에서 확장한다.
