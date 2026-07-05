# INTENT_LAYER GUI 온보딩

이 문서는 Vite로 새 React 프로젝트를 만든 사용자가 CLI 입력을 최소화하고 브라우저 안에서 INTENT_LAYER 설정을 끝내는 흐름을 설명한다.

## 목표

대상 사용자는 vibe-coder다. 설치 후 첫 경험은 명령어 목록이 아니라 작은 setup wizard여야 한다.

원칙:

- Vite 설정에 `intentLayer()`만 등록하면 브라우저 패널이 설정을 안내한다.
- `.intent/` workspace 생성은 패널에서 처리한다.
- 언어, 패널 위치/밀도, 시작 시 접기, setup 자동 열기, Agent command는 패널에서 바꾸고 `.intent/settings.json`에 저장한다.
- Codex/Claude hook은 기본적으로 실행하지 않고 command plan을 보여준다.
- 실제 Agent 실행은 `INTENT_LAYER_AGENT_RUN=1`이 설정된 경우에만 열린다.

## 새 Vite 프로젝트 기준 흐름

1. 사용자가 Vite React 프로젝트를 만든다.
2. `intent-layer`를 설치한다.
3. `vite.config.ts`에 plugin을 등록한다.
4. 기존처럼 Vite dev server를 실행한다.
5. 브라우저 우하단에 Intent Layer 패널이 뜬다.
6. 첫 실행이면 `처음 설정` 화면이 열린다.
7. 사용자는 한국어/영어와 기본 패널 설정을 고르고 `설정 완료`를 누른다.
8. 패널이 `.intent/` 폴더, schema, `.intent/settings.json`을 생성한다.
9. 이후에는 `선택`으로 UI를 클릭해 direct edit 또는 Agent handoff를 시작한다.

## 중간 설정 변경

완료 후에도 패널 상단 `설정` 버튼으로 같은 화면에 다시 들어간다.

현재 GUI에서 바꿀 수 있는 항목:

- 언어: 한국어 / English
- 패널 위치: 왼쪽 / 오른쪽
- 패널 밀도: 기본 / 컴팩트
- 시작 시 접기
- 설정 필요 시 setup 자동 열기
- Codex command
- Claude command
- 온보딩 다시 보기

패널 위치와 밀도는 저장 직후 바로 반영된다. `시작 시 접기`는 다음 새로고침부터 적용된다.

## Setup 화면에서 확인하는 것

- Workspace: `.intent/`와 schema 파일 준비 여부
- Language: 현재 overlay 언어
- Graph: Vite transform 후 source binding 생성 여부
- Agent: Codex/Claude command 탐지와 실행 잠금 상태

## Agent Hook UX

Agent 버튼은 두 계층으로 나뉜다.

```text
Plan Codex / Plan Claude
```

명령만 만든다. 외부 프로세스를 시작하지 않는다.

```text
Run Codex / Run Claude
```

같은 명령 계획을 사용하지만, 환경변수 `INTENT_LAYER_AGENT_RUN=1`이 있을 때만 실제 CLI를 spawn한다. 설정되지 않았다면 패널은 한국어로 실행 잠김 상태를 보여주고 command plan만 표시한다.

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
    "codexCommand": null,
    "claudeCommand": null
  }
}
```

## 아직 남은 UX 과제

- Vite config 자동 수정은 아직 하지 않는다. 사용자가 plugin import/call을 한 번은 추가해야 한다.
- Agent 실제 실행 허용은 GUI 설정이 아니라 여전히 `INTENT_LAYER_AGENT_RUN=1` env lock으로 보호한다.
- Next.js adapter는 아직 별도 과제다.
- custom component call-site와 forwarded `className`은 다음 React compatibility roadmap에서 확장한다.
