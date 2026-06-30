export function DynamicRuntime({ size, className }: { size: number; className?: string }) {
  const cardClass = size > 2 ? "gap-6 p-8" : "gap-3 p-4";

  return (
    <section className={cardClass}>
      <div className={`grid gap-${size} rounded-lg p-4`}>
        <button className={className}>Runtime className</button>
      </div>
    </section>
  );
}
