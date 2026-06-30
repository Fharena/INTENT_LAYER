const metrics = ["Revenue", "Activation", "Retention"];

export function StaticDashboard() {
  return (
    <section className="grid grid-cols-3 gap-4 p-6">
      {metrics.map((metric) => (
        <article key={metric} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-5">
          <span className="text-sm font-medium text-slate-500">{metric}</span>
          <strong className="text-2xl font-bold text-slate-950">92%</strong>
        </article>
      ))}
    </section>
  );
}
