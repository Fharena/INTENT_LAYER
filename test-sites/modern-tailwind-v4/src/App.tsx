import { useState } from "react";

type ClassValue = string | false | null | undefined;

function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}

const signals = [
  { label: "Binding", value: "AST exact" },
  { label: "Mutation", value: "Range only" },
  { label: "Runtime", value: "Connected" }
];

export default function App() {
  const [primaryMode, setPrimaryMode] = useState(true);

  return (
    <main className="min-h-screen bg-canvas px-6 py-12 text-zinc-100 sm:px-10 lg:px-16">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-zinc-800 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">Intent Layer Lab</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Modern stack compatibility</h1>
        </div>
        <button
          className="rounded-md border border-zinc-700 bg-panel px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-500"
          data-testid="mode-toggle"
          onClick={() => setPrimaryMode((value) => !value)}
          type="button"
        >
          {primaryMode ? "Primary branch" : "Accent branch"}
        </button>
      </header>

      <section className="mx-auto mt-10 grid max-w-6xl gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <article
          className={cn(
            "grid min-h-80 gap-6 rounded-lg p-8 shadow-xl transition-colors",
            primaryMode ? "bg-brand text-white" : "bg-accent text-zinc-950"
          )}
          data-testid="modern-card"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium opacity-80">Selected component</p>
              <h2 className="mt-2 max-w-xl text-4xl font-semibold leading-tight">Edit the rendered branch, not a dormant token.</h2>
            </div>
            <span className="rounded-full border border-current px-3 py-1 text-xs font-semibold">React 19</span>
          </div>
          <p className="max-w-2xl text-base leading-7 opacity-85">
            This fixture proves runtime-aware controls and source-safe Tailwind 4 patches against a real Vite build.
          </p>
          <div className="mt-auto grid gap-3 sm:grid-cols-3">
            {signals.map((signal) => (
              <div className="rounded-md border border-current p-4" key={signal.label}>
                <p className="text-xs opacity-70">{signal.label}</p>
                <p className="mt-1 font-semibold">{signal.value}</p>
              </div>
            ))}
          </div>
        </article>

        <aside className="grid content-between gap-6 rounded-lg border border-zinc-800 bg-panel p-6">
          <div>
            <p className="text-sm font-semibold text-teal-300">Live evidence</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Candidate changes should appear in the DOM before the source file changes. Apply stays locked until preview validation succeeds.
            </p>
          </div>
          <dl className="grid gap-4 text-sm">
            <div className="flex justify-between border-b border-zinc-800 pb-3">
              <dt className="text-zinc-500">Tailwind</dt>
              <dd className="font-medium">4.x</dd>
            </div>
            <div className="flex justify-between border-b border-zinc-800 pb-3">
              <dt className="text-zinc-500">Vite</dt>
              <dd className="font-medium">8.x</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Preview</dt>
              <dd className="font-medium text-teal-300">DOM only</dd>
            </div>
          </dl>
        </aside>
      </section>

      <div aria-hidden="true" className="hidden gap-5 gap-7 bg-accent bg-brand p-7 p-9" />
    </main>
  );
}
