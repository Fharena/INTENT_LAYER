# INTENT_LAYER MVP 핸드오프

업데이트: 2026-07-03 KST

## 상태

INTENT_LAYER는 React/Vite/Tailwind click-to-patch 흐름 기준으로 MVP 후보 단계다.

현재 수치로 확인된 범위:

- 브라우저에서 보이는 React/Tailwind 요소 클릭
- compile-time `data-intent-id` source binding 매핑
- deterministic Tailwind token patch preview
- 최소 source range patch 적용
- undo history를 통한 last patch revert
- intent operation/diff artifact 생성
- 직접 patch가 어려운 binding의 structured agent handoff task 생성
- package tarball을 temp project에 설치하고 `intent-layer/vite` 사용

## 주요 근거

실행 명령:

```bash
npm run typecheck
npm run eval
npm run build
```

최신 로컬 검증:

| 체크 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm run eval` | 통과, false gate `0` |
| `npm run build` | 통과 |
| `git diff --check` | 통과 |
| Context Pack checkpoint | 기록 완료 |

주요 리포트:

```text
reports/performance/spike-evaluation.json
reports/performance/browser-click-metric.json
reports/performance/external-corpus-audit.json
reports/performance/external-corpus-skateshop-audit.json
reports/performance/external-corpus-chatbot-ui-audit.json
```

## MVP 수치

in-app browser로 측정한 실제 브라우저 interaction:

| 항목 | 최신 최대값 |
| --- | ---: |
| click-to-panel | 1.3ms |
| preview round trip | 4.9ms |
| apply round trip | 48.4ms |
| revert round trip | 53.6ms |

브라우저 gate:

| Gate | 결과 |
| --- | --- |
| desktop sample >= 3 | 통과 |
| mobile 390x844 sample >= 3 | 통과 |
| click-to-panel <= 100ms | 통과 |
| preview round trip <= 50ms | 통과 |
| apply round trip <= 50ms | 통과 |
| revert round trip <= 100ms | 통과 |
| revert 후 source 복원 | 통과 |

Watch 항목:

| 관측치 | 현재 |
| --- | --- |
| strict revert round trip <= 50ms | false |
| strict revert server <= 50ms | true |

revert는 source 복원과 undo artifact 기록을 포함하므로 MVP gate는 `revert <= 100ms`로 둔다. 다만 더 엄격한 50ms browser round-trip 목표는 후속 최적화 항목으로 계속 표시한다.

## 외부 Coverage

독립 외부 direct-edit coverage:

| 프로젝트 | 파일 수 | supported direct editable coverage |
| --- | ---: | ---: |
| `shadcn-ui/ui@dbf9c5e` | 100 | 77.50% |
| `sadmann7/skateshop@e954d54` | 100 | 79.46% |
| `mckaywrigley/chatbot-ui@81328b6` | 100 | 66.91% |

세 프로젝트 모두 현재 50% MVP evidence gate를 통과했다.

## Package Smoke

설치 smoke는 다음을 확인한다:

- `npm pack --dry-run`
- 실제 tarball 생성
- temp folder `npm install`
- 설치된 `intent-layer --help`
- 설치된 `intent-layer/vite` import
- 설치된 plugin transform/graph output
- 실제 설치형 Vite dev server HTTP graph/preview/apply/revert
- TSX 파일 하나가 바뀐 뒤 3-file graph refresh

최신 package smoke 핵심 수치:

| 항목 | 값 |
| --- | ---: |
| installed transform hook | 6.094ms |
| installed apply refresh | 88.279ms |
| installed revert refresh | 43.139ms |
| installed 3-file refresh | 132.441ms |

## 알려진 한계

- 직접 patch는 의도적으로 static `className`과 simple/partial `cn()` / `clsx()` literal segment에 집중한다.
- variant function, runtime template literal, 임의 깊이 cross-file data flow는 read-only 또는 handoff 경로다.
- 브라우저 QA는 현재 한 로컬 머신과 in-app browser desktop/mobile sample 기준이다.
- 두 번째 브라우저 runtime으로 Chrome을 시도했지만, 현재 환경에서 Codex Chrome Extension/native host 연결을 사용할 수 없었다. 근거는 `reports/performance/browser-runtime-availability.json`에 남겼다.
- npm registry publish와 registry 기준 install copy는 아직 하지 않았다.
- 현재 workspace에서는 `origin/main` 기준으로 Git write와 push를 진행하면 된다.

## 다음 작업

1. Chrome extension/native host 접근이 가능해진 뒤 다른 브라우저/runtime 환경에서 browser QA를 한 번 더 반복한다.
2. strict revert 50ms 이하를 후속 성능 최적화 목표로 유지한다.
3. 사용자용 MVP walkthrough를 위해 demo/package 문구를 정리한다.
4. 외부/product-sized TSX에서 component snapshot false-positive/false-negative를 재측정한다.
5. 별도 PR branch 요청이 없으면 후속 작업도 focused commit 단위로 `origin/main`에 바로 push한다.
