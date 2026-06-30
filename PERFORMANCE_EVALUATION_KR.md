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
- variant/cva related source handoff fixture
- read-only binding handoff fixture
- in-app browser click-to-panel, preview, apply, revert 측정

주의:

평가에는 두 종류의 corpus가 있다.

1. 초기 fixture corpus: 작은 기능 검증용 샘플이다.
2. Codex-generated AI corpus: repo에 커밋된 50개 React/Tailwind TSX 샘플이다.

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

## 3. Transform 성능

원본 리포트:

```text
reports/performance/spike-evaluation.json
```

측정 결과:

| 파일 | binding 수 | transform time |
| --- | ---: | ---: |
| `src/App.tsx` | 13 | avg 0.86ms / p95 2.772ms / max 2.772ms |
| `src/main.tsx` | 0 | avg 0.003ms / p95 0.006ms / max 0.006ms |

요약:

| 항목 | 값 |
| --- | ---: |
| 측정 파일 수 | 2 |
| 파일당 반복 측정 | 5 |
| 전체 평균 transform time | 0.432ms |
| 전체 p95 transform time | 2.772ms |
| 전체 최대 transform time | 2.772ms |
| warm 평균 transform time | 0.192ms |
| warm p95 transform time | 0.484ms |
| warm 최대 transform time | 0.484ms |
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
| average transform time | 6.48ms |
| p95 transform time | 9.151ms |
| max transform time | 9.151ms |
| stress 목표 | 20ms 이하 |
| 결과 | 통과 |

해석:

- 일반 `src` 파일의 5ms gate와 별도로, 401개 binding이 있는 stress fixture를 20ms 이하 목표로 측정했다.
- 이 수치는 MVP scanner가 큰 AI 생성 화면에서도 즉시 깨지는 수준은 아니라는 신호다.
- 실제 대형 제품 파일에서는 cache, changed-file filtering, graph write throttling이 여전히 필요하다.

## 4. Patch 성능과 안전성

| 항목 | 값 |
| --- | ---: |
| preview 성공 | true |
| preview time | 0.57ms |
| preview round trip | 0.844ms |
| apply 성공 | true |
| static apply time | 3.065ms |
| simple `cn()` apply time | 2.236ms |
| revert 성공 | true |
| revert time | 2.467ms |
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

## 4.2 Operation Conflict Artifact And Resolution

| 항목 | 값 |
| --- | ---: |
| apply 성공 | true |
| revert 성공 | false |
| revert 거부 이유 | `revert-token-mismatch` |
| conflict 파일 | `.intent/conflicts/2026-06-30T07-27-32-695Z.intent-conflict.json` |
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
| resolve time | 2.63ms |
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
| 총 시간 | 0.051ms |
| 평균 lookup | 0.000051ms |

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
| task 생성 시간 | 2.381ms |
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
| result 생성 시간 | 5.941ms |
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
| function + nested/map/conditional/fragment | `ComponentSnapshotFunction` | 3 | 1.502ms | 통과 |
| arrow block | `ComponentSnapshotArrowBlock` | 2 | 1.674ms | 통과 |
| arrow parenthesized expression | `ComponentSnapshotArrowParen` | 2 | 1.383ms | 통과 |
| arrow JSX no-parens | `ComponentSnapshotArrowJsx` | 1 | 1.556ms | 통과 |
| memo-wrapped function | `ComponentSnapshotMemo` | 1 | 1.602ms | 통과 |
| forwardRef-wrapped function | `ComponentSnapshotForwardRef` | 1 | 1.408ms | 통과 |
| HOC-wrapped function | `ComponentSnapshotHoc` | 2 | 1.596ms | 통과 |
| namespace object export | `ComponentSnapshotNamespace` | 1 | 9.686ms | 통과 |

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
| agent task 생성 시간 | 1.609ms |
| agent result 생성 | true |
| agent result 생성 시간 | 4.696ms |
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
| agent task 생성 시간 | 1.315ms |
| agent result 생성 | true |
| agent result 생성 시간 | 4.114ms |
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
| agent task 생성 시간 | 1.087ms |
| agent result 생성 | true |
| agent result 생성 시간 | 4.954ms |
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

## 9.3 Variant Function Handoff

| 항목 | 값 |
| --- | ---: |
| read-only entry 생성 | true |
| binding kind | `read-only` |
| unsupported reason | `variant-function` |
| className value | `buttonVariants({ variant: "primary" })` |
| editable token 수 | 0 |
| agent task 생성 | true |
| agent task 생성 시간 | 1.343ms |
| related snapshot 사용 가능 | true |
| related snapshot kind | `variant-function` |
| related snapshot identifier | `buttonVariants` |
| related snapshot cva 포함 | true |
| agent result 생성 | true |
| agent result 생성 시간 | 3.903ms |
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
| warm transform target | max <= 5ms | 통과 |
| cold transform target | max <= 10ms | 통과 |
| large transform stress | 401 bindings max <= 20ms | 통과 |
| browser sample count | total >= 6, desktop >= 3, mobile >= 3 | 통과 |
| browser click-to-panel | click-to-panel <= 100ms | 통과 |
| browser preview round trip | preview round trip <= 50ms | 통과 |
| browser apply round trip | apply round trip <= 50ms | 통과 |
| browser revert round trip | revert round trip <= 50ms | 통과 |
| supported static patch | apply 성공 + syntax error 0 | 통과 |
| last patch revert | revert 성공 + syntax error 0 | 통과 |
| operation log undo stack/history | 2 apply + history next token `p-8` + 2 revert + pending stack 0 + syntax error 0 | 통과 |
| operation conflict artifact | `revert-token-mismatch` 거부 + conflict artifact 생성 + expected/actual/restore token 기록 + syntax error 0 | 통과 |
| operation conflict resolution | active conflict 1 + `discard-pending-undo` resolve + pending stack 0 + active conflict 0 + syntax error 0 | 통과 |
| agent task generation | task 생성 + 필수 섹션 포함 | 통과 |
| agent result generation | result/diff 생성 + source diff + selected/component/related semantic diff section 포함 | 통과 |
| component snapshot discovery | 8 fixture case 모두 통과 | 통과 |
| read-only handoff | read-only binding 생성 + agent task 생성 | 통과 |
| read-only related source/semantic diff | related snapshot + related source diff + related semantic diff + syntax error 0 | 통과 |
| read-only `cn()` variable related semantic diff | related source diff + related semantic change >= 2 + token added/removed >= 4 + syntax error 0 | 통과 |
| read-only composite variable related semantic diff | array/object/template related semantic change >= 4 + token added/removed >= 6 + syntax error 0 | 통과 |
| variant/cva related source handoff | local variant declaration snapshot + related source diff + semantic token added/removed >= 5 + syntax error 0 | 통과 |
| simple `cn()` / `clsx()` patch | apply 성공 + syntax error 0 | 통과 |
| stale rejection | source mismatch 거부 | 통과 |

## 11. 결론

이번 단계는 MVP direct-edit 표면적을 static `className`에서 simple/partial `cn()` / `clsx()` literal segment까지 확장했고, 직접 patch가 어려운 `className`은 read-only handoff로 선택 가능하게 만들었다. 또한 read-only 변수 선언의 related semantic diff를 배열, object map, template literal 조합까지 넓히고, local variant/cva 선언도 related source handoff 문맥으로 잡는다.

성공한 것:

- static `className` token 분석
- simple/partial `cn()` / `clsx()` literal segment 분석
- Codex-generated 50개 React/Tailwind corpus coverage 측정
- compile-time source binding 생성
- read-only source binding 생성
- source token range 기반 patch
- apply 전 patch preview
- operation-log 기반 undo stack
- pending undo history endpoint와 overlay 표시
- last-patch revert endpoint의 LIFO stack 동작
- undo conflict artifact 생성과 expected/actual/restore token 기록
- undo conflict 목록 조회와 `discard-pending-undo` 해결 처리
- 반복 transform을 위한 source hash/className tokenization 캐시
- agent handoff task markdown 생성
- agent result markdown, selected source-window diff, component source diff, selected/component/related `className` semantic diff 생성
- component snapshot discovery fixture 8/8 통과
- read-only variable reference의 related source diff와 semantic token diff 생성
- read-only `cn()` variable reference의 related source diff와 semantic token diff 생성
- read-only composite variable의 배열/object map/template literal related semantic token diff 생성
- variant/cva read-only binding의 local variant declaration related source diff와 semantic token diff 생성
- 실제 브라우저 click-to-panel, preview, apply, revert round-trip 측정
- unsupported className의 agent handoff degrade
- simple `cn()` literal segment patch
- source hash stale rejection
- low-level scanner 기반 cold transform 5ms gate 통과
- 401-binding large TSX transform stress gate 통과
- intent operation/diff 최소 출력
- 수치 리포트 생성

아직 부족한 것:

- 실제 제품급 대형 TSX 파일에서 cache/write throttling 검증
- 실제 브라우저 측정은 desktop/mobile 반복 샘플까지 확장했지만, 아직 한 로컬 머신과 한 브라우저 환경의 작은 샘플이다.
- branch undo UI는 아직 없다.
- 외부 프로젝트에서 독립 수집한 AI 생성 코드 50-100개 corpus 검증
- 외부 corpus와 제품급 TSX 파일에서 component snapshot false-positive/false-negative 재측정
- imported variant 함수와 cross-variable data flow 자동 분석
- variant 함수와 runtime template literal 직접 patch 지원

다음 판단:

```text
MVP direct-edit 범위는 계속 확장할 가치가 있다.
다음 우선순위는 외부 독립 corpus 검증, branch undo UI 다듬기, imported variant 함수/cross-variable handoff 문맥 보강, 제품급 TSX 파일에서 component snapshot 오탐/미탐 재측정이다.
```
