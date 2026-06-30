// Codex-generated React/Tailwind corpus sample for deterministic className coverage auditing.
// Source label: ai-readonly-10

const shellClass = "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm";
const styles = { title: "text-xl font-semibold text-gray-950" };
function AiReadonly10Variants(tone: "primary" | "ghost") {
  return tone === "primary" ? "bg-lime-700 text-white" : "bg-gray-100 text-gray-800";
}

export function AiReadonly10({ featured = false }: { featured?: boolean }) {
  const titleClass = `text-xl font-semibold ${featured ? "text-teal-700" : "text-slate-950"}`;
  return (
    <section className={shellClass}>
      <div className="flex flex-col gap-4 rounded-xl bg-gray-50 p-5">
        <h2 className={styles.title}>Variable backed heading</h2>
        <p className={titleClass}>Template backed title</p>
        <button className={AiReadonly10Variants("primary")}>Variant action</button>
        <p className="text-sm leading-6 text-gray-600">Static fallback body remains directly editable.</p>
      </div>
    </section>
  );
}
