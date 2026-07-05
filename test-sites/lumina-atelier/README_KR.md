# Lumina Atelier Intent Test

`lumina-atelier`는 INTENT_LAYER를 실제 외부 React/Vite/Tailwind 프로젝트처럼 써보기 위한 테스트 사이트다.

목표:

- 수려한 랜딩 페이지 UI를 만든다.
- `intent-layer/vite` plugin을 local package dependency로 불러온다.
- 정적 `className`과 simple `cn()` literal segment가 graph에 잡히는지 확인한다.
- `intent-layer doctor`, `scan`, `check`로 coverage와 transform 시간을 측정한다.

중요 설정:

```ts
plugins: [intentLayer(), react()]
```

`intentLayer()`는 React plugin보다 먼저 둔다. React Refresh transform 뒤에 intent binding이 만들어지면 source hash와 source range가 실제 TSX 파일과 어긋나 direct patch가 안전하게 거부될 수 있다.

실행:

```bash
npm install
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

이번 측정 결과는 `TEST_RESULT_KR.md`와 `TEST_RESULT_EN.md`에 남긴다.

