declare function buttonVariants(value: { variant: "primary" | "ghost" }): string;
declare function cn(...value: unknown[]): string;

export function VariantPatterns({ selected }: { selected: boolean }) {
  return (
    <div className={cn("flex gap-4 p-6", buttonVariants({ variant: selected ? "primary" : "ghost" }))}>
      <button className={buttonVariants({ variant: "primary" })}>Variant button</button>
      <span className={selected ? "text-sm font-semibold text-teal-700" : "text-sm text-slate-500"}>
        Conditional branch
      </span>
    </div>
  );
}
