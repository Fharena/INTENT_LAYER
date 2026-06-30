# INTENT_LAYER 성능 평가

## 1. 평가 범위

평가 명령:

```bash
npm run typecheck
npm run eval
npm run build
```

평가 대상:

- `fixtures/corpus/*.tsx`
- `fixtures/ai-generated/*.tsx`
- `src/App.tsx`
- `src/**/*.tsx` instrumentation transform
- static patch fixture
- simple `cn()` patch fixture
- last-patch revert fixture
- operation-log undo stack fixture
- operation branch undo discard/revert fixture
- operation conflict artifact fixture
- operation conflict resolution fixture
- pending undo history fixture
- agent handoff task fixture
- agent result artifact fixture
- agent result source diff fixture
- agent result selected `className` semantic diff fixture
- agent result component snapshot/source diff/semantic diff fixture
- component snapshot discovery fixture set
- read-only related source/semantic diff fixture
- read-only `cn()` variable related semantic diff fixture
- read-only composite variable related semantic diff fixture
- imported variable related source handoff fixture
- variant/cva related source handoff fixture
- imported variant/cva related source handoff fixture
- tsconfig paths alias + barrel variant/cva related source handoff fixture
- CLI `init`/`dev`/`scan`/`check`/`apply`/`diff`/`agent-context`/`agent-task`/`agent-result` fixture
- package install smoke fixture with installed plugin transform/graph, Vite dev server verification, and 3-file graph refresh verification
- product-sized Vite graph write throttle fixture
- read-only binding handoff fixture
- in-app browser click-to-panel, preview, apply, revert 측정

주의:

평가에는 두 종류의 corpus와 한 가지 외부 corpus import harness smoke가 있다.

1. 초기 fixture corpus: 작은 기능 검증용 샘플이다.
2. Codex-generated AI corpus: repo에 커밋된 50개 React/Tailwind TSX 샘플이다.
3. External corpus harness smoke: 외부 TSX/JSX 샘플을 `.intent/external-corpus/`로 가져오는 import/report/gate 흐름 검증용 샘플이다.

두 번째 corpus는 AI가 생성한 코드 표면을 더 넓게 재기 위한 재현 가능한 로컬 benchmark다.
다만 외부 프로젝트나 실제 사용자 코드에서 독립 수집한 benchmark는 아직 아니다.

## 2. Corpus 분석 결과

원본 리포트:

```text
reports/performance/corpus-audit.json
```

요약:

| 항목 | 값 |
| --- | ---: |
| 스캔 파일 수 | 8 |
| `className` 발생 수 | 40 |
| static `className` | 28 / 40 = 70.0% |
| simple `cn()` / `clsx()` | 5 / 40 = 12.5% |
| partial `cn()` / `clsx()` | 2 / 40 = 5.0% |
| read-only | 5 / 40 = 12.5% |
| static token 수 | 137 |
| static editable token 수 | 112 |
| static editable coverage | 81.75% |
| static + simple token 수 | 175 |
| static + simple editable token 수 | 144 |
| static + simple editable coverage | 82.29% |
| supported direct token 수 | 185 |
| supported direct editable token 수 | 150 |
| supported direct editable coverage | 81.08% |
| 전체 관측 token 수 | 185 |
| 전체 editable token 수 | 150 |
| 전체 editable coverage | 81.08% |

Unsupported reason:

| 이유 | 수 |
| --- | ---: |
| variable-reference | 2 |
| template-expression | 1 |
| variant-function | 1 |
| unsupported-expression | 1 |

해석:

- fixture 기준으로는 static `className`만으로도 직접 편집 가능한 token 표면적이 충분히 크다.
- simple/partial `cn()` / `clsx()` literal segment를 직접 patch 대상으로 포함했다.
- read-only 원인은 변수, template literal, variant 함수 계열로 줄었다.

## 2.1 Codex-generated AI Corpus 분석 결과

원본 리포트:

```text
reports/performance/ai-corpus-audit.json
```

요약:

| 항목 | 값 |
| --- | ---: |
| 스캔 파일 수 | 50 |
| `className` 발생 수 | 390 |
| static `className` | 320 / 390 = 82.05% |
| simple `cn()` / `clsx()` | 20 / 390 = 5.13% |
| partial `cn()` / `clsx()` | 10 / 390 = 2.56% |
| read-only | 40 / 390 = 10.26% |
| static token 수 | 1,770 |
| static editable token 수 | 1,430 |
| static editable coverage | 80.79% |
| static + simple token 수 | 1,890 |
| static + simple editable token 수 | 1,500 |
| static + simple editable coverage | 79.37% |
| supported direct token 수 | 1,930 |
| supported direct editable token 수 | 1,520 |
| supported direct editable coverage | 78.76% |
| 전체 관측 token 수 | 1,930 |
| 전체 editable token 수 | 1,520 |
| 전체 editable coverage | 78.76% |

Unsupported reason:

| 이유 | 수 |
| --- | ---: |
| variable-reference | 20 |
| property-access-reference | 10 |
| variant-function | 10 |

Gate:

| Gate | 기준 | 결과 |
| --- | --- | --- |
| sample count | files >= 50 | 통과 |
| static + simple coverage | editable coverage >= 50% | 통과 |
| supported direct coverage | editable coverage >= 50% | 통과 |
| all observed coverage | editable coverage >= 50% | 통과 |

해석:

- Codex-generated 50개 corpus에서는 직접 편집 가능한 token coverage가 78.76%로 나왔다.
- 이 수치는 "10% 케이스만 되는 장난감" 위험은 낮춘다.
- read-only 10.26%는 변수 참조, property access, variant 함수 패턴에 집중되어 있다.
- 아직 외부 프로젝트에서 독립 수집한 corpus가 아니므로, 시장 검증용 최종 수치로 쓰면 안 된다.

## 2.2 External Corpus Import Harness Smoke

원본 리포트:

```text
reports/performance/spike-evaluation.json
```

관련 스크립트:

```text
scripts/import-external-corpus.ts
npm run import:external-corpus -- <external-react-project-or-samples>
npm run analyze:external-corpus
```

목적:

- 외부 프로젝트 코드를 repo에 직접 커밋하지 않는다.
- 입력 TSX/JSX 파일 중 `className`이 있는 파일만 `.intent/external-corpus/files/`로 복사한다.
- story/test/spec, build output, `node_modules`는 기본 제외한다.
- manifest에 원본 경로, 복사본 경로, SHA-256 hash, byte 수, `className` 수를 남긴다.
- 같은 `analyzeClassNames` 기준으로 editable coverage와 gate 결과를 계산한다.

`npm run eval` smoke 요약:

| 항목 | 값 |
| --- | ---: |
| import exit code | 0 |
| import 시간 | 1,724.165ms |
| 선택 파일 수 | 3 |
| 스캔 파일 수 | 3 |
| `className` 발생 수 | 6 |
| skip된 story 파일 수 | 1 |
| static + simple editable coverage | 75.76% |
| supported direct editable coverage | 75.76% |
| 전체 observed editable coverage | 75.76% |
| gate | 통과 |

해석:

- 외부 corpus를 로컬 `.intent/` artifact로 가져와 같은 coverage 기준으로 측정하는 루프가 생겼다.
- 이 smoke는 importer/report/gate 형식을 검증하는 작은 fixture다.
- 실제 시장 검증 수치로 쓰려면 독립 수집한 외부 React/Tailwind 샘플 50-100개로 다시 실행해야 한다.

## 3. Transform 성능

원본 리포트:

```text
reports/performance/spike-evaluation.json
```

측정 결과:

| 파일 | binding 수 | transform time |
| --- | ---: | ---: |
| `src/App.tsx` | 13 | avg 1.286ms / p95 3.229ms / max 3.229ms |
| `src/main.tsx` | 0 | avg 0.005ms / p95 0.008ms / max 0.008ms |

요약:

| 항목 | 값 |
| --- | ---: |
| 측정 파일 수 | 2 |
| 파일당 반복 측정 | 5 |
| 전체 평균 transform time | 0.646ms |
| 전체 p95 transform time | 3.229ms |
| 전체 최대 transform time | 3.229ms |
| warm 평균 transform time | 0.402ms |
| warm p95 transform time | 0.948ms |
| warm 최대 transform time | 0.948ms |
| warm 목표 | 5ms 이하 |
| cold 목표 | 10ms 이하 |
| 결과 | warm 통과 / cold 통과 |

해석:

- 5회 반복 측정에서 첫 cold transform을 포함한 최대값이 10ms 아래로 들어왔다.
- 첫 샘플을 제외한 warm transform은 평균, p95, 최대값 모두 5ms 아래다.
- MVP 지원 패턴은 TypeScript AST cold parse 전에 low-level JSX/className scanner로 처리한다.
- scanner가 처리하지 못하는 복잡한 패턴은 기존 AST 경로로 fallback할 수 있게 남겼다.
- `className` 문자열이 없는 파일은 AST parse 없이 fast path로 건너뛴다.
- `className`이 있는 파일은 TypeScript AST parse와 instrumentation을 한 번에 수행한다.
- 반복 transform에서 source hash와 className tokenization 결과를 캐시해 warm path를 안정화한다.
- 대형 파일은 아래 stress fixture로 별도 측정한다.

## 3.1 Large TSX Transform Stress

| 항목 | 값 |
| --- | ---: |
| fixture 파일 | `.intent/tmp/LargeTransformFixture.tsx` |
| 반복 카드 수 | 100 |
| binding 수 | 401 |
| 파일 크기 | 45,352 bytes |
| 반복 측정 | 5 |
| average transform time | 10.42ms |
| p95 transform time | 14.031ms |
| max transform time | 14.031ms |
| stress 목표 | 20ms 이하 |
| 결과 | 통과 |

해석:

- 일반 `src` 파일의 5ms gate와 별도로, 401개 binding이 있는 stress fixture를 20ms 이하 목표로 측정했다.
- 이 수치는 MVP scanner가 큰 AI 생성 화면에서도 즉시 깨지는 수준은 아니라는 신호다.
- graph write throttling은 아래 product-sized fixture에서 별도로 검증한다.
- 실제 대형 제품에서는 더 많은 파일 수와 실제 import graph에서 multi-file HMR과 changed-file filtering을 추가로 재측정해야 한다.

## 3.2 Product-sized Graph Write Throttle

| 항목 | 값 |
| --- | ---: |
| fixture 파일 | `.intent/tmp/vite-graph-write-throttle/ProductGraphWriteThrottleFixture.tsx` |
| graph 파일 | `.intent/tmp/vite-graph-write-throttle/.intent/graph.intent.json` |
| 반복 카드 수 | 100 |
| binding 수 | 401 |
| 입력 크기 | 45,352 bytes |
| 동일 입력 반복 수 | 4 |
| initial transform | 24.465ms |
| 동일 입력 반복 transform | 12.909ms / 12.644ms / 8.385ms / 12.224ms |
| changed-token transform | 14.061ms |
| changed-token repeat transform | 15.118ms |
| inferred write count | 2 |
| inferred skipped write count | 5 |
| same-code generatedAt stable | true |
| changed-code generatedAt update | true |
| changed-repeat generatedAt stable | true |
| 결과 | 통과 |

해석:

- Vite plugin transform을 직접 호출해 401개 binding이 있는 TSX를 반복 측정했다.
- `transformMs`는 매번 바뀌는 진단값이므로 graph publish fingerprint에서 제외했다.
- 동일 입력 4회와 변경 후 동일 입력 1회는 `.intent/graph.intent.json`의 `generatedAt`이 유지되어 write skip으로 추론된다.
- 실제 semantic token 변경(`gap-4` -> `gap-6`)에서는 `generatedAt`이 한 번 갱신된다.

## 4. Patch 성능과 안전성

| 항목 | 값 |
| --- | ---: |
| preview 성공 | true |
| preview time | 0.834ms |
| preview round trip | 1.243ms |
| apply 성공 | true |
| static apply time | 3.692ms |
| simple `cn()` apply time | 2.117ms |
| revert 성공 | true |
| revert time | 2.458ms |
| patch 후 syntax error | 0 |
| revert 후 syntax error | 0 |
| simple `cn()` patch 후 syntax error | 0 |
| stale source rejection | true |
| stale rejection reason | `source-hash-mismatch` |

해석:

- patch preview와 apply는 목표 50ms보다 충분히 빠르다.
- simple `cn()` literal segment patch도 성공했다.
- 마지막 patch 되돌리기도 목표 50ms보다 충분히 빠르다.
- source hash mismatch가 발생하면 patch를 거부한다.
- 지원되는 static/simple token patch 후 syntax error는 발생하지 않았다.

## 4.1 Operation Log Undo Stack

| 항목 | 값 |
| --- | ---: |
| operation log 파일 | `.intent/operations/operation-log.json` |
| 첫 번째 apply 성공 | true |
| 두 번째 apply 성공 | true |
| apply 후 pending undo 수 | 2 |
| apply 후 history pending 수 | 2 |
| apply 후 다음 undo token | `p-8` |
| 첫 번째 revert 성공 | true |
| 첫 번째 revert 후 pending undo 수 | 1 |
| 첫 번째 revert 후 history pending 수 | 1 |
| 두 번째 revert 성공 | true |
| 두 번째 revert 후 pending undo 수 | 0 |
| 두 번째 revert 후 history pending 수 | 0 |
| stack revert 후 syntax error | 0 |

해석:

- direct patch 2개를 apply한 뒤 operation log에서 pending undo stack을 복원했다.
- pending undo history는 같은 stack을 JSON으로 노출하며, apply 후 다음 revert 대상이 `p-8`임을 기록했다.
- `/__intent/revert-last`와 같은 LIFO 흐름으로 2개 patch를 순서대로 되돌릴 수 있음을 fixture에서 검증했다.
- operation log는 apply/revert entry를 append하는 JSON 파일이며, 별도 DB나 외부 서비스 없이 동작한다.

## 4.2 Branch Undo Discard

| 항목 | 값 |
| --- | ---: |
| 첫 번째 apply 성공 | true |
| 두 번째 apply 성공 | true |
| apply 후 pending undo 수 | 2 |
| apply 후 history pending 수 | 2 |
| discard 성공 | true |
| discard time | 7.019ms |
| discarded token | `gap-6` |
| discard 후 pending undo 수 | 1 |
| discard 후 history pending 수 | 1 |
| discard 후 다음 undo token | `p-8` |
| discard 후 revert 성공 | true |
| revert 후 pending undo 수 | 0 |
| revert 후 history pending 수 | 0 |
| discard 후 syntax error | 0 |

해석:

- 사용자는 overlay의 undo history에서 특정 pending undo를 소스 변경 없이 폐기할 수 있다.
- 이 fixture는 오래된 `gap-6` undo를 폐기한 뒤 최신 `p-8` undo를 계속 되돌릴 수 있음을 검증한다.
- 폐기는 source를 바꾸지 않고 operation log에서 pending undo만 제거한다.

## 4.3 Branch Undo Revert

| 항목 | 값 |
| --- | ---: |
| 첫 번째 apply 성공 | true |
| 두 번째 apply 성공 | true |
| apply 후 pending undo 수 | 2 |
| apply 후 history pending 수 | 2 |
| non-top revert 성공 | true |
| non-top revert time | 5.336ms |
| non-top restored token | `gap-4` |
| non-top revert 후 pending undo 수 | 1 |
| non-top revert 후 history pending 수 | 1 |
| non-top revert 후 다음 undo token | `p-8` |
| source에 non-top token 복원 | true |
| source에 top patch token 유지 | true |
| top revert 성공 | true |
| top revert 후 pending undo 수 | 0 |
| top revert 후 history pending 수 | 0 |
| top revert 후 source 복원 | true |
| branch revert 후 syntax error | 0 |

해석:

- `/__intent/revert-undo`는 선택한 pending undo가 stack top이 아니어도 stored range의 `nextToken`이 그대로 있으면 직접 되돌린다.
- 이 fixture는 오래된 `gap-6` patch만 `gap-4`로 되돌리고 최신 `p-8` patch는 유지한 뒤, 남은 top patch를 정상 revert한다.
- stored range가 바뀐 경우에는 기존 conflict artifact 경로로 거부한다.

## 4.4 Operation Conflict Artifact And Resolution

| 항목 | 값 |
| --- | ---: |
| apply 성공 | true |
| revert 성공 | false |
| revert 거부 이유 | `revert-token-mismatch` |
| conflict 파일 | `.intent/conflicts/2026-06-30T09-37-15-348Z.intent-conflict.json` |
| conflict 파일 존재 | true |
| conflict kind | `revert-conflict` |
| expected token | `gap-6` |
| actual token | `gap-8` |
| restore token | `gap-4` |
| guidance 수 | 3 |
| conflict 후 pending undo 수 | 1 |
| resolve 전 active conflict 수 | 1 |
| resolve 성공 | true |
| resolve action | `discard-pending-undo` |
| resolve time | 4.84ms |
| resolvedAt 존재 | true |
| resolve 후 pending undo 수 | 0 |
| resolve 후 active conflict 수 | 0 |
| conflict 후 syntax error | 0 |

해석:

- 저장된 patch range에 더 이상 expected `nextToken`이 없으면 직접 되돌리기를 거부한다.
- conflict artifact는 expected/actual/restore token과 검토 가이드를 남긴다.
- `/__intent/conflicts`는 미해결 conflict artifact만 반환한다.
- `/__intent/resolve-conflict`는 사람이 확인한 conflict를 `discard-pending-undo`로 해결하고 matching pending undo를 operation log에서 제거한다.

## 5. Graph Lookup Proxy

| 항목 | 값 |
| --- | ---: |
| 반복 횟수 | 1000 |
| 총 시간 | 0.06ms |
| 평균 lookup | 0.00006ms |

주의:

이 값은 `intent id -> binding` Map lookup proxy다.
실제 click-to-panel 시간은 아래 browser metric으로 별도 측정했다.

## 6. Browser Interaction Metrics

원본 리포트:

```text
reports/performance/browser-click-metric.json
```

측정 방법:

```text
in-app browser로 Vite dev server를 열고,
overlay의 Pick element 버튼을 클릭한 뒤,
실제 화면의 Patch Preview heading을 클릭하고,
첫 typography token을 text-lg에서 text-xl로 preview/apply한 다음 Undo last로 되돌렸다.
overlay가 performance.now()로 측정한 값을 /__intent/client-metric에 POST했다.
```

| 항목 | 값 |
| --- | ---: |
| 테스트 URL | `http://127.0.0.1:5183/` |
| 측정 방식 | desktop 기본 viewport 3회 + mobile 390x844 viewport 3회 |
| 총 샘플 수 | 6 |
| desktop 샘플 수 | 3 |
| mobile 샘플 수 | 3 |
| 모든 binding 선택 성공 | true |
| 모든 preview 성공 | true |
| 모든 apply 성공 | true |
| 모든 revert 성공 | true |
| preview/apply token | `text-lg -> text-xl` |
| revert token | `text-xl -> text-lg` |
| click-to-panel 목표 | max 100ms 이하 |
| preview round trip 목표 | max 50ms 이하 |
| apply round trip 목표 | max 50ms 이하 |
| revert round trip 목표 | max 50ms 이하 |
| 결과 | 통과 |

전체 샘플 요약:

| 항목 | 평균 | p95 | 최대 |
| --- | ---: | ---: | ---: |
| graph fetch | 5.783ms | 7.5ms | 7.5ms |
| click-to-panel | 1.7ms | 2.3ms | 2.3ms |
| preview round trip | 5.017ms | 5.9ms | 5.9ms |
| preview server | 0.804ms | 0.992ms | 0.992ms |
| apply round trip | 28.4ms | 32.3ms | 32.3ms |
| apply server | 23.711ms | 26.821ms | 26.821ms |
| revert round trip | 19.883ms | 36.5ms | 36.5ms |
| revert server | 15.978ms | 31.808ms | 31.808ms |

Viewport별 최대값:

| 항목 | desktop max | mobile max |
| --- | ---: | ---: |
| graph fetch | 6.5ms | 7.5ms |
| click-to-panel | 2.3ms | 1.7ms |
| preview round trip | 5.3ms | 5.9ms |
| apply round trip | 32.3ms | 29.2ms |
| revert round trip | 17.5ms | 36.5ms |

해석:

- 사용자가 실제 대상 요소를 클릭한 순간부터 panel이 binding 상태로 렌더되기까지는 전체 샘플 기준 최대 2.3ms였다.
- `pickToPanelMs`는 사용자가 pick mode에 들어간 뒤 실제 대상을 클릭하기까지 머문 시간까지 포함하므로 UX latency가 아니라 사용자 대기 시간이 섞인 값이다.
- preview 버튼 클릭부터 preview 상태 렌더까지의 실제 browser round trip은 전체 샘플 기준 최대 5.9ms였다.
- apply 버튼 클릭부터 source patch 완료 및 상태 렌더까지의 실제 browser round trip은 전체 샘플 기준 최대 32.3ms였다.
- Undo last 클릭부터 source revert 완료 및 상태 렌더까지의 실제 browser round trip은 전체 샘플 기준 최대 36.5ms였다.
- 초기 1회 측정에서 desktop/mobile 반복 측정으로 확장했지만, 아직 한 로컬 머신과 한 브라우저 환경의 작은 샘플이다.

## 7. Agent Task 생성

| 항목 | 값 |
| --- | ---: |
| task 생성 성공 | true |
| task 생성 시간 | 2.3ms |
| 필수 섹션 포함 | true |

검증한 필수 섹션:

```text
Goal
Selected Component
Current Intent Document
Component Snapshot
Related Source Snapshot
Source Snapshot
Desired Change
Constraints
Files That May Be Edited
Files That Should Not Be Edited
Required Checks
```

## 8. Agent Result 생성

| 항목 | 값 |
| --- | ---: |
| result 생성 성공 | true |
| result 생성 시간 | 5.179ms |
| 필수 섹션 포함 | true |
| result/diff 파일 존재 | true |
| source hash changed | true |
| source snapshot 사용 가능 | true |
| source diff line 수 | 2 |
| source diff 포함 | true |
| semantic className change 수 | 1 |
| semantic token added 수 | 2 |
| semantic token removed 수 | 2 |
| semantic diff 포함 | true |
| component snapshot 사용 가능 | true |
| component source diff line 수 | 2 |
| component source diff 포함 | true |
| component semantic className change 수 | 1 |
| component semantic token added 수 | 2 |
| component semantic token removed 수 | 2 |
| component semantic diff 포함 | true |

검증한 필수 섹션:

```text
Summary
Source Binding
Task
Changed Files
Checks
Source Diff
Semantic Intent Diff
Related Source Diff
Related Semantic Intent Diff
Component Source Diff
Component Semantic Intent Diff
Intent Diff
```

dev server endpoint smoke test:

| 항목 | 값 |
| --- | ---: |
| 테스트 URL | `http://127.0.0.1:5178/__intent/agent-result` |
| result 생성 성공 | true |
| endpoint task time | 2.247ms |
| endpoint result time | 13.282ms |
| endpoint source snapshot 사용 가능 | true |
| endpoint source diff line 수 | 0 |
| result 파일 반환 | true |
| diff 파일 반환 | true |

해석:

- agent result 기록은 목표 50ms보다 빠르게 동작했다.
- 이번 단계는 사용자가 입력한 결과 요약을 구조화해 `.intent/agent/result_*.md`와 `.intent/diffs/*_agent.intent-diff.yml`로 남긴다.
- task 생성 시 선택 source window snapshot을 저장하고, result 기록 시 현재 source window와 비교해 line diff를 남긴다.
- read-only variable reference는 관련 변수 선언을 `Related Source Snapshot`으로 저장하고, result 기록 시 `Related Source Diff`와 `Related Semantic Intent Diff`로 비교한다.
- 선택 source window 안의 `className`은 before/after token으로 분석해 추가 token 2개(`rounded-xl`, `p-8`)와 제거 token 2개(`rounded-lg`, `p-6`)를 기록했다.
- task 생성 시 component snapshot도 저장하며, result 기록 시 component-level source diff와 `className` semantic token diff도 함께 남긴다.
- component-level semantic diff는 같은 fixture에서 추가 token 2개(`rounded-xl`, `p-8`)와 제거 token 2개(`rounded-lg`, `p-6`)를 기록했다.
- 아직 전체 파일 의미 변화, props/data flow 변화, variant 함수 의미 변화까지 자동 분석하는 단계는 아니다.

## 8.1 Component Snapshot Discovery Fixture

| 항목 | 값 |
| --- | ---: |
| fixture case 수 | 8 |
| 통과 case 수 | 8 |
| 통과율 | 100% |
| gate | 통과 |

검증한 case:

| case | component | binding 수 | task time | 결과 |
| --- | --- | ---: | ---: | --- |
| function + nested/map/conditional/fragment | `ComponentSnapshotFunction` | 3 | 1.205ms | 통과 |
| arrow block | `ComponentSnapshotArrowBlock` | 2 | 1.42ms | 통과 |
| arrow parenthesized expression | `ComponentSnapshotArrowParen` | 2 | 1.627ms | 통과 |
| arrow JSX no-parens | `ComponentSnapshotArrowJsx` | 1 | 1.416ms | 통과 |
| memo-wrapped function | `ComponentSnapshotMemo` | 1 | 1.416ms | 통과 |
| forwardRef-wrapped function | `ComponentSnapshotForwardRef` | 1 | 1.366ms | 통과 |
| HOC-wrapped function | `ComponentSnapshotHoc` | 2 | 1.127ms | 통과 |
| namespace object export | `ComponentSnapshotNamespace` | 1 | 1.37ms | 통과 |

해석:

- function component의 parameter destructuring/type annotation에서 body `{` 탐색이 잘못 짧게 끝나는 버그를 fixture가 잡았다.
- body range 탐색은 이제 function parameter list를 먼저 balance한 뒤 component body를 찾는다.
- arrow component는 block body, parenthesized expression body, no-parens JSX expression body를 모두 snapshot으로 잡는다.
- memo, forwardRef, HOC wrapper 안의 inner function 이름보다 export된 wrapper 변수명을 component identity로 우선한다.
- namespace object export는 object statement 전체를 component snapshot으로 잡는다.

## 9. Read-only Binding Handoff

| 항목 | 값 |
| --- | ---: |
| read-only entry 생성 | true |
| binding kind | `read-only` |
| unsupported reason | `variable-reference` |
| editable token 수 | 0 |
| agent task 생성 | true |
| agent task 생성 시간 | 1.287ms |
| agent result 생성 | true |
| agent result 생성 시간 | 4.763ms |
| result 후 syntax error | 0 |
| source diff line 수 | 2 |
| component source diff line 수 | 0 |
| related source snapshot 사용 가능 | true |
| related source diff line 수 | 2 |
| related source diff 포함 | true |
| related semantic className change 수 | 1 |
| related semantic diff 포함 | true |
| related semantic token added 수 | 3 |
| related semantic token removed 수 | 3 |

해석:

- `className={cardClass}`처럼 직접 patch하기 어려운 요소도 `data-intent-id`를 받아 선택 가능해졌다.
- 직접 token patch 버튼은 표시하지 않고, unsupported reason과 agent handoff로 degrade한다.
- 단순 변수 참조 read-only binding은 변수 선언 범위를 related source로 저장한다.
- fixture에서는 component body는 바뀌지 않아 component diff가 0이지만, `const cardClass = ...` 변경은 related source diff line 2와 semantic token added/removed 3/3으로 기록됐다.

## 9.1 Read-only `cn()` Variable Handoff

| 항목 | 값 |
| --- | ---: |
| read-only entry 생성 | true |
| binding kind | `read-only` |
| unsupported reason | `variable-reference` |
| editable token 수 | 0 |
| agent task 생성 | true |
| agent task 생성 시간 | 1.486ms |
| agent result 생성 | true |
| agent result 생성 시간 | 3.756ms |
| result 후 syntax error | 0 |
| source diff line 수 | 2 |
| component source diff line 수 | 2 |
| component source diff 포함 | true |
| related source snapshot 사용 가능 | true |
| related source diff line 수 | 2 |
| related source diff 포함 | true |
| related semantic className change 수 | 2 |
| related semantic diff 포함 | true |
| related semantic token added 수 | 4 |
| related semantic token removed 수 | 4 |

해석:

- `const cardClass = cn("...", active && "...")`처럼 변수 선언이 `cn()` literal segment를 품고 있어도 related source snapshot으로 잡힌다.
- result 기록은 기본 문자열 literal과 조건부 literal을 각각 semantic change로 잡아 added/removed token 4/4를 기록했다.
- 이 fixture는 관련 source semantic diff가 단순 quoted 변수 선언뿐 아니라 simple `cn()` 변수 선언도 감사 로그로 남긴다는 증거다.

## 9.2 Read-only Composite Variable Handoff

| 항목 | 값 |
| --- | ---: |
| read-only entry 생성 | true |
| binding kind | `read-only` |
| unsupported reason | `variable-reference` |
| editable token 수 | 0 |
| agent task 생성 | true |
| agent task 생성 시간 | 1.224ms |
| agent result 생성 | true |
| agent result 생성 시간 | 4.136ms |
| result 후 syntax error | 0 |
| source diff line 수 | 2 |
| component source diff line 수 | 14 |
| component source diff 포함 | true |
| related source snapshot 사용 가능 | true |
| related source diff line 수 | 14 |
| related source diff 포함 | true |
| related semantic className change 수 | 4 |
| related semantic diff 포함 | true |
| related semantic token added 수 | 6 |
| related semantic token removed 수 | 6 |

해석:

- 배열 join, object map lookup, runtime template literal을 섞은 `cardClass` 변수도 related source snapshot으로 잡힌다.
- result 기록은 배열 기본 literal, 조건부 literal, object-map literal, template literal 내부 조건부 literal을 각각 semantic change로 분리했다.
- 이 fixture는 read-only related semantic diff가 단순 변수와 simple `cn()`을 넘어 composite 변수 선언까지 감사 로그로 남긴다는 증거다.

## 9.3 Imported Variable Handoff

| 항목 | 값 |
| --- | ---: |
| fixture root | `.intent/tmp/imported-variable-handoff` |
| read-only entry 생성 | true |
| binding kind | `read-only` |
| unsupported reason | `variable-reference` |
| className value | `shellClass` |
| editable token 수 | 0 |
| agent task 생성 | true |
| agent task 생성 시간 | 9.317ms |
| related snapshot 사용 가능 | true |
| related snapshot file | `src/styles/cardClass.ts` |
| related snapshot kind | `variable-declaration` |
| related snapshot identifier | `cardClass` |
| related snapshot class 포함 | true |
| agent result 생성 | true |
| agent result 생성 시간 | 6.910ms |
| result 후 syntax error | 0 |
| selected source diff line 수 | 0 |
| component source diff line 수 | 0 |
| related source diff line 수 | 2 |
| related source diff 포함 | true |
| related semantic className change 수 | 1 |
| related semantic diff 포함 | true |
| related semantic token added 수 | 6 |
| related semantic token removed 수 | 6 |

해석:

- `className={shellClass}`가 `import { cardClass as shellClass } from "@/theme"`로 들어오는 경우도 read-only handoff 문맥을 만든다.
- `@/theme -> src/theme/index.ts -> ../styles -> src/styles/index.ts -> ./cardClass` 경로를 따라 최종 선언 파일 `src/styles/cardClass.ts`를 related source snapshot으로 기록한다.
- selected JSX 파일이 바뀌지 않고 imported variable 선언만 바뀌어도 related source diff와 semantic token diff가 생성된다.
- 이 fixture는 tsconfig paths alias, import alias, 다단계 barrel re-export 뒤의 변수 선언까지 handoff 감사 문맥으로 잡는다는 증거다.

## 9.4 Variant Function Handoff

| 항목 | 값 |
| --- | ---: |
| read-only entry 생성 | true |
| binding kind | `read-only` |
| unsupported reason | `variant-function` |
| className value | `buttonVariants({ variant: "primary" })` |
| editable token 수 | 0 |
| agent task 생성 | true |
| agent task 생성 시간 | 1.463ms |
| related snapshot 사용 가능 | true |
| related snapshot kind | `variant-function` |
| related snapshot identifier | `buttonVariants` |
| related snapshot cva 포함 | true |
| agent result 생성 | true |
| agent result 생성 시간 | 4.561ms |
| result 후 syntax error | 0 |
| selected source diff line 수 | 0 |
| component source diff line 수 | 0 |
| related source diff line 수 | 8 |
| related source diff 포함 | true |
| related semantic className change 수 | 2 |
| related semantic diff 포함 | true |
| related semantic token added 수 | 5 |
| related semantic token removed 수 | 5 |

해석:

- `className={buttonVariants(...)}`는 직접 patch하지 않고 read-only/agent handoff로 남긴다.
- 같은 파일 안의 local `const buttonVariants = cva(...)` 선언을 related source snapshot으로 저장한다.
- agent result 기록 시 selected JSX 자체가 바뀌지 않아도 variant 선언 변경을 related source diff와 literal token semantic diff로 감사 로그에 남긴다.

## 9.5 Imported Variant Function Handoff

| 항목 | 값 |
| --- | ---: |
| read-only entry 생성 | true |
| binding kind | `read-only` |
| unsupported reason | `variant-function` |
| className value | `buttonVariants({ variant: "primary" })` |
| editable token 수 | 0 |
| agent task 생성 | true |
| agent task 생성 시간 | 2.316ms |
| related snapshot 사용 가능 | true |
| related snapshot file | `.intent/tmp/ImportedVariantDefinition.ts` |
| related snapshot kind | `variant-function` |
| related snapshot identifier | `buttonVariants` |
| related snapshot cva 포함 | true |
| agent result 생성 | true |
| agent result 생성 시간 | 4.224ms |
| result 후 syntax error | 0 |
| selected source diff line 수 | 0 |
| component source diff line 수 | 0 |
| related source diff line 수 | 8 |
| related source diff 포함 | true |
| related semantic className change 수 | 2 |
| related semantic diff 포함 | true |
| related semantic token added 수 | 5 |
| related semantic token removed 수 | 5 |

해석:

- `className={buttonVariants(...)}` 호출 파일과 `buttonVariants` 정의 파일이 분리되어 있어도, 상대경로 named import 한 단계는 related source snapshot으로 따라간다.
- agent task의 편집 가능 파일 목록에는 선택 JSX 파일과 imported variant 정의 파일이 함께 들어간다.
- agent result 기록 시 선택 JSX가 바뀌지 않고 imported definition만 바뀌어도 related source diff와 semantic token diff가 생성된다.
- tsconfig paths alias와 one-hop named barrel re-export는 아래 fixture에서 별도 검증한다.
- imported 변수 선언의 alias/barrel chain은 지원하지만, package import, variant 함수의 복잡한 다단계 import graph, cross-variable data flow는 아직 지원하지 않는다.

## 9.6 Path Alias + Barrel Variant Function Handoff

| 항목 | 값 |
| --- | ---: |
| fixture root | `.intent/tmp/alias-barrel-variant-handoff` |
| read-only entry 생성 | true |
| binding kind | `read-only` |
| unsupported reason | `variant-function` |
| className value | `buttonVariants({ variant: "primary" })` |
| editable token 수 | 0 |
| agent task 생성 | true |
| agent task 생성 시간 | 7.831ms |
| related snapshot 사용 가능 | true |
| related snapshot file | `src/ui/buttonVariants.ts` |
| related snapshot kind | `variant-function` |
| related snapshot identifier | `buttonVariants` |
| related snapshot cva 포함 | true |
| agent result 생성 | true |
| agent result 생성 시간 | 5.314ms |
| result 후 syntax error | 0 |
| selected source diff line 수 | 0 |
| component source diff line 수 | 0 |
| related source diff line 수 | 8 |
| related source diff 포함 | true |
| related semantic className change 수 | 2 |
| related semantic diff 포함 | true |
| related semantic token added 수 | 5 |
| related semantic token removed 수 | 5 |

해석:

- `import { buttonVariants } from "@/ui"` 형태의 tsconfig paths alias를 `tsconfig.json`의 `baseUrl`/`paths` 기준으로 해석한다.
- `@/ui`가 `src/ui/index.ts` barrel 파일로 해석되고, `export { buttonVariants } from "./buttonVariants"` 한 단계를 따라간다.
- agent task/result는 최종 선언 파일인 `src/ui/buttonVariants.ts`를 related source snapshot/diff 대상으로 기록한다.
- imported 변수 선언의 다단계 barrel chain은 지원하지만, package import, variant 함수의 복잡한 다단계 barrel/import graph, cross-variable data flow는 아직 지원하지 않는다.

## 9.7 CLI Init/Dev/Scan/Check/Apply/Diff/Handoff

| 항목 | 값 |
| --- | ---: |
| init exit code | 0 |
| dev exit code | 0 |
| scan exit code | 0 |
| check exit code | 0 |
| apply exit code | 0 |
| diff exit code | 0 |
| agent-context exit code | 0 |
| init command | `init` |
| dev command | `dev` |
| scan command | `scan` |
| check command | `check` |
| apply command | `apply` |
| diff command | `diff` |
| agent-context command | `agent-context` |
| files scanned | 8 |
| binding 수 | 40 |
| direct-edit binding 수 | 35 |
| read-only binding 수 | 5 |
| supported direct coverage | 87.5% |
| editable token coverage | 81.08% |
| syntax error 수 | 0 |
| max transform time | 0.397ms |
| init stdout bytes | 496 |
| dev stdout bytes | 499 |
| scan stdout bytes | 3261 |
| check stdout bytes | 3657 |

init gate:

| 항목 | 값 |
| --- | ---: |
| init ok | true |
| created path 수 | 0 |
| existing path 수 | 10 |
| schema 파일 존재 | true |

dev dry-run gate:

| 항목 | 값 |
| --- | ---: |
| dev ok | true |
| dry-run | true |
| host | `127.0.0.1` |
| port | 5173 |
| url | `http://127.0.0.1:5173` |
| local Vite 사용 | true |
| executable 존재 | true |
| dev args 수 | 5 |
| dev command plan 시간 | 0.148ms |

check gate:

| Gate | 값 | 기준 | 결과 |
| --- | ---: | ---: | --- |
| files scanned | 8 | >= 1 | 통과 |
| syntax errors | 0 | 0 | 통과 |
| supported direct coverage | 87.5% | >= 50% | 통과 |
| max file transform | 0.209ms | <= 20ms | 통과 |

apply/diff gate:

| 항목 | 값 |
| --- | ---: |
| apply graph scan exit code | 0 |
| apply exit code | 0 |
| diff exit code | 0 |
| apply 대상 파일 | `.intent/tmp/CliApplyFixture.tsx` |
| operation file | `.intent/operations/2026-06-30T10-56-07-347Z.intent-op.json` |
| diff file | `.intent/diffs/2026-06-30T10-56-07-347Z.intent-diff.yml` |
| operation log file | `.intent/operations/operation-log.json` |
| apply 시간 | 3.481ms |
| apply 후 syntax error | 0 |
| diff bytes | 229 |
| diff change 수 | 1 |

agent-context gate:

| 항목 | 값 |
| --- | ---: |
| graph scan exit code | 0 |
| agent-context exit code | 0 |
| subject | `DynamicRuntime` |
| context file | `.intent/agent/context_2026-06-30T10-56-07-303Z.md` |
| 선택 binding id | `il_aecb838907` |
| 선택 파일 | `fixtures/corpus/DynamicRuntime.tsx` |
| graph entry 수 | 40 |
| direct-edit binding 수 | 35 |
| read-only binding 수 | 5 |
| editable token coverage | 81.08% |
| context markdown bytes | 9078 |
| context 생성 시간 | 15.759ms |
| 필수 섹션 포함 | true |

agent-task gate:

| 항목 | 값 |
| --- | ---: |
| graph scan exit code | 0 |
| agent-task exit code | 0 |
| graph entry 수 | 40 |
| 선택 binding id | `il_aecb838907` |
| task file | `.intent/agent/task_2026-06-30T10-56-07-321Z.md` |
| task 대상 파일 | `fixtures/corpus/DynamicRuntime.tsx` |
| task markdown bytes | 3541 |
| task 생성 시간 | 1.389ms |
| 필수 섹션 포함 | true |

agent-result gate:

| 항목 | 값 |
| --- | ---: |
| agent-result exit code | 0 |
| result file | `.intent/agent/result_2026-06-30T10-56-07-332Z.md` |
| diff file | `.intent/diffs/2026-06-30T10-56-07-332Z_agent.intent-diff.yml` |
| result 대상 파일 | `.intent/tmp/CliAgentResultFixture.tsx` |
| result markdown bytes | 2388 |
| result 생성 시간 | 4.333ms |
| source diff line 수 | 2 |
| semantic change 수 | 1 |
| 필수 섹션 포함 | true |
| result 후 syntax error | 0 |

해석:

- `dev`는 local Vite binary를 Node로 실행하는 thin wrapper이고, 나머지 CLI 명령은 별도 서버 없이 현재 instrumentation 엔진을 직접 호출한다.
- `init`은 `.intent` 기본 폴더와 lightweight schema 파일을 생성한다.
- `dev --dry-run`은 Vite process를 띄우지 않고 실행 command plan을 JSON으로 검증한다.
- `scan`은 파일별 binding 수, read-only 수, editable token coverage, transform time, unsupported reason을 JSON으로 출력한다.
- `check`는 같은 결과에 최소 gate를 적용하고 실패 시 non-zero exit code를 돌려주는 출시 전 smoke check 역할이다.
- `apply`는 `.intent-op.json`의 단일 Tailwind token replace를 기존 safe patch 엔진으로 적용하고 operation/diff/log artifact를 남긴다.
- `diff`는 `.intent-diff.yml`을 JSON으로 요약해 CLI/CI에서 최근 intent diff를 확인할 수 있게 한다.
- `agent-context`는 graph 전체와 선택 binding을 AI용 markdown으로 요약한다.
- `agent-task`는 `.intent/graph.intent.json`의 binding id와 desired change를 받아 구조화된 handoff markdown을 생성한다.
- `agent-result`는 task file, result summary, changed files, checks를 받아 result markdown과 `.intent-diff.yml`을 생성한다.
- 현재 CLI MVP는 `init`/`dev`/`scan`/`check`/`apply`/`diff`/`agent-context`/`agent-task`/`agent-result`를 구현했다.

package install smoke gate:

| 항목 | 값 |
| --- | ---: |
| package name | `intent-layer-spike` |
| package version | `0.0.1` |
| bin target | `bin/intent-layer.cjs` |
| vite export target | `./vite.cjs` |
| dry-run exit code | 0 |
| pack exit code | 0 |
| install exit code | 0 |
| installed help exit code | 0 |
| installed `/vite` import exit code | 0 |
| installed plugin transform exit code | 0 |
| installed Vite dev server exit code | 0 |
| package file 수 | 15 |
| package size | 41614 bytes |
| unpacked size | 205078 bytes |
| bin wrapper 포함 | true |
| CLI source 포함 | true |
| Vite plugin source 포함 | true |
| context-pack 파일 포함 | false |
| help에 Usage 포함 | true |
| help에 dev command 포함 | true |
| `/vite` import 성공 | true |
| `/vite` plugin name | `intent-layer-spike` |
| `/vite` plugin enforce | `pre` |
| legacy plugin name | `intent-layer-spike` |
| installed transform 성공 | true |
| installed transform `data-intent-id` 포함 | true |
| installed transform graph 생성 | true |
| installed transform graph entry 수 | 1 |
| installed transform graph size | 1663 bytes |
| installed transform 첫 relative file | `src/App.tsx` |
| installed transform 첫 editable token | `gap-4` |
| installed transform hook 시간 | 7.574ms |
| installed Vite dev server 성공 | true |
| installed Vite dev server home status | 200 |
| installed Vite dev server module status | 200 |
| installed Vite dev server graph status | 200 |
| installed Vite dev server module `data-intent-id` 포함 | true |
| installed Vite dev server graph entry 수 | 1 |
| installed Vite dev server graph size | 1654 bytes |
| installed Vite dev server 첫 relative file | `src/App.tsx` |
| installed Vite dev server 첫 editable token | `gap-4` |
| installed Vite dev server preview status | 200 |
| installed Vite dev server preview 성공 | true |
| installed Vite dev server apply status | 200 |
| installed Vite dev server apply 성공 | true |
| installed Vite dev server source patch 반영 | true |
| installed Vite dev server operation file 생성 | true |
| installed Vite dev server diff file 생성 | true |
| installed Vite dev server operation log 생성 | true |
| installed Vite dev server apply 후 module status | 200 |
| installed Vite dev server apply 후 module `gap-6` 포함 | true |
| installed Vite dev server apply 후 graph status | 200 |
| installed Vite dev server apply 후 graph entry 수 | 1 |
| installed Vite dev server apply 후 첫 editable token | `gap-6` |
| installed Vite dev server multi-file 성공 | true |
| installed Vite dev server multi-file 초기 graph entry 수 | 3 |
| installed Vite dev server multi-file 변경 후 graph entry 수 | 3 |
| installed Vite dev server multi-file 변경 파일 이전 token | `gap-4` |
| installed Vite dev server multi-file 변경 파일 이후 token | `gap-8` |
| installed Vite dev server multi-file 미변경 파일 유지 | true |
| installed Vite dev server multi-file graph generatedAt 변경 | true |
| installed Vite dev server multi-file 변경 module `gap-8` 포함 | true |
| installed Vite dev server multi-file 시간 | 292.774ms |
| installed Vite dev server smoke 시간 | 1930.772ms |
| dry-run 시간 | 3414.767ms |
| pack 시간 | 3022.469ms |
| install 시간 | 4026.227ms |
| installed help 시간 | 3214.408ms |
| `/vite` import 시간 | 1353.488ms |
| installed transform smoke 시간 | 1146.906ms |

해석:

- `bin/intent-layer.cjs`는 package 내부 `tsx` dependency로 `src/intent/cli.ts`를 실행하는 얇은 Node wrapper다.
- `intent-layer-spike/vite`는 package root의 `vite.cjs` wrapper를 통해 `tsx/cjs`를 등록하고 `src/intent/vitePlugin.ts`를 노출한다. 실제 Vite config의 Node ESM loader가 `.ts` export를 직접 읽지 못하는 문제를 막기 위한 최소 wrapper다.
- package smoke는 OS temp 폴더에 tarball을 만들고, 별도 temp install 폴더에서 `npm install` 후 설치된 `intent-layer --help`와 `intent-layer-spike/vite` import를 실행한다.
- 같은 temp install 폴더에서 외부 fixture `src/App.tsx`를 만들고, 설치된 plugin의 `configResolved`/`transform` hook을 직접 호출해 `data-intent-id` 주입과 `.intent/graph.intent.json` 생성까지 확인한다.
- 같은 temp install 폴더에서 실제 Vite dev server도 띄우고, HTTP로 `/`, `/src/App.tsx`, `/__intent/graph`, `/__intent/preview`, `/__intent/apply`를 조회/호출해 module transform, server middleware, safe patch apply가 같이 동작하는지 확인한다.
- installed Vite dev server smoke는 `gap-4 -> gap-6` patch가 source에 반영되는지, operation/diff/log artifact가 생성되는지, apply 후 `/src/App.tsx`와 `/__intent/graph`가 갱신되는지 확인한다.
- 같은 Vite dev server 세션에서 App/Header/Card 3개 TSX 파일을 graph에 올리고, Card만 `gap-4 -> gap-8`로 바꾼 뒤 entry 수 3 유지, 변경 파일 token 갱신, 미변경 파일 유지, graph generatedAt 변경을 확인한다.
- 현재 검증된 package export는 `intent-layer-spike/vite`다. public npm package 이름과 외부 사용자용 install guide 문구는 아직 launch polish로 남겨둔다.

## 10. Gate 결과

| Gate | 기준 | 결과 |
| --- | --- | --- |
| static editable token coverage | >= 30% | 통과 |
| static + simple `cn()` / `clsx()` coverage | >= 50% | 통과 |
| supported direct coverage | >= 50% | 통과 |
| AI corpus sample count | files >= 50 | 통과 |
| AI corpus static + simple coverage | editable coverage >= 50% | 통과 |
| AI corpus supported direct coverage | editable coverage >= 50% | 통과 |
| AI corpus all observed coverage | editable coverage >= 50% | 통과 |
| external corpus harness | import exit 0 + files 3 + story skip 1 + coverage >= 50% | 통과 |
| warm transform target | max <= 5ms | 통과 |
| cold transform target | max <= 10ms | 통과 |
| large transform stress | 401 bindings max <= 20ms | 통과 |
| product graph write throttle | 401 bindings, 동일 입력 stable, 변경 입력 update, inferred writes = 2, inferred skipped writes = 5 | 통과 |
| CLI init | `.intent` folders/schema 생성 또는 존재 확인 + exit code 0 | 통과 |
| CLI dev dry-run | local Vite command plan 생성 + host/port 검증 + exit code 0 | 통과 |
| package install smoke | pack dry-run + tarball install + installed `intent-layer --help` + installed `/vite` import + installed plugin transform/graph + installed Vite dev server HTTP graph/preview/apply + 3-file graph refresh + context-pack 제외 | 통과 |
| CLI scan | command `scan` + files >= 8 + bindings > 0 + JSON output | 통과 |
| CLI check | files/syntax/coverage/transform gate 모두 통과 + exit code 0 | 통과 |
| CLI apply/diff | `.intent-op.json` apply 성공 + operation/diff/log 생성 + diff summary change > 0 + syntax error 0 | 통과 |
| CLI agent context | graph entry >= 40 + 선택 binding 포함 + markdown 필수 섹션 포함 | 통과 |
| CLI agent task | graph entry >= 40 + read-only binding 선택 + task markdown 필수 섹션 포함 | 통과 |
| CLI agent result | task/result/diff 생성 + source diff > 0 + semantic change > 0 + syntax error 0 | 통과 |
| browser sample count | total >= 6, desktop >= 3, mobile >= 3 | 통과 |
| browser click-to-panel | click-to-panel <= 100ms | 통과 |
| browser preview round trip | preview round trip <= 50ms | 통과 |
| browser apply round trip | apply round trip <= 50ms | 통과 |
| browser revert round trip | revert round trip <= 50ms | 통과 |
| supported static patch | apply 성공 + syntax error 0 | 통과 |
| last patch revert | revert 성공 + syntax error 0 | 통과 |
| operation log undo stack/history | 2 apply + history next token `p-8` + 2 revert + pending stack 0 + syntax error 0 | 통과 |
| operation branch undo discard | non-top pending undo 폐기 + 다음 undo token `p-8` 유지 + revert 후 pending stack 0 + syntax error 0 | 통과 |
| operation branch undo revert | non-top pending undo revert + top patch 유지 + 다음 undo token `p-8` 유지 + 최종 pending stack 0 + syntax error 0 | 통과 |
| operation conflict artifact | `revert-token-mismatch` 거부 + conflict artifact 생성 + expected/actual/restore token 기록 + syntax error 0 | 통과 |
| operation conflict resolution | active conflict 1 + `discard-pending-undo` resolve + pending stack 0 + active conflict 0 + syntax error 0 | 통과 |
| agent task generation | task 생성 + 필수 섹션 포함 | 통과 |
| agent result generation | result/diff 생성 + source diff + selected/component/related semantic diff section 포함 | 통과 |
| component snapshot discovery | 8 fixture case 모두 통과 | 통과 |
| read-only handoff | read-only binding 생성 + agent task 생성 | 통과 |
| read-only related source/semantic diff | related snapshot + related source diff + related semantic diff + syntax error 0 | 통과 |
| read-only `cn()` variable related semantic diff | related source diff + related semantic change >= 2 + token added/removed >= 4 + syntax error 0 | 통과 |
| read-only composite variable related semantic diff | array/object/template related semantic change >= 4 + token added/removed >= 6 + syntax error 0 | 통과 |
| imported variable related source handoff | tsconfig paths alias + import alias + multi-hop barrel snapshot + related semantic token added/removed >= 5 + syntax error 0 | 통과 |
| variant/cva related source handoff | local variant declaration snapshot + related source diff + semantic token added/removed >= 5 + syntax error 0 | 통과 |
| imported variant/cva related source handoff | one-hop relative named import snapshot + related source diff + semantic token added/removed >= 5 + syntax error 0 | 통과 |
| alias/barrel variant/cva related source handoff | tsconfig paths alias + one-hop named barrel snapshot + related source diff + semantic token added/removed >= 5 + syntax error 0 | 통과 |
| simple `cn()` / `clsx()` patch | apply 성공 + syntax error 0 | 통과 |
| stale rejection | source mismatch 거부 | 통과 |

## 11. 결론

이번 단계는 MVP direct-edit 표면적을 static `className`에서 simple/partial `cn()` / `clsx()` literal segment까지 확장했고, 직접 patch가 어려운 `className`은 read-only handoff로 선택 가능하게 만들었다. 또한 read-only 변수 선언의 related semantic diff를 배열, object map, template literal 조합까지 넓히고, imported 변수 선언도 tsconfig paths alias/import alias/다단계 barrel re-export 뒤에서 related source handoff 문맥으로 잡는다. local/one-hop relative import/tsconfig paths alias + one-hop named barrel 뒤의 variant/cva 선언도 related source handoff 문맥으로 잡는다. 최소 CLI `init`/`dev`/`scan`/`check`/`apply`/`diff`/`agent-context`/`agent-task`/`agent-result`도 추가해 local dev server 실행, repo 상태 확인, deterministic patch 적용, intent diff 확인, AI용 context 생성, agent handoff 문서 생성, result/diff 기록까지 할 수 있게 했다. 설치형 package smoke도 tarball install, 설치된 bin 실행, `/vite` wrapper export import, 외부 temp fixture transform/graph 생성, 실제 Vite dev server HTTP graph/preview/apply, source patch artifact, 3-file graph refresh 검증까지 통과했다. 이번 갱신에서는 401-binding TSX 반복 transform에서 semantic fingerprint가 같으면 sidecar graph write를 건너뛰는 gate와 외부 corpus import/report/gate harness smoke도 통과했다.

성공한 것:

- static `className` token 분석
- simple/partial `cn()` / `clsx()` literal segment 분석
- Codex-generated 50개 React/Tailwind corpus coverage 측정
- 외부 corpus import/analyze harness와 manifest/report/gate 생성
- compile-time source binding 생성
- read-only source binding 생성
- source token range 기반 patch
- apply 전 patch preview
- operation-log 기반 undo stack
- pending undo history endpoint와 overlay 표시
- last-patch revert endpoint의 LIFO stack 동작
- pending undo 항목 비파괴 폐기와 안전한 non-top revert 처리
- undo conflict artifact 생성과 expected/actual/restore token 기록
- undo conflict 목록 조회와 `discard-pending-undo` 해결 처리
- 반복 transform을 위한 source hash/className tokenization 캐시
- 반복 Vite transform에서 semantic graph fingerprint 기반 sidecar write throttling
- agent handoff task markdown 생성
- agent result markdown, selected source-window diff, component source diff, selected/component/related `className` semantic diff 생성
- component snapshot discovery fixture 8/8 통과
- read-only variable reference의 related source diff와 semantic token diff 생성
- read-only `cn()` variable reference의 related source diff와 semantic token diff 생성
- read-only composite variable의 배열/object map/template literal related semantic token diff 생성
- tsconfig paths alias + import alias + 다단계 barrel re-export 뒤 imported variable declaration의 related source diff와 semantic token diff 생성
- variant/cva read-only binding의 local variant declaration related source diff와 semantic token diff 생성
- variant/cva read-only binding의 one-hop relative named import declaration related source diff와 semantic token diff 생성
- variant/cva read-only binding의 tsconfig paths alias + one-hop named barrel declaration related source diff와 semantic token diff 생성
- 실제 브라우저 click-to-panel, preview, apply, revert round-trip 측정
- unsupported className의 agent handoff degrade
- simple `cn()` literal segment patch
- source hash stale rejection
- low-level scanner 기반 cold transform 5ms gate 통과
- 401-binding large TSX transform stress gate 통과
- 401-binding product graph write throttle gate 통과
- CLI `scan`/`check` JSON report와 gate 통과
- CLI `init` workspace/schema 생성과 gate 통과
- CLI `dev --dry-run` local Vite command plan 생성과 gate 통과
- package tarball dry-run, 실제 pack, temp install, 설치된 `intent-layer --help`, 설치된 `/vite` import, 설치된 plugin transform/graph, 설치된 Vite dev server HTTP graph/preview/apply source patch 및 3-file graph refresh gate 통과
- CLI `apply` `.intent-op.json` 기반 safe patch 적용과 operation/diff/log 생성
- CLI `diff` `.intent-diff.yml` JSON summary와 gate 통과
- CLI `agent-context` AI용 graph/binding context markdown 생성과 필수 섹션 검증 통과
- CLI `agent-task` handoff markdown 생성과 필수 섹션 검증 통과
- CLI `agent-result` result markdown/diff 생성과 source/semantic diff 검증 통과
- intent operation/diff 최소 출력
- 수치 리포트 생성

아직 부족한 것:

- 제품급 multi-file HMR 세션에서 graph write throttle과 changed-file filtering 재측정
- 실제 브라우저 측정은 desktop/mobile 반복 샘플까지 확장했지만, 아직 한 로컬 머신과 한 브라우저 환경의 작은 샘플이다.
- CLI tarball install, package `/vite` wrapper export smoke, 설치된 plugin transform/graph smoke, 설치된 Vite dev server HTTP preview/apply 및 3-file graph refresh smoke는 통과했지만, public npm package 이름과 외부 사용자용 install guide copy는 출시 polish로 남아 있다.
- 외부 corpus import harness는 준비됐지만, 외부 프로젝트에서 독립 수집한 AI 생성 코드 50-100개 실제 검증은 아직 남아 있다.
- 외부 corpus와 제품급 TSX 파일에서 component snapshot false-positive/false-negative 재측정
- package import, variant 함수의 복잡한 다단계 import graph, cross-variable data flow를 포함한 imported variant 함수 자동 분석
- variant 함수와 runtime template literal 직접 patch 지원

다음 판단:

```text
MVP direct-edit 범위는 계속 확장할 가치가 있다.
다음 우선순위는 준비된 external corpus harness로 독립 외부 샘플 50-100개를 실제 측정하고, package import/variant 함수 multi-hop/cross-variable handoff 문맥 보강과 외부 제품급 TSX 파일에서 component snapshot 및 product-sized graph throttle 재측정을 진행하는 것이다.
```
