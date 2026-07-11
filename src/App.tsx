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

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const clsx = cn;

function ProductCard({ product }: { product: (typeof products)[number] }) {
  return (
    <article
      className={cn(
        "flex h-full flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm",
        product.price === "$39" && "ring-2 ring-teal-200"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">{product.name}</h2>
        <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-800">
          {product.price}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-600">{product.description}</p>
      <button
        className={clsx(
          "mt-auto rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white",
          product.price === "$49" && "bg-teal-700"
        )}
      >
        Inspect
      </button>
    </article>
  );
}

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

        <section className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-12">
          <div className="col-span-1 sm:col-span-5">
            <ProductCard product={products[0]} />
          </div>
          <div className="col-span-1 sm:col-span-3">
            <ProductCard product={products[1]} />
          </div>
          <div className="col-span-1 sm:col-span-4">
            <ProductCard product={products[2]} />
          </div>
        </section>
      </section>
    </main>
  );
}
