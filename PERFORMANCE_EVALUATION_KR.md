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
- `src/App.tsx`
- `src/**/*.tsx` instrumentation transform
- static patch fixture
- simple `cn()` patch fixture
- last-patch revert fixture
- agent handoff task fixture
- agent result artifact fixture

주의:

이번 corpus는 외부 실제 AI 생성 코드 50-100개가 아니라, repo 안에 만든 초기 fixture corpus다.
따라서 수치는 제품 가능성의 1차 신호로만 봐야 한다.
다음 단계에서는 실제 AI 생성 샘플을 별도로 모아 다시 측정해야 한다.

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

## 3. Transform 성능

원본 리포트:

```text
reports/performance/spike-evaluation.json
```

측정 결과:

| 파일 | binding 수 | transform time |
| --- | ---: | ---: |
| `src/App.tsx` | 13 | avg 2.672ms / p95 5.392ms / max 5.392ms |
| `src/main.tsx` | 0 | avg 0.703ms / p95 1.571ms / max 1.571ms |

요약:

| 항목 | 값 |
| --- | ---: |
| 측정 파일 수 | 2 |
| 파일당 반복 측정 | 5 |
| 전체 평균 transform time | 1.688ms |
| 전체 p95 transform time | 5.392ms |
| 전체 최대 transform time | 5.392ms |
| warm 평균 transform time | 1.239ms |
| warm p95 transform time | 2.542ms |
| warm 최대 transform time | 2.542ms |
| 목표 | warm 파일당 5ms 이하 |
| 결과 | warm 통과 / cold 미통과 |

해석:

- 5회 반복 측정에서 첫 cold transform은 5ms를 넘었다.
- 첫 샘플을 제외한 warm transform은 평균, p95, 최대값 모두 5ms 아래다.
- 현재는 TypeScript AST parse와 instrumentation을 한 번에 수행한다.
- 대형 파일에서는 target filtering, cache, graph write throttling이 필요하다.

## 4. Patch 성능과 안전성

| 항목 | 값 |
| --- | ---: |
| preview 성공 | true |
| preview time | 1.008ms |
| preview round trip | 1.279ms |
| apply 성공 | true |
| static apply time | 4.19ms |
| simple `cn()` apply time | 4.368ms |
| revert 성공 | true |
| revert time | 3.355ms |
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

## 5. Graph Lookup Proxy

| 항목 | 값 |
| --- | ---: |
| 반복 횟수 | 1000 |
| 총 시간 | 0.382ms |
| 평균 lookup | 0.000382ms |

주의:

이 값은 실제 브라우저 클릭 전체 시간이 아니다.
현재는 `intent id -> binding` Map lookup만 측정했다.
실제 click-to-panel 시간은 dev server와 브라우저에서 별도로 측정해야 한다.

## 6. Agent Task 생성

| 항목 | 값 |
| --- | ---: |
| task 생성 성공 | true |
| task 생성 시간 | 9.167ms |
| 필수 섹션 포함 | true |

검증한 필수 섹션:

```text
Goal
Selected Component
Current Intent Document
Desired Change
Constraints
Files That May Be Edited
Files That Should Not Be Edited
Required Checks
```

## 7. Agent Result 생성

| 항목 | 값 |
| --- | ---: |
| result 생성 성공 | true |
| result 생성 시간 | 3.312ms |
| 필수 섹션 포함 | true |
| result/diff 파일 존재 | true |
| source hash changed | false |

검증한 필수 섹션:

```text
Summary
Source Binding
Task
Changed Files
Checks
Intent Diff
```

dev server endpoint smoke test:

| 항목 | 값 |
| --- | ---: |
| 테스트 URL | `http://127.0.0.1:5176/__intent/agent-result` |
| result 생성 성공 | true |
| endpoint result time | 12.559ms |
| result 파일 반환 | true |
| diff 파일 반환 | true |

해석:

- agent result 기록은 목표 50ms보다 빠르게 동작했다.
- 이번 단계는 사용자가 입력한 결과 요약을 구조화해 `.intent/agent/result_*.md`와 `.intent/diffs/*_agent.intent-diff.yml`로 남긴다.
- 실제 agent patch의 의미를 자동 분석하는 단계는 아직 아니다.

## 8. Gate 결과

| Gate | 기준 | 결과 |
| --- | --- | --- |
| static editable token coverage | >= 30% | 통과 |
| static + simple `cn()` / `clsx()` coverage | >= 50% | 통과 |
| supported direct coverage | >= 50% | 통과 |
| warm transform target | max <= 5ms | 통과 |
| cold transform target | max <= 5ms | 미통과 |
| supported static patch | apply 성공 + syntax error 0 | 통과 |
| last patch revert | revert 성공 + syntax error 0 | 통과 |
| agent task generation | task 생성 + 필수 섹션 포함 | 통과 |
| agent result generation | result/diff 생성 + 필수 섹션 포함 | 통과 |
| simple `cn()` / `clsx()` patch | apply 성공 + syntax error 0 | 통과 |
| stale rejection | source mismatch 거부 | 통과 |

## 9. 결론

이번 단계는 MVP direct-edit 표면적을 static `className`에서 simple/partial `cn()` / `clsx()` literal segment까지 확장했다.

성공한 것:

- static `className` token 분석
- simple/partial `cn()` / `clsx()` literal segment 분석
- compile-time source binding 생성
- source token range 기반 patch
- apply 전 patch preview
- last-patch revert
- agent handoff task markdown 생성
- agent result markdown과 agent intent diff 생성
- simple `cn()` literal segment patch
- source hash stale rejection
- intent operation/diff 최소 출력
- 수치 리포트 생성

아직 부족한 것:

- cold first transform 5ms 목표
- 대형 TSX 파일에서 transform time 5ms 목표 유지
- 실제 브라우저 click-to-panel 시간 측정
- 실제 AI 생성 코드 50-100개 corpus 검증
- agent 결과와 실제 before/after source diff 연결
- variant 함수와 runtime template literal 지원

다음 판단:

```text
MVP direct-edit 범위는 계속 확장할 가치가 있다.
다음 우선순위는 실제 browser click-to-panel 측정, cold transform 최적화, 실제 corpus audit이다.
```
