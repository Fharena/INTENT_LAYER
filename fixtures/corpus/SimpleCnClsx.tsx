declare function cn(...value: Array<string | false | undefined>): string;
declare function clsx(...value: Array<string | false | undefined>): string;

export function SimpleCnClsx({ active }: { active: boolean }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-xl p-6", active && "bg-teal-50")}>
      <button className={clsx("rounded-lg px-4 py-2 text-sm font-semibold", active && "bg-teal-700 text-white")}>
        Save
      </button>
      <p className={cn("text-sm leading-6 text-slate-600", active ? "font-medium" : "font-normal")}>
        Simple cn/clsx calls are measured as the next support tier.
      </p>
    </div>
  );
}
