# INTENT_LAYER

[English](./README.md)

INTENT_LAYER는 React/Tailwind 화면을 브라우저에서 클릭하고, 해당 JSX 소스와 Tailwind 토큰을 확인한 뒤 작은 변경을 결정론적으로 적용하는 개발 도구다.

현재 제품 판단은 **동작하는 alpha**다. 사람은 브라우저 패널을, Codex와 Claude는 같은 로컬 MCP 도구를 사용한다. 두 경로 모두 동일한 source binding, 최소 패치, hash 검증과 undo를 거치며, 모든 React 표현식이나 Tailwind 설정을 편집하는 범용 도구는 아니다.

## 핵심 흐름

```text
화면 요소 선택
  -> 소스 파일, 컴포넌트, source hash 확인
  -> 편집 가능한 Tailwind 토큰 선택
  -> 후보를 DOM에만 임시 반영
  -> diff 미리보기
  -> 최소 range patch 적용
  -> 소스와 렌더 결과 검증
  -> 최신 패치 되돌리기
```

간단한 토큰 교체에는 LLM을 호출하지 않는다. 소스 해시나 토큰 위치가 달라졌으면 파일을 수정하지 않고 거부한다.

## 5분 시작

저장소에서 데모를 실행한다.

```bash
npm install
npm run dev
```

브라우저에서 Vite 주소를 열면 Intent Layer 패널이 나타난다.

1. 첫 설정에서 언어와 패널 위치를 고르고, 필요하면 Codex 또는 Claude 연결을 켠다.
2. `설정 완료`를 누른다.
3. `선택`을 누르고 화면 요소를 클릭한다.
4. 토큰 후보를 고르면 DOM에서 먼저 확인할 수 있다. 원복하거나 `미리보기`, `적용` 순서로 source 변경을 확정한다.
5. 문제가 있으면 `되돌리기`를 누른다.

한 줄짜리 순수 JSX text는 같은 패널에서 직접 고칠 수 있다. 표현식, entity, 중첩 element가 섞인 text는 source 의미가 달라질 수 있으므로 read-only다.

선택한 요소가 CSS Grid 안에 있으면 가장 가까운 grid 조상의 `Grid 배치`가 자동으로 열린다. breakpoint를 고르고 열·행 수와 각 자식의 열·행 범위를 GUI로 조정한 뒤 그룹 diff를 한 번에 적용하거나 되돌릴 수 있다. 가장 가까운 layout이 Flex면 `Flex 배치`에서 방향, wrap, 주축/교차축 정렬, gap, 자식별 `align-self`를 조정한다.

설정은 나중에도 패널의 `설정`에서 바꿀 수 있다. AI 연결을 켜면 프로젝트 로컬 `.codex/config.toml` 또는 `.mcp.json`에 Intent Layer 항목만 병합한다. 전역 설정은 수정하지 않는다.

## 다른 Vite 프로젝트에 설치

Node.js 20 이상이 필요하다. `npm view intent-layer@alpha version`이 아직 실패하는 동안에는 로컬 tarball로 검증한다.

```bash
npm pack
cd <target-vite-project>
npm install <intent-layer-tarball>
npx intent-layer init
npm run dev
```

첫 registry alpha가 확인된 뒤에는 tarball 대신 다음을 사용한다.

```bash
npm install -D intent-layer@alpha
npx intent-layer init
npm run dev
```

`intent-layer init`은 `.intent` workspace를 만들고 TypeScript AST로 Vite 설정을 확인한 뒤 `intentLayer()`를 React plugin보다 앞에 최소 삽입한다. 이미 설정돼 있으면 파일을 바꾸지 않는다. 정적인 `defineConfig({...})` 또는 plugins 배열이 아니면 추측해서 다시 쓰지 않고 실패 이유를 반환한다.

Vite 설정 파일이 없지만 `@vitejs/plugin-react`가 설치된 일반 React 프로젝트라면 표준 `vite.config.ts`를 만든다. 이후 설정 변경은 브라우저 패널에서 처리한다.

## 상세 사용법

### 1. 실행 상태 확인

Intent Layer는 Vite **개발 서버에서만** 패널과 source binding을 주입한다. Production build에는 패널이나 `data-intent-id`가 들어가지 않는다.

1. 대상 프로젝트에서 `npm run dev`를 실행한다.
2. 터미널에 표시된 `localhost` 또는 `127.0.0.1` 주소를 같은 컴퓨터의 브라우저에서 연다.
3. 화면 가장자리의 `Intent Layer` 패널이 나타나는지 확인한다.
4. 패널이 접혀 있으면 `펼치기`를 누른다.
5. 상태가 `설정 필요`라면 설정을 완료한다. `준비`라면 바로 요소를 선택할 수 있다.

패널이 전혀 보이지 않으면 `npx intent-layer doctor`를 실행하고 다음을 확인한다.

- `vite.config.*`에 `intentLayer()`가 있고 React plugin보다 앞에 있는지 확인한다.
- 패키지를 새로 설치했다면 dev server를 완전히 종료하고 다시 시작한다.
- 다른 PC나 휴대폰에서 연 LAN 주소는 화면 확인만 가능하며 source 변경은 거부된다.
- Next.js dev tools와 겹치지 않도록 별도 overlay root를 사용하지만, 현재 공식 실행 경로는 Vite다.

### 2. 처음 설정

처음 열리면 패널 안에서 다음 항목을 정한다.

1. `언어`에서 `한국어` 또는 `English`를 고른다.
2. `패널 위치`에서 왼쪽/오른쪽을 고른다.
3. `밀도`에서 기본/컴팩트를 고른다.
4. 다음 새로고침부터 작게 시작하려면 `시작 시 접기`를 켠다.
5. 설정이 비어 있을 때 자동으로 설정 화면을 열려면 `설정 필요 시 자동 열기`를 유지한다.
6. Codex 또는 Claude를 사용할 때만 `AI 연결`의 provider를 켠다.
7. `설정 완료`를 누른다.

완료되면 `.intent/settings.json`과 필요한 workspace가 생성된다. 기대 상태는 다음과 같다.

- `워크스페이스 준비`: `.intent/` 폴더를 사용할 수 있다.
- `소스 binding 준비`: 현재까지 Vite가 변환한 JSX/TSX 요소가 graph에 들어왔다.
- `AI 연결 준비`: 선택한 provider의 프로젝트 로컬 MCP 설정과 빌드된 server entry가 확인됐다.

`소스 binding 대기`는 설치 실패가 아닐 수 있다. 편집할 route를 브라우저에서 한 번 렌더한 뒤 다시 선택한다. 아직 방문하지 않은 lazy route의 요소는 Vite가 변환하기 전까지 graph에 없다.

### 3. 요소 선택과 근거 확인

1. 패널 상단의 `선택`을 누른다.
2. 페이지에서 고칠 실제 UI를 클릭한다. 패널 자체와 알려진 dev-tool UI는 선택 대상에서 제외된다.
3. `선택된 소스`에서 component, project-relative 파일, source hash, class 모드를 확인한다.
4. `공유 source`가 표시되면 같은 JSX binding을 사용하는 렌더 개수를 확인한다.
5. `검증 근거`가 read-only라면 이유를 먼저 읽고 직접 적용을 시도하지 않는다.

커스텀 React component 호출부를 클릭해도 prop 이름을 DOM이라고 추측하지 않는다. 실제로 렌더된 `div`, `button`, `section` 같은 intrinsic JSX 구현 위치를 사용한다. `.map()`으로 같은 source node가 여러 번 렌더된 경우 한 번의 source 편집이 모든 인스턴스에 적용될 수 있으므로 공유 렌더 수를 반드시 확인한다.

조건부 `cn()`/`clsx()`에서는 현재 클릭한 DOM에 실제로 활성인 literal token만 보여준다. 다른 조건 분기를 수정하려면 앱 상태를 먼저 바꾸고 해당 분기가 렌더된 뒤 요소를 다시 선택한다.

### 4. Tailwind 속성 수정

1. `직접 수정`에서 바꿀 속성을 찾는다. 색상은 swatch, spacing은 이전/다음 값 control, 나머지는 후보 option으로 표시된다.
2. 후보를 고른다. 이 시점에는 **DOM 미리보기만** 바뀌고 source 파일은 그대로다.
3. 결과가 마음에 들지 않으면 `미리보기 원복`을 누르거나 다른 후보를 고른다.
4. source diff를 만들려면 해당 속성의 `미리보기`를 누른다.
5. old/new token, 파일과 변경 범위를 검토한다.
6. `적용`을 누른다. 서버가 source hash와 원래 token을 다시 확인한 뒤 최소 range만 쓴다.
7. HMR 뒤 화면과 상태 메시지를 확인한다.
8. 결과가 잘못됐으면 다른 source 작업을 하기 전에 `되돌리기`를 누른다.

후보를 고르는 동작과 source `미리보기`는 다르다. 전자는 브라우저에서만 임시 확인하고, 후자는 적용 가능한 expiring patch를 서버에 만든다. `적용` 버튼은 서버 미리보기가 성공하기 전까지 잠겨 있다.

### 5. 문구 수정

선택한 intrinsic 요소에 직접 연결된 plain JSX text가 정확히 하나 있으면 `문구 수정`이 나타난다.

1. textarea에서 문구를 바꾼다.
2. `텍스트 미리보기`를 눌러 source diff를 만든다.
3. 범위를 확인하고 `텍스트 적용`을 누른다.
4. HMR 결과를 확인하거나 `되돌리기`로 원복한다.

빈 문자열, 500자 초과, 앞뒤 공백, 줄바꿈, `<>{}&`, expression, entity, 중첩 element가 포함된 문구는 직접 수정하지 않는다. 버튼 안의 icon과 text 구조를 바꾸는 작업처럼 JSX 구조가 달라지는 변경은 Codex/Claude 일반 코드 작업으로 넘긴다.

### 6. Grid 배치 수정

Grid 부모의 좁은 빈 공간을 정확히 클릭할 필요는 없다. Grid 자체나 그 안쪽 자식/하위 요소를 선택하면 가장 가까운 지원 Grid를 찾는다.

1. Grid 안의 요소를 선택하고 `Grid 배치`가 나타나는지 확인한다.
2. `base`, `sm`, `md` 또는 project breakpoint tab을 고른다.
3. 부모의 열 수와 행 수를 조정한다.
4. 각 직계 자식의 시작 열/행과 span을 조정한다.
5. 단순 양수 `fr` template이면 `비율` control로 track 비율을 조정한다.
6. 작은 canvas에서 배치 결과를 확인한다.
7. `배치 미리보기`로 부모와 자식의 grouped diff 전체를 확인한다.
8. `배치 적용`을 누른 뒤 HMR을 확인한다.
9. 문제가 있으면 `되돌리기`로 그룹 전체를 byte-for-byte 원복한다.

Responsive tab에서는 explicit 값과 상속된 effective 값이 다를 수 있다. `자동 배치로 되돌리기` 또는 override 제거는 해당 breakpoint token을 없애 상위 값을 다시 상속하게 한다. Base에서 필수 grid column 정의까지 제거하는 요청은 거부된다.

반복 source id, source binding이 없는 DOM 직계 자식, 다른 파일의 자식, 동적 className, `minmax()`/CSS 변수/named line 같은 복합 template은 일부만 적용하지 않고 Grid 전체를 read-only로 둔다. DOM 순서를 바꾸는 drag/reorder도 현재 지원하지 않는다.

### 7. Flex 배치 수정

1. 기존 `flex` 또는 `inline-flex` container 안의 요소를 선택한다.
2. `Flex 배치`에서 breakpoint를 고른다.
3. 방향과 줄바꿈 mode를 고른다.
4. 주축 정렬, 교차축 정렬과 gap을 고른다.
5. 필요한 직계 자식의 `개별 정렬`(`align-self`)을 바꾼다.
6. Flex canvas에서 방향, wrap, 정렬과 간격을 확인한다.
7. `배치 미리보기`에서 모든 className 변경을 확인하고 `배치 적용`을 누른다.
8. 잘못됐으면 그룹 `되돌리기`를 사용한다.

Canvas는 실제 생성된 CSS utility나 project spacing variable을 우선 읽는다. 브라우저에서 아직 생성되지 않은 custom utility는 근사 미리보기일 수 있으므로 grouped source diff를 최종 근거로 사용한다. `gap-x`/`gap-y`가 섞인 축별 gap, unknown plugin utility와 DOM reorder는 직접 편집하지 않는다.

### 8. 적용 범위와 되돌리기

직접 편집은 DOM 한 개가 아니라 **source binding 범위**다. 같은 component source가 세 번 렌더됐다면 class token 변경도 세 인스턴스에 반영된다. 패널의 `단일 렌더`/`공유 source` 표시를 적용 전에 확인한다.

`되돌리기`는 operation journal에서 가장 최근의 안전한 pending 작업을 대상으로 한다. 적용 뒤 다른 도구나 사람이 파일을 수정해 source hash가 달라지면 저장 offset을 억지로 쓰지 않는다. 파일은 보존하고 `되돌리기 충돌`과 `.intent/conflicts/` artifact를 남긴다. 이때 현재 source를 검토한 뒤 새로 선택해서 다시 편집하거나, 더 이상 되돌리지 않을 작업만 명시적으로 discard한다.

### 9. 설정 변경, AI 연결 해제와 온보딩 재실행

처음 설정을 다시 할 필요 없이 패널 상단의 `설정`을 누르면 일반 설정을 바꿀 수 있다.

- 언어, 패널 위치, 밀도와 시작 접힘은 저장 직후 또는 다음 새로고침부터 반영된다.
- Codex/Claude toggle을 끄고 저장하면 Intent Layer가 관리하는 프로젝트 로컬 MCP 항목만 제거한다. 다른 MCP 설정은 보존한다.
- AI 연결을 켜거나 끈 뒤에는 이미 열린 Codex/Claude 세션을 종료하고 새 세션을 시작한다.
- `온보딩 다시 보기`는 다음 실행 때 처음 설정 화면을 다시 연다. 기존 source와 operation을 삭제하지 않는다.
- `기존 Agent 큐 (고급 호환성)`과 `Agent 실행 허용`은 일반 MCP 사용에 필요하지 않다. 명확한 호환성 이유가 없으면 끈 상태로 둔다.

### 10. 로컬 tarball 업데이트와 재설치

현재 alpha를 다른 프로젝트에서 갱신할 때는 dev server를 먼저 종료한다.

```bash
cd <intent-layer-source>
npm pack

cd <target-vite-project>
npm install --force <absolute-path-to-intent-layer-tarball>
npx intent-layer init
npm run dev
```

`intent-layer init`은 반복 실행해도 이미 등록된 plugin을 중복 삽입하지 않는다. 재설치해도 `.intent/settings.json`, operation 기록과 provider 선택은 유지된다. pnpm의 로컬 `file:` dependency를 사용한다면 package cache가 이전 tarball을 유지할 수 있으므로 `pnpm install --force`로 갱신한 뒤 dev server를 다시 시작한다.

완전히 제거하려면 먼저 설정에서 Codex/Claude 연결을 끄고 저장한다. 그다음 dev server를 종료하고 `vite.config.*`의 `intentLayer` import와 `intentLayer()` plugin 항목을 제거한 뒤 package를 uninstall한다. `.intent/`에는 undo/충돌/평가 기록이 있을 수 있으므로 필요한 기록을 확인한 후에만 삭제한다.

## 검증된 호환성

아래에서 "지원"은 이름이 비슷한 기술 전반이 아니라, 2026-07-12 현재 자동 테스트나 실제 브라우저 라운드트립이 있는 범위를 뜻한다.

| 영역 | 현재 검증된 범위 | 아직 정식 지원이 아닌 범위 |
| --- | --- | --- |
| Runtime | Node.js 20/22 CI, Windows 로컬 Node.js 22.16, npm, pnpm 10.34.5 설치/빌드 gate와 실제 pnpm 브라우저 round trip | Node.js 18 이하, yarn/bun 설치 흐름 |
| React | React 18.3.1과 19.2.7, intrinsic JSX, fragment/conditional/map traversal, `forwardRef`, `Suspense`/portal 안 JSX, import 출처가 확인된 `createElement` | React Server Components, React Native, `cloneElement` source provenance |
| Vite | Vite 6.4.3과 8.1.4 dev server, HMR, 원본 TSX로 합성되는 source map, `.intent` runtime artifact 감시 제외, 정적 config 설정, production 계측 0건 검사 | SSR/library mode, 동적 config 자동 수정 |
| TypeScript | TypeScript 5.9.3 parser, TSX 전체 라운드트립, JSX/TSX 파일 계측 | 빌드된 JSX runtime 호출 분석, 임의 Babel/SWC transform 뒤 source 복원 |
| Tailwind | Tailwind CSS 3.4.19와 4.3.2 브라우저 흐름, 정적 `tailwind.config.*`, v4 `@theme`, variant 보존, 수치로 정렬 가능한 project breakpoint | 동적 config 실행, `raw`/max-only screen 상속, plugin utility의 임의 의미 추론 |
| Tailwind v4 | `@tailwindcss/vite` 설치, `@theme` 색상 후보, DOM 미리보기, HMR patch와 정확한 undo | 외부 plugin이 만든 임의 utility 의미 추론 |
| Browser/OS | Playwright Chromium 149, Windows 로컬, GitHub Actions Ubuntu 경로 | Firefox, WebKit/Safari, macOS |

React Hook, Context, `memo`, `lazy` 같은 API를 오버라이드하지는 않는다. 해당 API를 쓰더라도 프로젝트 소스 안에 intrinsic JSX와 지원 가능한 `className`이 남아 있으면 같은 AST 경로로 처리하며, Hook이 runtime에서 조합한 문자열 자체는 해석하지 않는다. 커스텀 컴포넌트의 `className` prop 호출부도 DOM node로 추측하지 않고, 실제로 렌더된 intrinsic 요소의 구현 소스에 바인딩한다.

## 직접 편집 범위

현재 직접 편집은 JSX의 정적 `className`, `cn()`/`clsx()` 안의 문자열 리터럴, intrinsic `React.createElement()`, 그리고 정적 className이 있는 intrinsic JSX의 단일·한 줄 literal text를 대상으로 한다.

- spacing: padding, margin, gap의 표준 Tailwind scale
- sizing: width, height, min/max, size
- layout: display, grid columns/rows, flex, align/justify, numeric `col-start`/`col-span`/`row-start`/`row-span`
- radius와 typography 크기/굵기/line-height
- 표준 Tailwind color family와 프로젝트 `tailwind.config.*`, Tailwind v4 `@theme`, 보수적으로 식별한 CSS 변수 후보
- shadow, opacity, ring width, transition

후보가 자기 자신 하나뿐인 토큰은 편집 가능으로 표시하지 않는다. 프로젝트 theme는 실행하지 않고 정적 AST/CSS만 읽으며 프로젝트 후보를 기본 palette보다 먼저 보여준다. 해석할 수 없는 동적 config, `cva`, runtime 변수, property access, template expression은 inspect 가능하지만 직접 패치하지 않는다.

`cn()`/`clsx()` literal binding에서는 클릭한 DOM 인스턴스의 실제 class 목록과 비교해 비활성 조건 분기 토큰을 편집 목록에서 숨긴다. 후보를 고르면 source를 건드리지 않고 같은 source binding에서 기존 token이 활성인 렌더만 임시 교체하며, runtime drift가 없으면 원래 `class` 문자열을 그대로 복원한다. 색상은 swatch, spacing은 수치 순서 `-`/`+` control을 제공하고, source `적용`은 서버 diff 미리보기가 성공하기 전까지 잠겨 있다.

Grid Layout Composer는 같은 TSX 파일의 정적 `className`을 가진 기존 grid와 직계 자식만 직접 편집한다. Tailwind 기본 breakpoint와 정적으로 읽은 min-width project breakpoint에서 1~12개의 `grid-cols`/`grid-rows`, `col-start`/`col-span`, `row-start`/`row-span`을 그룹 작업으로 추가·교체·제거한다. `grid-cols-[1.2fr_0.8fr]` 같은 단순 양수 `fr` template은 track 비율 slider로 조정한다.

Flex Layout Composer도 같은 파일·정적 className·유일한 직계 자식 binding 계약을 사용한다. 기존 base `flex`/`inline-flex` container의 direction, wrap, justify, align, project gap과 자식 `align-self`만 편집한다. 반복 source id, 교차 파일 자식, `gap-x`/`gap-y`가 섞인 축별 간격, 임의 plugin token, DOM reorder는 부분 적용하지 않고 read-only로 내린다.

## 안전 규칙

- JSX는 TypeScript AST 한 경로로 분석한다. 문자열이나 주석 속 JSX 모양 텍스트는 instrumentation하지 않는다.
- `data-intent-id`와 overlay client는 Vite 개발 서버 transform에만 넣고 디스크 소스와 production bundle에는 쓰지 않는다.
- apply 전 binding source hash와 원래 토큰을 모두 확인한다.
- preview와 apply 사이에 파일이 바뀌어도 다시 거부한다.
- undo는 적용 후 전체 source hash가 맞는 **최신 pending patch**만 처리한다.
- 여러 Codex/Claude 프로세스의 apply와 undo는 프로젝트 operation lock으로 직렬화하며 저널은 atomic write한다.
- 브라우저 선택은 Vite session별 파일로 보존하고 현재 선택에 `sessionId`와 유효시간을 포함한다. 여러 Vite 서버의 graph publish는 각 서버가 소유한 파일만 교체하고 나머지 파일을 병합한다.
- drift가 있으면 파일 대신 `.intent/conflicts/`에 conflict artifact를 남긴다.
- patch는 전체 파일 codegen이 아니라 원래 source range만 교체한다.
- Grid/Flex 그룹 편집은 모든 className 원문과 source hash를 먼저 검증하고 같은 파일을 한 번만 쓴다. undo는 적용 후 range 전체를 검증한 뒤 그룹을 byte-for-byte 복원한다.
- source를 바꾸는 Vite HTTP 요청은 loopback 연결과 overlay 세션 토큰을 모두 요구한다. LAN 주소로 연 preview는 읽을 수 있어도 편집은 거부된다.

## Codex와 Claude에서 사용

설정에서 provider 연결을 켠 뒤 Codex 또는 Claude를 새로 시작하면 다음 로컬 MCP 도구를 사용할 수 있다.

- `intent_find_elements`, `intent_inspect_element`
- `intent_inspect_layout`, `intent_preview_layout`
- `intent_preview_edit`, `intent_apply_edit`
- `intent_verify_edit`, `intent_undo_edit`

연결과 실제 사용 순서는 다음과 같다.

1. Vite dev server와 편집할 브라우저 route를 먼저 연다.
2. 패널 `설정 > AI 연결`에서 Codex 또는 Claude를 켜고 저장한다.
3. Codex는 `.codex/config.toml`, Claude는 `.mcp.json`의 기존 설정을 유지한 채 `intent-layer` 항목이 생겼는지 확인한다.
4. 이미 열려 있던 AI 세션은 종료하고 **새 세션**을 시작한다. 현재 alpha는 실행 중 세션의 MCP hot reload를 전제로 하지 않는다.
5. 브라우저에서 요소를 선택한 뒤 평소 문장으로 작업을 요청한다. Agent가 필요할 때 MCP 도구를 호출하며 사용자가 도구 이름을 직접 입력할 필요는 없다.
6. AI가 반환한 preview diff를 검토한다. “미리보기만” 요청했다면 적용 승인 전 source는 바뀌지 않아야 한다.
7. 적용 뒤 verify 결과를 확인하고 필요하면 같은 대화에서 undo를 요청한다.

요청 예시:

```text
브라우저에서 선택한 카드의 gap 후보를 확인하고 6으로 미리보기해줘. 아직 적용하지 마.
방금 미리보기를 적용하고 source와 runtime을 검증해줘.
현재 선택한 Flex를 md에서 세로 방향, gap-6으로 바꾸고 첫 자식만 가운데 정렬해줘. grouped diff부터 보여줘.
방금 Intent Layer 작업을 되돌려줘.
```

MCP client가 source 변경 도구 승인을 묻는 경우 preview 내용을 확인한 뒤 승인한다. Codex와 Claude를 동시에 열어도 프로젝트 operation lock이 source 적용을 직렬화하지만, 같은 요소를 두 provider에 동시에 지시하는 사용 방식은 피한다.

일반 속성과 literal text는 `find → inspect_element → preview_edit → apply → verify → optional undo` 순서로 처리한다. Grid/Flex는 브라우저에서 대상 안쪽 요소를 먼저 고른 뒤 `inspect_layout → preview_layout`을 사용하고, 적용·검증·되돌리기는 같은 도구를 재사용한다.

브라우저 선택은 `intent://selection/current`로 공유되며, 가장 가까운 Grid/Flex 부모와 source-bound 직계 자식 범위도 함께 저장된다. AI는 source offset, raw patch, layout 부모나 전체 자식 범위를 제출하지 못한다. 서버는 30분 안의 현재 선택에서 범위를 해석하고, 반복 렌더 부모, unbound/중복 자식, 동적 className 또는 교차 파일 참여자를 다시 거부한다. apply는 expiring preview, source hash, 파일 잠금과 idempotency key를 재검증한다.

단일 class token은 브라우저가 연결돼 있으면 HMR 뒤 모든 렌더 인스턴스도 확인한다. 이 경로에서 `runtime: unavailable`은 source가 온전해도 `ok: false`지만 MCP 실행 오류는 아니다. Literal text와 grouped Grid/Flex는 현재 source 검증만 수행하므로 `ok: true`, `runtime: unavailable`일 수 있으며, 이를 시각 검증 성공으로 해석하면 안 된다. Source drift나 missing operation은 계속 tool error다.

직접 지원하지 않는 구조 변경은 `handoff-required`로 내려가며, Agent가 일반 코드 편집으로 처리할 수 있도록 정확한 source pointer를 제공한다. 기존 Markdown queue와 HTTP 경로는 기본적으로 꺼져 있으며 설정의 고급 호환성 toggle을 명시적으로 켠 프로젝트에서만 열린다.

MCP 서버를 직접 확인할 때만 CLI를 사용한다.

```bash
npm run build:package
node dist/cli.js mcp --root .
```

## 검증

일상 검증:

```bash
npm run typecheck
npm run test
npm run test:e2e:install
npm run test:e2e
npm run build
npm run test:production-build
npm run test:mcp-package
```

출시 전 전체 검증:

```bash
npm run verify
```

`npm run verify`는 typecheck, Vitest, package/demo build, production bundle 오염 검사, 설치 package MCP smoke, Chromium E2E, 고정 버전 pnpm 설치/빌드, 평가 gate와 제품 A/B 집계를 순서대로 실행한다. `npm run eval`은 그중 tarball 설치, 설치된 CLI와 Vite export/type declaration, 실제 Vite HTTP preview/apply/revert, multi-file graph refresh, 외부 corpus와 62개 성능·안전 gate를 담당한다. 현재 텍스트·Grid·Flex는 각각 20회 grouped round trip에서 부분 쓰기 0건과 byte restore 20/20을 기록했다. 현재 p95와 gate 결과는 실행할 때마다 [spike-evaluation.json](./reports/performance/spike-evaluation.json)에 갱신하며, 로컬 기계 지연을 사용자 가치 A/B로 해석하지 않는다.

`test:e2e`는 React 18/Tailwind 3 Lumina와 React 19/Tailwind 4 Modern fixture에서 설정, 선택, literal text, Grid 행/custom breakpoint, Flex, runtime 조건 분기, DOM 미리보기, HMR, 원본 TSX source map, byte-for-byte undo와 모바일 panel을 검증한다. Modern fixture는 실행 전에 pnpm의 로컬 `file:` package 사본을 강제로 갱신하므로 이전 `dist`로 통과할 수 없다. 하나라도 실패하면 exit code 1로 끝난다. 상세 결과는 [spike-evaluation.json](./reports/performance/spike-evaluation.json)에 기록된다.

테스트용 OS temp와 Playwright browser는 저장소의 `.intent/tmp/` 아래에 둔다. Windows에서는 workspace와 다른 드라이브의 temp 경로를 거부하므로, D 드라이브 저장소 테스트가 다시 C 드라이브를 채우지 않는다.

`npm run benchmark:mcp`는 inspect, preview, apply, undo와 in-memory MCP 호출의 로컬 기계 지연을 [mcp-alpha-evaluation.json](./reports/performance/mcp-alpha-evaluation.json)에 기록한다. 이 수치는 Agent 작업 성공률이나 제품 가치를 증명하지 않는다.

실제 브라우저 선택부터 stdio MCP 적용, 3개 재사용 인스턴스 검증과 undo까지의 기록은 [mcp-browser-roundtrip.json](./reports/performance/mcp-browser-roundtrip.json)에 있다.

외부 corpus 수치는 **현재 allowlist가 관찰된 토큰 중 몇 개에 후보를 제공하는지**를 나타낸다. 실제 편집 성공률이나 패치 품질을 뜻하지 않는다. `npm run eval:product-ab`는 독립 사용자의 동일 작업 Intent Layer/프롬프트 조건을 쌍으로 집계한다. 현재 [product-ab-evaluation.json](./reports/performance/product-ab-evaluation.json)은 표본 0의 `collecting` 상태이며, 5명·5개 저장소·20개 paired task(40회 실행)와 독립성 gate가 모두 통과하기 전에는 제품 우위를 주장하지 않는다.

[외부 호환성 파일럿](./reports/performance/external-compatibility-pilot.json)은 고정된 공개 저장소 5개에서 193개 파일, 1,706개 binding, 가중 직접 편집 binding coverage 84.58%와 pnpm 브라우저 apply/undo 1회를 기록한다. 저자가 직접 실행했고 prompt-only 쌍이 없으므로 이 수치는 독립 A/B에 포함하지 않는다. 파일럿에서 발견한 Vite runtime artifact 재로딩과 pnpm 로컬 패키지 캐시 문제는 각각 회귀 테스트와 강제 재설치 gate로 고정했다.

## 독립 사용자 A/B 테스트 운영

이 테스트의 질문은 "기계적으로 빠른가"가 아니라 **같은 UI 수정에서 Intent Layer가 prompt-only보다 사용자의 첫 성공을 더 빠르고 정확하게 만드는가**다. 저자가 두 조건을 직접 돌린 결과, 합성 Agent 실행, corpus coverage, 로컬 benchmark는 독립 사용자 증거로 세지 않는다.

### 최소 표본과 독립성 기준

- 제품 구현과 정답 작성에 참여하지 않은 익명 참가자 5명 이상
- 서로 다른 실제 React/Vite/Tailwind 저장소 5개 이상
- 사전에 정한 task 20개와 조건별 1회씩, 총 40회 실행
- 같은 `repository + repositoryCommit + taskId` 쌍은 서로 다른 두 참가자가 나눠 수행
- 한 참가자는 같은 task를 두 번 보지 않지만, 서로 다른 task에서는 두 조건을 모두 수행
- task 쌍 안에서는 Codex/Claude client, 모델, 추론 설정을 합친 `agentProfile`이 동일

20쌍은 제품 결정을 시작하기 위한 최소 gate일 뿐 통계적 유의성을 자동 보장하지 않는다. 성공률과 실패 원인을 먼저 보고, 성공한 실행의 시간만 비교하며, 표본이 작다는 한계를 결과와 함께 공개한다.

### 1. 참가자와 과제 준비

1. 참가자에게 녹화 여부, 수집 항목, 익명 보관 방식을 알리고 동의를 받는다. 이름이나 이메일 대신 `P01` 같은 ID만 쓴다.
2. 권한이 있는 저장소만 사용한다. 비공개 저장소 이름은 `repo-01`처럼 가명 처리하고 원시 관찰 파일을 공유 저장소에 commit하지 않는다.
3. 각 task를 10~20분 안에 끝낼 수 있는 한 가지 눈에 보이는 변경으로 제한한다. 예: "가격 카드 세 개의 간격을 한 단계 줄이고 모바일 열 수는 유지한다."
4. task마다 기준 commit, 시작 route/state, 허용 파일, 금지 파일, 시간 제한, 정확한 검증 명령과 눈으로 볼 성공 조건을 **실행 전에** 고정한다.
5. direct edit에 유리한 task만 고르지 않는다. 지원 범위 안/경계/Agent fallback이 필요한 과제를 사전에 섞고, 실패를 본 뒤 task를 제외하지 않는다.
6. 별도 비공개 배정표에 `pairId`, repository 별칭, commit, taskId, 참가자, condition, `agentProfile`, `runOrder`, 제한 시간, evaluator를 기록한다.

### 2. 조건과 교차 배정

`intent-layer` 조건은 설치와 첫 설정을 **타이머 전에** 끝내고 패널 또는 로컬 MCP를 사용할 수 있게 한다. `prompt-only` 조건은 Intent Layer Vite plugin과 MCP를 끈 채 같은 AI client/model과 일반 편집 도구만 사용한다. 설치 시간까지 재고 싶다면 이 제품 가치 실험과 섞지 말고 별도의 onboarding 연구로 기록한다.

배정은 실행 전에 무작위로 고정한다. 각 task의 두 조건을 다른 참가자에게 주고, 각 참가자가 다른 task에서 A/B를 비슷한 횟수로 맡도록 균형을 맞춘다. 실패 후 조건을 바꾸거나 더 숙련된 참가자로 교체하지 않는다.

예를 들어 T01의 Intent Layer를 P01이 맡았다면 T01의 prompt-only는 P02가 맡는다. P01은 T02 같은 **다른** task에서 prompt-only를 수행한다. 이렇게 하면 같은 사람이 정답을 기억하는 carryover와 사람별 숙련도 차이를 함께 줄일 수 있다.

정확히 5명·20개 task로 시작할 때는 배정표의 task 행을 한 번 무작위 정렬한 뒤 값을 고정한다. 0부터 센 행 `i`에서 Intent Layer 참가자 번호는 `(i mod 5) + 1`, prompt-only 참가자 번호는 `((i + 1) mod 5) + 1`로 정해 `P01`~`P05`에 배정한다. 그러면 각 참가자가 조건별 4회씩 수행하고 같은 pair의 참가자는 항상 다르다. 실제 실행 순서는 일정에 따라 섞어도 되지만 참가자별 시간 순서를 `runOrder`에 1부터 기록하고, 실패를 본 뒤 배정표를 다시 무작위화하지 않는다.

### 3. 실행 환경 고정

1. 각 실행은 같은 원본 commit에서 만든 새 clone 또는 worktree와 새 AI 대화에서 시작한다. Windows 임시 작업은 `D:\intent-layer-ab\<pair>-<condition>`처럼 D 드라이브에 둔다.
2. 두 조건 모두 의존성 설치, dev server 기동, route 이동과 초기 앱 상태 준비를 타이머 전에 끝낸다. cache warm-up 정책도 두 조건에 똑같이 적용한다.
3. `repositoryCommit`에는 조건별 설정 commit이 아니라 동일한 원본 source commit을 기록한다. Intent Layer 설치 파일은 task 결과 diff와 평가 대상에서 제외한다.
4. 참가자에게 같은 task 문구, 같은 제한 시간, 같은 성공 기준만 준다. 한 조건에만 source 위치나 정답 힌트를 추가하지 않는다.
5. 참가자는 다른 참가자의 화면, diff, 해결 프롬프트를 보지 않는다. 같은 task를 이미 본 사람은 그 task의 반대 조건에 참여하지 않는다.

### 4. 시간과 수치 정의

- `durationMs`: task 문구를 공개하고 참가자가 첫 선택 또는 첫 prompt를 시작한 시점부터, 검증이 통과하고 완료를 선언한 시점까지다. 제한 시간을 넘기면 `success: false`, `durationMs`는 제한 시간으로 기록한다.
- `success`: 조건을 모르는 evaluator가 최종 diff와 사전 검증을 보고 판정한다. 화면이 비슷해 보여도 검증 실패, 금지 파일 변경, 요구사항 누락은 실패다.
- `retryCount`: 첫 해결 시도 뒤 잘못된 결과를 고치기 위해 보낸 추가 수정 prompt 또는 새 적용 시도 수다. 탐색 질문과 최초 시도는 세지 않는다.
- `wrongTargetCount`: 잘못된 컴포넌트, binding 또는 파일을 실제로 수정해 되돌리거나 다시 고친 횟수다. 단순 hover나 적용 전 DOM 미리보기는 세지 않는다.
- `undoCount`: Intent Layer Undo, `git restore`, 수동 역수정처럼 이미 적용된 변경을 되돌린 횟수다.
- `unsupported`: Intent Layer direct-edit가 명시적 지원 경계로 내려가 Agent fallback을 사용했으면 Intent Layer 관찰값에 `true`를 기록한다. prompt-only 관찰값에는 `false`를 쓴다.

화면 녹화나 AI session export는 선택 사항이지만, 최소한 시작/종료 시각, 기준 commit, 최종 diff, 검증 출력과 evaluator 판정은 남긴다. evaluator에게는 조건명을 숨기고 익명화한 diff와 결과만 전달한다.

### 5. 관찰값 기록

원시 입력은 `reports/performance/product-ab-observations.jsonl`이며 한 줄에 JSON object 하나다. 이 파일은 개인정보와 비공개 저장소 정보가 섞일 수 있어 기본적으로 Git에서 제외된다. 공개 저장소에는 집계 결과인 `product-ab-evaluation.json`만 남긴다.

PowerShell에서 한 실행을 추가하는 예시는 다음과 같다. `agentProfile`은 client, 모델과 중요한 설정이 같은지 판별할 수 있는 고정 문자열로 작성한다.

```powershell
$observation = [ordered]@{
  version          = 2
  participantId    = "P01"
  runOrder          = 1
  agentProfile      = "codex-app:gpt-5-default-2026-07-13"
  taskId            = "T01-card-gap"
  repository        = "repo-01"
  repositoryCommit  = "0123456789abcdef"
  condition         = "intent-layer"
  success           = $true
  durationMs        = 184000
  retryCount        = 0
  wrongTargetCount  = 0
  undoCount         = 0
  unsupported       = $false
  evaluator         = "E01"
  recordedAt        = (Get-Date).ToUniversalTime().ToString("o")
}
$observation | ConvertTo-Json -Compress |
  Add-Content -Encoding utf8 reports/performance/product-ab-observations.jsonl
```

같은 task의 반대 조건은 `condition`, 참가자, `runOrder`와 실제 측정값을 바꿔 새 줄로 추가한다. 이미 기록한 줄을 평균값으로 덮어쓰지 않는다. 잘못 기록했다면 원본 증거를 확인해 해당 줄을 바로잡고 변경 이유를 비공개 배정표에 남긴다.

### 6. 집계와 판정

```bash
npm run eval:product-ab
```

명령은 JSONL을 검증하고 [product-ab-evaluation.json](./reports/performance/product-ab-evaluation.json)을 갱신한다. 잘못된 schema, 같은 task/condition 중복 또는 한 참가자의 `runOrder` 중복은 줄 번호나 관련 key와 함께 실패한다. 표본이 부족하거나 독립성 조건이 깨진 경우 명령 자체는 정상 집계되지만 `status: collecting`, `gates.complete: false`로 남는다.

`complete`에는 다음 조건이 모두 필요하다.

- 참가자 5명 이상, 저장소 5개 이상, paired task 20개 이상
- 모든 task에 두 조건이 존재
- task 쌍의 참가자가 서로 다름
- 모든 참가자가 서로 다른 task에서 두 조건을 모두 경험
- 참가자별 두 조건 실행 수 차이가 1 이하
- task 쌍의 `agentProfile`이 동일

판정 순서는 성공률과 `intentOnlySuccessCount`/`promptOnlySuccessCount`, wrong-target와 undo, retry, 성공 실행의 median duration 순서다. "첫 성공 시간 또는 retry 30% 개선"은 제품 가설이지 자동 승리 선언이 아니다. 실패 유형, unsupported 비율과 참가자 피드백까지 함께 보고 범위를 유지·축소·확장한다.

## 배포와 운영자 체크리스트

현재 저장소는 npm 첫 공개 전 alpha다. 닫힌 사용자 파일럿은 로컬 tarball이나 GitHub source로 진행할 수 있고, 공개 npm은 먼저 `alpha` dist-tag로 내보낸다. 독립 A/B와 초기 사용자 피드백이 통과하기 전에는 `latest` 또는 안정판으로 홍보하지 않는다.

### 사용자가 직접 해야 하는 일

다음 항목은 저장소 안의 Agent가 대신 완료할 수 없다.

- 독립 참가자 모집, 동의 획득, 비공개 저장소 사용 권한 확인과 A/B 일정 운영
- npm 계정 생성, 이메일 확인, 2FA 설정, 최종 package 이름과 소유권 결정
- GitHub PR 승인/merge, 저장소 공개 여부, default branch와 보호 규칙 설정
- 첫 `npm publish`의 로그인/2FA 승인과 GitHub Release 공개 승인
- 개인정보 처리 범위, 지원 연락처, 알파 중단/계속 여부와 `latest` 승격 결정

Codex는 release branch, 버전 변경, 테스트, tarball 검사, release note 초안과 실패 수정은 준비할 수 있다. 계정 보안, 사람 동의와 최종 공개 버튼은 소유자가 확인한다.

### 1. 일회성 계정과 저장소 준비

1. [npm](https://www.npmjs.com/) 계정을 만들고 이메일을 확인한 뒤 `npm login`, `npm profile enable-2fa auth-and-writes`로 로그인과 package write에 2FA를 켠다. recovery code는 저장소나 채팅에 넣지 않는다.
2. `npm whoami`가 의도한 소유자 계정을 반환하는지 확인한다. 조직 scope를 쓸 경우 해당 조직의 publish 권한도 확인한다.
3. package 이름을 최종 결정한다. `npm view intent-layer name version`이 `E404`를 반환하면 그 순간 등록되지 않았다는 뜻일 뿐 예약은 아니다. publish 직전에 다시 확인한다.
4. GitHub 저장소의 `Settings > Rules > Rulesets`에서 `main` 대상 branch ruleset을 만들고 pull request, `Core / Node 20`, `Core / Node 22`, `Evaluation gates`, `Browser / React compatibility` 통과를 요구하며 force push를 막는다. `v*` 대상 tag ruleset도 owner만 release tag를 만들 수 있게 검토한다. 자세한 항목은 [GitHub ruleset 규칙](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)을 따른다. Issues 또는 명시적 피드백 채널도 연다.
5. 공개 package에 포함되는 MIT [LICENSE](./LICENSE), repository/bugs/homepage metadata, 한영 README와 지원 범위를 사람이 최종 검토한다.
6. `.env`, token, private key, 원시 A/B JSONL, 고객 source, `.intent/` runtime 파일이 package나 commit에 들어가지 않는지 확인한다.

공식 절차는 [npm 공개 package 배포 문서](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)와 [GitHub Releases 문서](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases/)를 기준으로 한다.

### 2. release 후보 만들기

기능 branch를 바로 publish하지 않는다. PR을 `main`에 merge하고, 최신 `main`에서 별도 release branch를 만든다.

```bash
git status --short
git switch main
git pull --ff-only
git switch -c release/v0.1.0-alpha.1
npm ci
npm run verify
npm audit --omit=dev
npm pack --dry-run --json
```

`git status`에 개인 IDE 파일이나 원시 관찰값이 보이면 stage하지 않는다. `verify`는 모두 exit 0이어야 하고 `npm audit --omit=dev`는 production 취약점을 확인한다. dry-run 목록에서 `dist/`, LICENSE와 사용자 문서 외에 credential, `.intent/`, fixture, test output, source map이 뜻밖에 포함되지 않았는지 직접 읽는다.

첫 공개 후보 권장 버전은 `0.1.0-alpha.1`이다.

```bash
npm version 0.1.0-alpha.1 --no-git-tag-version
git diff -- package.json package-lock.json
git add package.json package-lock.json
git commit -m "chore: prepare v0.1.0-alpha.1"
git push -u origin release/v0.1.0-alpha.1
```

버전 PR의 CI가 모두 통과한 뒤 merge한다. npm version은 한번 공개하면 같은 번호를 다시 사용할 수 없으므로 publish 뒤 문제를 발견하면 내용을 덮어쓰지 말고 `alpha.2`로 올린다.

### 3. 첫 npm alpha 공개

최신 `main`에서 다시 전체 검증과 package 내용을 확인한다.

```bash
git switch main
git pull --ff-only
git status --short
npm ci
npm run verify
npm pack --dry-run --json
npm login
npm whoami
npm publish --access public --tag alpha
```

`--tag alpha`를 빼면 npm 기본값인 `latest`가 붙으므로 alpha에서는 생략하지 않는다. 성공하면 다음을 확인한다.

```bash
npm view intent-layer@0.1.0-alpha.1 name version dist.tarball
npm dist-tag ls intent-layer
```

`alpha: 0.1.0-alpha.1`이 보여야 한다. 인증 실패는 npm 계정/2FA와 package 소유권을 확인한 뒤 해결하고, publish가 실제 성공했는지는 `npm view`로 먼저 확인한다. 성공한 version에 다시 publish하지 않는다.

### 4. registry에서 새 설치 smoke test

source workspace의 `file:` dependency나 기존 `node_modules`를 재사용하면 registry package 결함을 놓칠 수 있다. D 드라이브의 새 React/Vite/Tailwind 테스트 프로젝트에서 **registry 버전**을 설치한다.

```powershell
Set-Location D:\
npm create vite@latest intent-layer-registry-smoke -- --template react-ts
Set-Location D:\intent-layer-registry-smoke
npm install
npm install -D tailwindcss @tailwindcss/vite intent-layer@alpha
```

새 template의 `vite.config.ts`에 Tailwind plugin을 추가한다.

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()]
});
```

`src/index.css`의 첫 줄에는 `@import "tailwindcss";`를 두고, 그다음 Intent Layer 설정과 검증을 실행한다. 자세한 Tailwind 부분은 [공식 Vite 설치법](https://tailwindcss.com/docs/installation/using-vite)을 따른다.

```powershell
npx intent-layer init
npx intent-layer doctor
npm run build
npm run dev
```

브라우저에서 다음을 실제로 확인한다.

1. 첫 설정 화면과 한국어 전환이 보인다.
2. 요소 선택, DOM-only 후보, source diff, 적용, HMR, 되돌리기가 한 번 완주한다.
3. Codex 또는 Claude 연결을 켰을 때 project-local 설정만 생기고 새 AI session에서 MCP 도구가 보인다.
4. dev server를 끈 뒤 `npm run build`가 통과하고 production bundle에 패널이나 `data-intent-id`가 없다.
5. package 제거/재설치 후 dev server를 재시작해도 설정과 doctor 안내가 일관된다.

실패하면 GitHub Release를 만들지 않는다. 원인을 고치고 새 prerelease version을 낸다. 이미 공개된 잘못된 alpha는 삭제보다 `npm deprecate intent-layer@<version> "reason"`으로 사용 중단을 알리는 편이 안전하다.

### 5. Git tag와 GitHub Release

registry smoke가 통과한 **그 package version의 commit**에 tag를 단다.

```bash
git tag -a v0.1.0-alpha.1 -m "INTENT_LAYER v0.1.0-alpha.1"
git push origin v0.1.0-alpha.1
gh release create v0.1.0-alpha.1 --prerelease --generate-notes --title "INTENT_LAYER v0.1.0-alpha.1"
```

GitHub CLI를 쓰지 않으면 GitHub의 Releases 화면에서 같은 tag를 골라 `pre-release`로 만든다. release note에는 다음을 포함한다.

- `npm install -D intent-layer@alpha` 설치 명령
- React/Vite/Tailwind 지원 matrix와 Node 최소 버전
- 선택 → 미리보기 → 적용 → 검증 → undo의 검증된 흐름
- dynamic className, cross-file layout, Next.js 등 현재 read-only/미지원 경계
- `npm run verify` 결과와 알려진 문제
- issue/피드백 링크와 alpha 데이터 취급 안내

### 6. 첫 공개 뒤 운영

1. README의 registry 명령과 실제 `alpha` dist-tag/version이 일치하는지 확인하고 한영 문서를 같은 commit에서 갱신한다.
2. 첫 5명에게 설치 성공 여부, 첫 선택까지 걸린 시간, 첫 patch 성공/실패와 중단 이유를 받는다. 기능 요청보다 설치 실패와 잘못된 patch를 먼저 고친다.
3. 매 release에서 `npm run verify`, dry-run package 검사, registry fresh-install smoke와 GitHub prerelease note를 반복한다.
4. A/B `gates.complete`와 초기 사용자 피드백이 통과하기 전에는 `npm dist-tag add intent-layer@<version> latest`를 실행하지 않는다.
5. 통과 뒤에도 `latest` 승격은 owner가 report, known limitations와 rollback 계획을 검토한 별도 결정으로 남긴다.

첫 수동 publish가 안정되면 장기 npm token 대신 [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)을 사용한다. npm package 설정에서 GitHub 저장소, publish workflow filename과 허용 action을 정확히 등록하고, GitHub-hosted runner에 `id-token: write`를 부여한다. 현재 요구사항 기준으로 publish job은 Node 22.14 이상과 npm 11.5.1 이상을 사용해야 한다. 이는 package 사용자의 Node 20 최소 버전과 별개다. 현재 저장소에는 자동 publish workflow를 일부러 두지 않았으므로, npm package ownership과 첫 alpha가 확인된 뒤 별도 검토로 추가한다.

## CLI

GUI가 기본이며 CLI는 진단, CI와 복구용이다.

```bash
npm run intent:doctor
npx intent-layer init
npm run intent:check -- fixtures/corpus src/App.tsx
npm run intent:scan -- fixtures/corpus src/App.tsx --write-graph
node dist/cli.js --help
```

패키지는 `dist/cli.js`, `dist/vite.js`, `dist/mcp.js`, `intent-layer/vite` type declaration과 browser virtual module bundle을 배포한다. 실행 시 raw TypeScript나 `tsx`에 의존하지 않는다.

## 문서

- 이 README: 설치, GUI, AI 연결, 설정 변경과 재설치까지 포함한 현재 사용자 설명서
- [PRODUCT_PLAN_KR.md](./PRODUCT_PLAN_KR.md): 제품 범위와 의사결정
- [DEMO_WALKTHROUGH_KR.md](./DEMO_WALKTHROUGH_KR.md): 재현 가능한 데모
- [FAILURE_MODES_KR.md](./FAILURE_MODES_KR.md): 실패와 복구
- 영어 문서는 같은 이름의 `_EN.md` 또는 [README.md](./README.md)에 있다.

과거 spike, launch, handoff 상태 문서는 Git 이력으로 보존하며 활성 문서로 중복 유지하지 않는다.

## 현재 비범위

- Next.js 정식 adapter
- 특정 렌더 인스턴스만 바꾸기 위한 자동 prop/variant refactor
- `cloneElement`의 모호한 provenance를 직접 편집
- styled-components, Emotion, 전체 CSS cascade 편집
- 동적 Tailwind config 실행 또는 복합 arbitrary value의 일반 편집
- 외부 npm package나 `node_modules` 직접 수정
- Figma import
- 자연어 레이아웃 refactor를 결정론적 패치처럼 적용하는 기능

지원하지 않는 표현은 조용히 잘못 고치지 않고 read-only 또는 `handoff-required`로 내려간다.

## 라이선스

[MIT](./LICENSE)
