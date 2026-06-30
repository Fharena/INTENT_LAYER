// Codex-generated React/Tailwind corpus sample for deterministic className coverage auditing.
// Source label: ai-shadcn-18

declare function cn(...value: Array<string | false | undefined>): string;
declare function clsx(...value: Array<string | false | undefined>): string;

export function AiShadcn18({ selected = false, muted = false }: { selected?: boolean; muted?: boolean }) {
  return (
    <article className={cn("rounded-xl border border-neutral-200 bg-white p-6 shadow-sm", selected && "ring-2 ring-cyan-300")}>
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-neutral-950">Generated card 18</h2>
          <p className={clsx("text-sm leading-6 text-neutral-600", muted && "opacity-70")}>Simple cn and clsx literals should stay patchable.</p>
        </div>
        <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-800">Live</span>
      </header>
    </article>
  );
}
