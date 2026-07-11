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
    // A malformed lock cannot safely own a source file indefinitely.
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
  staleAfterMs = 30_000
): T {
  const target = lockPath(rootDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  let descriptor: number | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      descriptor = fs.openSync(target, "wx");
      break;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST" || attempt > 0 || !removeStaleLock(target, staleAfterMs)) {
        throw new IntentFileLockedError(target);
      }
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
