import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "fixtures", "ai-generated");

type Pattern = "dashboard" | "landing" | "shadcn" | "workflow" | "readonly";

interface SampleSpec {
  index: number;
  name: string;
  pattern: Pattern;
  accent: string;
  surface: string;
}

const accents = ["teal", "sky", "violet", "rose", "amber", "emerald", "indigo", "cyan", "fuchsia", "lime"];
const surfaces = ["slate", "zinc", "neutral", "stone", "gray"];

function pascalCase(value: string): string {
  return value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function sampleSpecs(): SampleSpec[] {
  const patterns: Pattern[] = ["dashboard", "landing", "shadcn", "workflow", "readonly"];
  return Array.from({ length: 50 }, (_, index) => {
    const sampleNumber = index + 1;
    const pattern = patterns[index % patterns.length];
    return {
      index: sampleNumber,
      name: `ai-${pattern}-${String(sampleNumber).padStart(2, "0")}`,
      pattern,
      accent: accents[index % accents.length],
      surface: surfaces[index % surfaces.length]
    };
  });
}

function header(name: string): string[] {
  return [
    `// Codex-generated React/Tailwind corpus sample for deterministic className coverage auditing.`,
    `// Source label: ${name}`,
    ""
  ];
}

function dashboard(spec: SampleSpec): string {
  const component = pascalCase(spec.name);
  const cards = ["Revenue", "Activation", "Retention"].map((label, itemIndex) =>
    [
      `        <article className="flex flex-col gap-3 rounded-xl border border-${spec.surface}-200 bg-white p-${itemIndex + 4} shadow-sm">`,
      `          <span className="text-xs font-semibold uppercase tracking-wide text-${spec.accent}-700">${label}</span>`,
      `          <strong className="text-2xl font-bold text-${spec.surface}-950">${72 + spec.index + itemIndex}%</strong>`,
      `          <p className="text-sm leading-6 text-${spec.surface}-600">Generated dashboard metric card with predictable spacing.</p>`,
      "        </article>"
    ].join("\n")
  ).join("\n");

  return [
    ...header(spec.name),
    `export function ${component}() {`,
    "  return (",
    `    <section className="grid grid-cols-3 gap-4 rounded-2xl bg-${spec.surface}-50 p-6">`,
    cards,
    "    </section>",
    "  );",
    "}",
    ""
  ].join("\n");
}

function landing(spec: SampleSpec): string {
  const component = pascalCase(spec.name);
  return [
    ...header(spec.name),
    `export function ${component}() {`,
    "  return (",
    `    <main className="min-h-screen bg-${spec.surface}-950 px-8 py-10 text-white">`,
    `      <section className="mx-auto flex max-w-5xl flex-col gap-8 rounded-3xl border border-white/10 bg-white/10 p-8 shadow-xl">`,
    `        <p className="text-sm font-semibold uppercase tracking-wide text-${spec.accent}-200">Launch sample ${spec.index}</p>`,
    `        <h1 className="max-w-3xl text-5xl font-bold leading-tight">AI generated landing layout with visible hierarchy</h1>`,
    `        <p className="max-w-2xl text-base leading-7 text-${spec.surface}-200">A hero section with static Tailwind tokens that should remain directly editable.</p>`,
    `        <div className="flex flex-wrap gap-3">`,
    `          <a className="rounded-lg bg-${spec.accent}-400 px-5 py-3 text-sm font-semibold text-${spec.surface}-950">Start</a>`,
    `          <a className="rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white">Docs</a>`,
    "        </div>",
    "      </section>",
    "    </main>",
    "  );",
    "}",
    ""
  ].join("\n");
}

function shadcn(spec: SampleSpec): string {
  const component = pascalCase(spec.name);
  return [
    ...header(spec.name),
    "declare function cn(...value: Array<string | false | undefined>): string;",
    "declare function clsx(...value: Array<string | false | undefined>): string;",
    "",
    `export function ${component}({ selected = false, muted = false }: { selected?: boolean; muted?: boolean }) {`,
    "  return (",
    `    <article className={cn("rounded-xl border border-${spec.surface}-200 bg-white p-6 shadow-sm", selected && "ring-2 ring-${spec.accent}-300")}>`,
    `      <header className="flex items-start justify-between gap-4">`,
    `        <div className="flex flex-col gap-2">`,
    `          <h2 className="text-lg font-semibold text-${spec.surface}-950">Generated card ${spec.index}</h2>`,
    `          <p className={clsx("text-sm leading-6 text-${spec.surface}-600", muted && "opacity-70")}>Simple cn and clsx literals should stay patchable.</p>`,
    "        </div>",
    `        <span className="rounded-full bg-${spec.accent}-100 px-3 py-1 text-xs font-semibold text-${spec.accent}-800">Live</span>`,
    "      </header>",
    "    </article>",
    "  );",
    "}",
    ""
  ].join("\n");
}

function workflow(spec: SampleSpec): string {
  const component = pascalCase(spec.name);
  return [
    ...header(spec.name),
    "declare function cn(...value: Array<string | false | undefined>): string;",
    "",
    `export function ${component}({ active = false, locked = false }: { active?: boolean; locked?: boolean }) {`,
    "  const statusClass = active ? \"text-teal-700\" : \"text-slate-500\";",
    "  return (",
    `    <section className="flex flex-col gap-4 rounded-2xl border border-${spec.surface}-200 bg-white p-6">`,
    `      <div className={cn("grid grid-cols-4 gap-3", locked && "opacity-60", statusClass)}>`,
    `        <button className="rounded-lg bg-${spec.surface}-950 px-4 py-2 text-sm font-semibold text-white">Queue</button>`,
    `        <button className="rounded-lg border border-${spec.surface}-200 px-4 py-2 text-sm font-semibold text-${spec.surface}-700">Review</button>`,
    `        <button className="rounded-lg border border-${spec.surface}-200 px-4 py-2 text-sm font-semibold text-${spec.surface}-700">Ship</button>`,
    `        <button className="rounded-lg bg-${spec.accent}-100 px-4 py-2 text-sm font-semibold text-${spec.accent}-800">Audit</button>`,
    "      </div>",
    "    </section>",
    "  );",
    "}",
    ""
  ].join("\n");
}

function readonly(spec: SampleSpec): string {
  const component = pascalCase(spec.name);
  const variantName = `${component}Variants`;
  return [
    ...header(spec.name),
    `const shellClass = "rounded-2xl border border-${spec.surface}-200 bg-white p-6 shadow-sm";`,
    `const styles = { title: "text-xl font-semibold text-${spec.surface}-950" };`,
    `function ${variantName}(tone: "primary" | "ghost") {`,
    `  return tone === "primary" ? "bg-${spec.accent}-700 text-white" : "bg-${spec.surface}-100 text-${spec.surface}-800";`,
    "}",
    "",
    `export function ${component}({ featured = false }: { featured?: boolean }) {`,
    "  const titleClass = `text-xl font-semibold ${featured ? \"text-teal-700\" : \"text-slate-950\"}`;",
    "  return (",
    "    <section className={shellClass}>",
    `      <div className="flex flex-col gap-4 rounded-xl bg-${spec.surface}-50 p-5">`,
    "        <h2 className={styles.title}>Variable backed heading</h2>",
    "        <p className={titleClass}>Template backed title</p>",
    `        <button className={${variantName}("primary")}>Variant action</button>`,
    `        <p className="text-sm leading-6 text-${spec.surface}-600">Static fallback body remains directly editable.</p>`,
    "      </div>",
    "    </section>",
    "  );",
    "}",
    ""
  ].join("\n");
}

function render(spec: SampleSpec): string {
  if (spec.pattern === "dashboard") return dashboard(spec);
  if (spec.pattern === "landing") return landing(spec);
  if (spec.pattern === "shadcn") return shadcn(spec);
  if (spec.pattern === "workflow") return workflow(spec);
  return readonly(spec);
}

function assertSafeOutputDir(dir: string): void {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedDir = path.resolve(dir);
  const expectedParent = path.join(normalizedRoot, "fixtures");
  if (!normalizedDir.startsWith(`${expectedParent}${path.sep}`)) {
    throw new Error(`Refusing to write outside fixtures/: ${normalizedDir}`);
  }
}

assertSafeOutputDir(outputDir);
fs.mkdirSync(outputDir, { recursive: true });
for (const entry of fs.readdirSync(outputDir)) {
  if (entry.endsWith(".tsx")) {
    fs.unlinkSync(path.join(outputDir, entry));
  }
}

const specs = sampleSpecs();
for (const spec of specs) {
  fs.writeFileSync(path.join(outputDir, `${spec.name}.tsx`), render(spec));
}

process.stdout.write(`Generated ${specs.length} AI corpus samples in ${path.relative(rootDir, outputDir)}\n`);
