# INTENT_LAYER 성능 평가

## 1. 평가 일시와 범위

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
- 임시 patch fixture

주의:

이번 corpus는 외부 실제 AI 생성 코드 50-100개가 아니라, 현재 repo 안에 만든 초기 fixture corpus다.
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
| static `className` | 30 / 40 = 75.0% |
| simple `cn()` / `clsx()` | 3 / 40 = 7.5% |
| read-only | 7 / 40 = 17.5% |
| static token 수 | 154 |
| static editable token 수 | 126 |
| static editable coverage | 81.82% |
| static + simple token 수 | 172 |
| static + simple editable token 수 | 143 |
| static + simple editable coverage | 83.14% |
| 전체 관측 token 수 | 182 |
| 전체 editable token 수 | 149 |
| 전체 editable coverage | 81.87% |

Unsupported reason:

| 이유 | 수 |
| --- | ---: |
| variable-reference | 2 |
| template-expression | 1 |
| complex-cn-variable-reference | 1 |
| complex-cn-runtime-expression | 1 |
| variant-function | 1 |
| unsupported-expression | 1 |

해석:

- fixture 기준으로는 static className만으로도 직접 편집 가능한 token 표면적이 충분히 크다.
- simple `cn()` / `clsx()`를 추가해도 coverage 상승폭은 작았다. 현재 fixture가 static 중심이기 때문이다.
- read-only 원인은 변수, template literal, variant 함수, props forwarding 계열로 모였다.

## 3. Transform 성능

원본 리포트:

```text
reports/performance/spike-evaluation.json
```

측정 결과:

| 파일 | binding 수 | transform time |
| --- | ---: | ---: |
| `src/App.tsx` | 13 | avg 2.571ms / p95 4.309ms / max 4.309ms |
| `src/main.tsx` | 0 | avg 0.714ms / p95 1.665ms / max 1.665ms |

요약:

| 항목 | 값 |
| --- | ---: |
| 측정 파일 수 | 2 |
| 파일당 반복 측정 | 5 |
| 평균 transform time | 1.642ms |
| p95 transform time | 4.309ms |
| 최대 transform time | 4.309ms |
| 목표 | 파일당 5ms 이하 |
| 결과 | 통과 |

해석:

- 5회 반복 측정 기준으로 평균, p95, 최대값 모두 5ms 아래다.
- 현재는 AST parse와 instrumentation을 한 번에 수행한다.
- fixture가 작기 때문에 대형 파일에서는 target filtering, cache, write throttling이 필요하다.

## 4. Patch 성능과 안전성

| 항목 | 값 |
| --- | ---: |
| preview 성공 | true |
| preview time | 0.824ms |
| preview round trip | 1.193ms |
| apply 성공 | true |
| apply time | 11.435ms |
| patch 후 syntax error | 0 |
| stale source rejection | true |
| stale rejection reason | `source-hash-mismatch` |

해석:

- patch preview와 apply는 목표 50ms보다 충분히 빠르다.
- source hash mismatch가 발생하면 patch를 거부한다.
- 지원되는 static token patch 후 syntax error는 발생하지 않았다.

## 5. Graph Lookup Proxy

| 항목 | 값 |
| --- | ---: |
| 반복 횟수 | 1000 |
| 총 시간 | 0.26ms |
| 평균 lookup | 0.00026ms |

주의:

이 값은 실제 브라우저 클릭 전체 시간이 아니다.
현재는 `intent id -> binding` Map lookup만 측정했다.
실제 click-to-panel 시간은 dev server와 브라우저에서 별도로 측정해야 한다.

## 6. Gate 결과

| Gate | 기준 | 결과 |
| --- | --- | --- |
| static editable token coverage | >= 30% | 통과 |
| static + simple `cn()` / `clsx()` coverage | >= 50% | 통과 |
| transform target | max <= 5ms | 통과 |
| supported patch | apply 성공 + syntax error 0 | 통과 |
| stale rejection | source mismatch 거부 | 통과 |

## 7. 결론

이번 스파이크는 핵심 patch 안전성 가정은 통과했다.

성공한 것:

- static `className` token 분석
- compile-time source binding 생성
- range patch
- source hash stale rejection
- intent operation/diff 최소 출력
- 수치 리포트 생성

아직 부족한 것:

- 대형 TSX 파일에서 transform time 5ms 목표 유지
- 실제 브라우저 click-to-binding 시간 측정
- 실제 AI 생성 코드 50-100개 corpus 검증
- simple `cn()` / `clsx()` patch 구현

다음 판단:

```text
M1 vertical slice는 계속 진행할 가치가 있다.
단, transform 성능 최적화와 실제 corpus audit을 다음 우선순위로 둔다.
```
