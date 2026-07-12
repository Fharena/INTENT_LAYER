# INTENT_LAYER MVP 데모 워크스루

이 문서는 현재 사용자에게 보여줄 수 있는 MVP 데모 경로를 정리한다. 지원하지 않는 케이스를 일부러 피하고, deterministic edit loop가 끝까지 동작하는지만 증명한다.

## 1. 로컬 저장소 데모

INTENT_LAYER 저장소에서 실행한다.

```bash
npm install
npm run typecheck
npm run test
npm run dev
```

dev server가 출력한 Vite URL을 연다.

기대 동작:

- React/Tailwind 데모 페이지가 열린다
- floating Intent Layer overlay가 보인다
- overlay에서 pick mode에 들어갈 수 있다

## 2. Click-To-Patch 흐름

MVP 데모에서는 이 좁은 시나리오를 사용한다.

1. `Pick element`를 클릭한다.
2. 화면에 보이는 `Patch Preview` 카드 제목을 클릭한다.
3. overlay에서 첫 typography token을 `text-lg`에서 `text-xl`로 바꾼다.
4. `Preview`를 클릭한다.
5. preview가 full-file rewrite가 아니라 range patch인지 확인한다.
6. `Apply`를 클릭한다.
7. source가 바뀌고 페이지가 hot-refresh되는지 확인한다.
8. `Undo last`를 클릭한다.
9. 제목이 `text-lg`로 돌아오고 pending undo history가 비었는지 확인한다.

기대 artifact:

```text
.intent/graph.intent.json
.intent/operations/*.intent-op.json
.intent/operations/operation-log.json
.intent/diffs/*.intent-diff.yml
```

## 3. Grid Layout Composer 흐름

1. `선택`을 누르고 세 카드 중 아무 내부 텍스트나 클릭한다.
2. 가장 가까운 source-bound grid 조상의 `Grid 배치`가 나타나는지 확인한다.
3. `sm` breakpoint를 고른다. 데모의 12열, 5/3/4 배치가 mini grid와 placement strip에 표시된다.
4. 첫 항목을 1~6열, 두 번째 항목을 7~9열로 드래그한다.
5. `배치 미리보기`에서 두 className만 바뀌는지 확인한다.
6. `배치 적용` 뒤 TSX와 HMR 렌더가 `sm:col-span-6 sm:col-start-1`, `sm:col-span-3 sm:col-start-7`을 반영하는지 확인한다.
7. `되돌리기` 한 번으로 두 className이 함께 원복되고 pending undo가 비는지 확인한다.

이 직접 편집은 부모와 직계 자식이 같은 파일의 정적 className일 때만 활성화된다. `.map()`으로 같은 source id가 반복되거나 자식 구현이 다른 파일이면 이유를 표시하고 source를 건드리지 않는다.

비대칭 template은 `test-sites/lumina-atelier`의 hero grid로 확인한다. `md` 탭에서 `1.2 / 0.8` track 비율 slider를 바꾸면 `md:grid-cols-[1.2fr_0.8fr]` 한 토큰만 미리보기되고, 적용 뒤 HMR과 한 번의 되돌리기가 원문을 byte-for-byte 복원해야 한다. `minmax()`, CSS 변수, line name이 포함된 template은 이 데모 범위가 아니다.

## 4. 대상 프로젝트 Tarball 데모

로컬 package tarball을 만든다.

```bash
npm run typecheck
npm run test
npm pack
```

대상 React/Vite/Tailwind 프로젝트에 설치한다.

```bash
npm install /absolute/path/to/intent-layer-0.0.1.tgz
npx intent-layer init
```

`init` 결과에서 `vite.status`가 `configured`, `created`, `already-configured` 중 하나인지 확인한다. 동적 plugins 배열이면 `unsupported-config`로 끝나고 Vite 파일은 바뀌지 않아야 한다.

대상 프로젝트에서 확인한다.

```bash
npx intent-layer doctor
npx intent-layer check src --min-supported-direct 0.5 --max-file-transform-ms 20
npx intent-layer dev
```

## 5. Codex/Claude MCP 데모

1. 패널 `설정 > AI 연결`에서 사용할 provider를 켠다.
2. Codex 또는 Claude를 새 세션으로 시작한다.
3. 브라우저에서 카드를 선택한다.
4. AI에게 현재 선택한 카드의 gap 후보를 확인하고 6으로 미리보기하라고 요청한다.
5. `inspect → preview`가 정확한 한 줄 diff를 반환하는지 확인한다.
6. 승인 뒤 `apply → verify`를 수행하고 source와 렌더 인스턴스가 모두 verified인지 확인한다.
7. `intent_undo_edit`로 원복한다.

패키지 stdio 경로만 빠르게 검사할 때는 `npm run build:package && npm run test:mcp-package`를 사용한다.

Lumina 전체 브라우저 회귀는 `npm run test:e2e`로 실행한다. 이 테스트는 설정, 요소 선택, 비대칭 Grid 적용, HMR, exact undo와 모바일 축소/확대를 Chromium에서 확인한다.

## 6. 데모 중 강조할 말

포지셔닝은 이렇게 잡는다.

- 직접 편집은 deterministic range patch다.
- 단순 Tailwind token 변경에는 LLM을 호출하지 않는다.
- 지원하지 않는 동적 `className`은 위험하게 patch하지 않고 read-only handoff로 내려간다.
- AI도 raw source offset을 쓰지 않고 GUI와 같은 `IntentService`를 사용한다.
- 브라우저가 연결돼 있으면 HMR 뒤 렌더된 class token까지 검증한다.
- 적용된 patch는 review를 위해 operation과 intent diff artifact를 남긴다.
- Grid 배치는 여러 className을 하나의 guarded operation으로 preview/apply/undo한다.

## 7. 아직 데모하지 않을 것

다음 항목은 MVP ready flow처럼 말하지 않는다.

- Next.js adapter
- styled-components 또는 Emotion 편집
- 임의 CSS cascade 편집
- Figma import
- `node_modules` 내부 직접 편집
- 넓은 자연어 layout refactor를 deterministic patch처럼 처리하는 흐름
- Grid row/absolute placement, DOM reorder, cross-file layout transaction
- `minmax()`, CSS variable 또는 named line을 포함한 복합 arbitrary Grid template

지원하지 않는 케이스는 `handoff-required`와 정확한 source pointer로 보여준다. Markdown queue는 고급 호환성 데모에서만 사용한다.
