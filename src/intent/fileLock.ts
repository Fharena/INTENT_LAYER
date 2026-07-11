import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface FileLockRecord {
  version: 1;
  id: string;
  file: string;
  pid: number;
  createdAt: string;
}

const heldOperationLocks = new Set<string>();
const sleepState = new Int32Array(new SharedArrayBuffer(4));

export class IntentFileLockedError extends Error {
  readonly code = "file-locked";

  constructor(readonly lockFile: string) {
    super("Another Intent Layer operation is editing this source file.");
    this.name = "IntentFileLockedError";
  }
}

function lockPath(rootDir: string, file: string): string {
  const digest = createHash("sha256").update(path.resolve(file)).digest("hex").slice(0, 24);
  return path.join(rootDir, ".intent", "runtime", "locks", `${digest}.lock.json`);
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function removeStaleLock(file: string, staleAfterMs: number): boolean {
  try {
    const record = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<FileLockRecord>;
    const createdAtMs = typeof record.createdAt === "string" ? Date.parse(record.createdAt) : Number.NaN;
    const staleByAge = !Number.isFinite(createdAtMs) || Date.now() - createdAtMs > staleAfterMs;
    const staleByProcess = typeof record.pid !== "number" || !processIsAlive(record.pid);
    if (!staleByAge && !staleByProcess) return false;
  } catch {
    try {
      if (Date.now() - fs.statSync(file).mtimeMs < 1_000) return false;
    } catch {
      return false;
    }
  }

  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

export function withIntentFileLock<T>(
  rootDir: string,
  file: string,
  callback: () => T,
  staleAfterMs = 30_000,
  waitTimeoutMs = 0
): T {
  const target = lockPath(rootDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  let descriptor: number | null = null;
  const deadline = Date.now() + Math.max(0, waitTimeoutMs);
  while (descriptor === null) {
    try {
      descriptor = fs.openSync(target, "wx");
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") {
        throw new IntentFileLockedError(target);
      }
      if (removeStaleLock(target, staleAfterMs)) continue;
      if (Date.now() >= deadline) throw new IntentFileLockedError(target);
      Atomics.wait(sleepState, 0, 0, Math.min(10, Math.max(1, deadline - Date.now())));
    }
  }

  if (descriptor === null) throw new IntentFileLockedError(target);

  const record: FileLockRecord = {
    version: 1,
    id: randomUUID(),
    file: path.resolve(file),
    pid: process.pid,
    createdAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return callback();
  } finally {
    fs.closeSync(descriptor);
    try {
      fs.unlinkSync(target);
    } catch {
      // A later stale-lock pass can recover an interrupted cleanup.
    }
  }
}

export function withIntentOperationLock<T>(rootDir: string, callback: () => T): T {
  const root = path.resolve(rootDir);
  if (heldOperationLocks.has(root)) return callback();

  const journal = path.join(root, ".intent", "operations", "operation-log.json");
  return withIntentFileLock(
    root,
    journal,
    () => {
      heldOperationLocks.add(root);
      try {
        return callback();
      } finally {
        heldOperationLocks.delete(root);
      }
    },
    30_000,
    5_000
  );
}
