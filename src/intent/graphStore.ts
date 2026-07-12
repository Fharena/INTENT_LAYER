import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withIntentFileLock } from "./fileLock";
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
  private readonly ownedFiles = new Set<string>();
  private lastPublishedEntriesJson: string | null = null;
  private lastPublishedGeneratedAt: string | null = null;
  private loadedGraphMtimeMs = -1;
  private loadedGraphCtimeMs = -1;
  private loadedGraphSize = -1;

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
    this.ownedFiles.clear();
    this.lastPublishedEntriesJson = null;
    this.lastPublishedGeneratedAt = null;
    this.loadedGraphMtimeMs = -1;
    this.loadedGraphCtimeMs = -1;
    this.loadedGraphSize = -1;
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
    this.ownedFiles.add(absoluteFile);
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
    const output = this.graphPath();
    withIntentFileLock(
      this.root,
      output,
      () => {
        const currentStat = fs.existsSync(output) ? fs.statSync(output) : null;
        const diskUnchanged =
          currentStat?.mtimeMs === this.loadedGraphMtimeMs &&
          currentStat?.ctimeMs === this.loadedGraphCtimeMs &&
          currentStat?.size === this.loadedGraphSize &&
          this.lastPublishedEntriesJson !== null;
        const published = diskUnchanged ? null : this.readGraphFile();
        let sortedEntries = this.sortedEntries();
        if (!diskUnchanged) {
          const byFile = new Map<string, IntentBinding[]>();
          if (published) {
            for (const entry of Object.values(published.entries)) {
              const absoluteFile = path.resolve(entry.file);
              if (!isPathInsideIntentRoot(this.root, absoluteFile)) continue;
              const entries = byFile.get(absoluteFile) ?? [];
              entries.push(entry);
              byFile.set(absoluteFile, entries);
            }
          }
          for (const file of this.ownedFiles) {
            byFile.set(file, this.entriesByFile.get(file) ?? []);
          }
          const entries: Record<string, IntentBinding> = {};
          for (const fileEntries of byFile.values()) {
            for (const entry of fileEntries) entries[entry.id] = entry;
          }
          sortedEntries = Object.fromEntries(
            Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))
          );
        }
        const entriesJson = graphFingerprint(sortedEntries);
        const publishedJson = diskUnchanged
          ? this.lastPublishedEntriesJson
          : published
            ? graphFingerprint(published.entries)
            : null;
        let generatedAt = published?.generatedAt ?? this.lastPublishedGeneratedAt;

        if (!fs.existsSync(output) || publishedJson !== entriesJson) {
          if (published?.generatedAt) this.lastPublishedGeneratedAt = published.generatedAt;
          generatedAt = this.nextGeneratedAt();
          const graph: IntentGraph = { version: 1, generatedAt, entries: sortedEntries };
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
        }

        if (!diskUnchanged) this.replaceAllEntries(sortedEntries);
        this.lastPublishedEntriesJson = entriesJson;
        this.lastPublishedGeneratedAt = generatedAt ?? new Date().toISOString();
        const writtenStat = fs.statSync(output);
        this.loadedGraphMtimeMs = writtenStat.mtimeMs;
        this.loadedGraphCtimeMs = writtenStat.ctimeMs;
        this.loadedGraphSize = writtenStat.size;
      },
      30_000,
      5_000
    );
  }

  loadPublishedGraph(force = false): boolean {
    const file = this.graphPath();
    if (!fs.existsSync(file)) return false;

    const stat = fs.statSync(file);
    if (
      !force &&
      stat.mtimeMs === this.loadedGraphMtimeMs &&
      stat.ctimeMs === this.loadedGraphCtimeMs &&
      stat.size === this.loadedGraphSize
    ) {
      return false;
    }

    const graph = this.readGraphFile();
    if (!graph) return false;

    this.replaceAllEntries(graph.entries);
    this.lastPublishedGeneratedAt = graph.generatedAt;
    this.lastPublishedEntriesJson = graphFingerprint(this.sortedEntries());
    this.loadedGraphMtimeMs = stat.mtimeMs;
    this.loadedGraphCtimeMs = stat.ctimeMs;
    this.loadedGraphSize = stat.size;
    return true;
  }

  containsPatch(patch: PatchApplyResult): boolean {
    const entry = this.entriesById.get(patch.id);
    return Boolean(entry && path.resolve(entry.file) === path.resolve(patch.file));
  }

  private graphPath(): string {
    return path.join(this.root, ".intent", "graph.intent.json");
  }

  private readGraphFile(): IntentGraph | null {
    const file = this.graphPath();
    if (!fs.existsSync(file)) return null;
    try {
      const graph = JSON.parse(fs.readFileSync(file, "utf8")) as IntentGraph;
      return graph.version === 1 && graph.entries && typeof graph.entries === "object" ? graph : null;
    } catch {
      return null;
    }
  }

  private replaceAllEntries(entries: Record<string, IntentBinding>): void {
    this.entriesByFile.clear();
    this.entriesById.clear();
    for (const file of this.ownedFiles) this.entriesByFile.set(file, []);
    for (const entry of Object.values(entries)) {
      const absoluteFile = path.resolve(entry.file);
      if (!isPathInsideIntentRoot(this.root, absoluteFile)) continue;
      const fileEntries = this.entriesByFile.get(absoluteFile) ?? [];
      fileEntries.push(entry);
      this.entriesByFile.set(absoluteFile, fileEntries);
      this.entriesById.set(entry.id, entry);
    }
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
