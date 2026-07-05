# Lumina Atelier 테스트 결과

실행 시각: 2026-07-05 16:13 KST

## 목적

`test-sites/lumina-atelier`를 별도 React/Vite/Tailwind 프로젝트처럼 만들고, local file dependency로 설치한 `intent-layer`가 실제 사이트에서 동작하는지 확인했다.

## 구성

- React 18
- Vite 6
- Tailwind CSS 3
- `intent-layer`: `file:../..`
- Vite plugin 순서: `plugins: [intentLayer(), react()]`

## 검증 명령

| 명령 | 결과 |
| --- | --- |
| `npm install` | 통과, 0 vulnerabilities |
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 |
| `npm run intent:doctor` | 통과, 10 pass / 0 warn / 0 fail |
| `npm run intent:scan` | 통과, `.intent/graph.intent.json` 생성 |
| `npm run intent:check` | 통과 |

## Intent 측정값

최종 `npm run intent:check` 기준:

| 항목 | 값 |
| --- | ---: |
| files scanned | 2 |
| files with bindings | 1 |
| binding count | 58 |
| direct edit bindings | 57 |
| read-only bindings | 0 |
| token count | 290 |
| editable token count | 231 |
| supported direct coverage | 98.28% |
| editable token coverage | 79.66% |
| syntax errors | 0 |
| average transform | 5.556ms |
| max transform | 11.100ms |

## Dev Server Patch Smoke

로컬 dev server: `http://127.0.0.1:5174/`

`/__intent/graph`에서 `src/App.tsx`의 `gap-10` binding을 선택해 `gap-10 -> gap-12` patch를 preview/apply/revert 했다.

| 단계 | 결과 |
| --- | ---: |
| preview | 통과, 0.494ms |
| apply | 통과, 12.547ms |
| undo pending after apply | 1 |
| graph token after apply | `gap-12` |
| revert | 통과, 10.604ms |
| graph token after revert | `gap-10` |

## Browser QA

In-app browser로 확인했다.

| 항목 | 결과 |
| --- | --- |
| desktop page load | 통과 |
| H1 | `Lumina Atelier` |
| section count | 4 |
| image load | 5/5 complete |
| `data-intent-id` count | 84 |
| mobile 390px horizontal overflow | 없음 |

## 발견한 이슈

초기 설정에서 `plugins: [react(), intentLayer()]`를 사용했을 때 `source-hash-mismatch`로 direct patch가 안전 거부됐다.

원인은 React Refresh transform 뒤의 코드 기준으로 intent binding이 생성되어, source hash와 source range가 실제 `src/App.tsx`와 달라졌기 때문이다. 해결은 `intentLayer()`를 `react()`보다 앞에 두는 것이다.

이에 따라 `INSTALL_KR.md`와 `INSTALL_EN.md`의 Vite config 예시도 `plugins: [intentLayer(), react()]`로 수정했다.

