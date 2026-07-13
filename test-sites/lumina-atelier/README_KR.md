# Lumina Atelier Intent Test

`lumina-atelier`는 INTENT_LAYER를 실제 외부 React/Vite/Tailwind 프로젝트처럼 써보기 위한 테스트 사이트다.

목표:

- 수려한 랜딩 페이지 UI를 만든다.
- `intent-layer/vite` plugin을 local package dependency로 불러온다.
- 정적 `className`과 simple `cn()` literal segment가 graph에 잡히는지 확인한다.
- `intent-layer doctor`, `scan`, `check`로 coverage와 transform 시간을 측정한다.

`npx intent-layer init`은 `intentLayer()`가 React plugin보다 먼저 오도록 정적 Vite config를 멱등적으로 설정한다. 이 fixture는 이미 설정돼 있으므로 다시 실행해도 파일이 바뀌지 않아야 한다.

실행:

```bash
npm install
npx intent-layer init
npm run dev
```

검증:

```bash
npm run typecheck
npm run build
npm run intent:doctor
npm run intent:scan
npm run intent:check
```

테스트 포인트:

- `src/App.tsx`의 hero/nav/card/button Tailwind token을 클릭하거나 scan한다.
- `gap-*`, `p-*`, `bg-*`, `text-*`, `border-*` 같은 token이 direct-edit 후보로 잡히는지 본다.
- 복잡한 map/render 구조 안에서도 source binding이 안정적으로 생성되는지 본다.
- hero의 `md:grid-cols-[1.2fr_0.8fr]`를 Grid 비율 slider로 preview/apply/undo한다.
- `tailwind.config.cjs`의 `ink`, `porcelain`, `moss`, `copper`가 기본 palette보다 먼저 후보에 나타나는지 본다.

저장소 루트의 `npm run test:e2e`가 Chromium에서 설정, 선택, 비대칭 Grid, HMR, exact undo와 390px panel을 자동 검증한다. 수치 결과는 루트 `reports/performance/*.json`만 기준으로 삼는다.
