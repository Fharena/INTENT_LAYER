// Codex-generated React/Tailwind corpus sample for deterministic className coverage auditing.
// Source label: ai-workflow-09

declare function cn(...value: Array<string | false | undefined>): string;

export function AiWorkflow09({ active = false, locked = false }: { active?: boolean; locked?: boolean }) {
  const statusClass = active ? "text-teal-700" : "text-slate-500";
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-6">
      <div className={cn("grid grid-cols-4 gap-3", locked && "opacity-60", statusClass)}>
        <button className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Queue</button>
        <button className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700">Review</button>
        <button className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700">Ship</button>
        <button className="rounded-lg bg-fuchsia-100 px-4 py-2 text-sm font-semibold text-fuchsia-800">Audit</button>
      </div>
    </section>
  );
}
