const products = [
  {
    name: "Intent Grid",
    price: "$29",
    description: "A generated product card with static Tailwind classes."
  },
  {
    name: "Patch Preview",
    price: "$39",
    description: "Click this card and change gap, padding, or radius."
  },
  {
    name: "Semantic Diff",
    price: "$49",
    description: "Small class token changes become intent operations."
  }
];

export function App() {
  return (
    <main className="min-h-screen bg-slate-50 px-8 py-10 text-slate-950">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
            INTENT_LAYER spike
          </p>
          <h1 className="text-4xl font-bold leading-tight text-slate-950">
            Static className click-to-patch demo
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600">
            Use the floating Intent panel, pick a UI element, preview a Tailwind
            token replacement, and apply a minimal source patch.
          </p>
        </header>

        <section className="grid grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {products.map((product) => (
            <article
              key={product.name}
              className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-950">{product.name}</h2>
                <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-800">
                  {product.price}
                </span>
              </div>
              <p className="text-sm leading-6 text-slate-600">{product.description}</p>
              <button className="mt-auto rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                Inspect
              </button>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
