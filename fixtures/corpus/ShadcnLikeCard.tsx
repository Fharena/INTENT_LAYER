declare function cn(...value: unknown[]): string;

interface CardProps {
  className?: string;
  muted?: boolean;
}

export function ShadcnLikeCard({ className, muted }: CardProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-6 text-card-foreground shadow", muted && "opacity-70", className)}>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold leading-none">Card title</h3>
        <p className="text-sm text-muted-foreground">Props forwarding should be read-only for v0.</p>
      </div>
    </div>
  );
}
