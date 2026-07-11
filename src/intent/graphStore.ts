import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { instrumentSource } from "./instrument";
import type { IntentBinding, IntentGraph, PatchApplyResult } from "./types";

export function isIntentTargetFile(file: string): boolean {
  return /\.[jt]sx$/.test(file) && !file.includes("/node_modules/") && !file.includes("\\node_modules\\");
}

function graphFingerprint(entries: Record<string, IntentBinding>): string {
  return JSON.stringify(entries, (key, value) => (key === "transformMs" ? 0 : value));
}

export function isPathInsideIntentRoot(rootDir: string, file: string): boolean {
  const relative = path.relative(path.resolve(rootDir), path.resolve(file));
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

export class IntentGraphStore {
  private root: string;
  private readonly entriesByFile = new Map<string, IntentBinding[]>();
  private readonly entriesById = new Map<string, IntentBinding>();
  private lastPublishedEntriesJson: string | null = null;
  private lastPublishedGeneratedAt: string | null = null;
  private loadedGraphMtimeMs = -1;

  constructor(rootDir = process.cwd()) {
    this.root = path.resolve(rootDir);
  }

  get rootDir(): string {
    return this.root;
  }

  get size(): number {
    return this.entriesById.size;
  }

  setRootDir(rootDir: string): void {
    const nextRoot = path.resolve(rootDir);
    if (nextRoot === this.root) return;

    this.root = nextRoot;
    this.clear();
  }

  clear(): void {
    this.entriesByFile.clear();
    this.entriesById.clear();
    this.lastPublishedEntriesJson = null;
    this.lastPublishedGeneratedAt = null;
    this.loadedGraphMtimeMs = -1;
  }

  get(id: string): IntentBinding | undefined {
    return this.entriesById.get(id);
  }

  values(): IntentBinding[] {
    return [...this.entriesById.values()];
  }

  replaceFileEntries(file: string, entries: IntentBinding[]): void {
    const absoluteFile = path.resolve(file);
    if (!isPathInsideIntentRoot(this.root, absoluteFile)) return;
    const previous = this.entriesByFile.get(absoluteFile) ?? [];
    for (const entry of previous) this.entriesById.delete(entry.id);

    this.entriesByFile.set(absoluteFile, entries);
    for (const entry of entries) this.entriesById.set(entry.id, entry);
  }

  refreshFile(file: string): boolean {
    const absoluteFile = path.resolve(file);
    if (
      !isPathInsideIntentRoot(this.root, absoluteFile) ||
      !isIntentTargetFile(absoluteFile) ||
      !fs.existsSync(absoluteFile)
    ) {
      return false;
    }

    const result = instrumentSource({
      code: fs.readFileSync(absoluteFile, "utf8"),
      file: absoluteFile,
      rootDir: this.root
    });
    this.replaceFileEntries(absoluteFile, result.entries);
    this.publish();
    return true;
  }

  toGraph(): IntentGraph {
    return {
      version: 1,
      generatedAt: this.lastPublishedGeneratedAt ?? new Date().toISOString(),
      entries: this.sortedEntries()
    };
  }

  publish(): void {
    const entries = this.sortedEntries();
    const entriesJson = graphFingerprint(entries);
    const output = this.graphPath();

    if (
      this.lastPublishedEntriesJson === entriesJson &&
      this.lastPublishedGeneratedAt &&
      fs.existsSync(output)
    ) {
      return;
    }

    const generatedAt = this.nextGeneratedAt();
    const graph: IntentGraph = { version: 1, generatedAt, entries };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
      fs.renameSync(temporary, output);
    } catch (error) {
      try {
        fs.unlinkSync(temporary);
      } catch {
        // Preserve the graph write error.
      }
      throw error;
    }
    this.lastPublishedEntriesJson = entriesJson;
    this.lastPublishedGeneratedAt = generatedAt;
    this.loadedGraphMtimeMs = fs.statSync(output).mtimeMs;
  }

  loadPublishedGraph(force = false): boolean {
    const file = this.graphPath();
    if (!fs.existsSync(file)) return false;

    const mtimeMs = fs.statSync(file).mtimeMs;
    if (!force && mtimeMs === this.loadedGraphMtimeMs) return false;

    let graph: IntentGraph;
    try {
      graph = JSON.parse(fs.readFileSync(file, "utf8")) as IntentGraph;
    } catch {
      return false;
    }
    if (graph.version !== 1 || !graph.entries || typeof graph.entries !== "object") return false;

    this.entriesByFile.clear();
    this.entriesById.clear();
    for (const entry of Object.values(graph.entries)) {
      const absoluteFile = path.resolve(entry.file);
      if (!isPathInsideIntentRoot(this.root, absoluteFile)) continue;
      const fileEntries = this.entriesByFile.get(absoluteFile) ?? [];
      fileEntries.push(entry);
      this.entriesByFile.set(absoluteFile, fileEntries);
      this.entriesById.set(entry.id, entry);
    }
    this.lastPublishedGeneratedAt = graph.generatedAt;
    this.lastPublishedEntriesJson = graphFingerprint(this.sortedEntries());
    this.loadedGraphMtimeMs = mtimeMs;
    return true;
  }

  containsPatch(patch: PatchApplyResult): boolean {
    const entry = this.entriesById.get(patch.id);
    return Boolean(entry && path.resolve(entry.file) === path.resolve(patch.file));
  }

  private graphPath(): string {
    return path.join(this.root, ".intent", "graph.intent.json");
  }

  private sortedEntries(): Record<string, IntentBinding> {
    const entries: Record<string, IntentBinding> = {};
    for (const id of [...this.entriesById.keys()].sort()) {
      const entry = this.entriesById.get(id);
      if (entry) entries[id] = entry;
    }
    return entries;
  }

  private nextGeneratedAt(): string {
    const next = new Date();
    const previousMs = this.lastPublishedGeneratedAt
      ? Date.parse(this.lastPublishedGeneratedAt)
      : Number.NaN;
    if (Number.isFinite(previousMs) && next.getTime() <= previousMs) next.setTime(previousMs + 1);
    return next.toISOString();
  }
}
