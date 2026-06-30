export function StaticLanding() {
  return (
    <main className="min-h-screen bg-slate-50 px-8 py-10 text-slate-950">
      <section className="mx-auto flex max-w-5xl flex-col gap-8 rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-4xl font-bold leading-tight text-slate-950">Generated launch page</h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Static classes should be directly editable by the spike.
        </p>
        <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
          Get started
        </button>
      </section>
    </main>
  );
}
