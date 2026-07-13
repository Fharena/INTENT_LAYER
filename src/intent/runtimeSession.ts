import fs from "node:fs";
import path from "node:path";
import type {
  IntentBinding,
  IntentRuntimeLayoutScope,
  IntentRuntimeSession,
  IntentRuntimeSelection,
  IntentRuntimeSelectionRequest,
  IntentRuntimeTokenResult
} from "./types";

function selectionPath(rootDir: string): string {
  return path.join(rootDir, ".intent", "runtime", "selection.json");
}

function selectionsDir(rootDir: string): string {
  return path.join(rootDir, ".intent", "runtime", "selections");
}

function sessionSelectionPath(rootDir: string, sessionId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId)) throw new Error("Invalid runtime session id.");
  return path.join(selectionsDir(rootDir), `${sessionId}.json`);
}

function sessionsDir(rootDir: string): string {
  return path.join(rootDir, ".intent", "runtime", "sessions");
}

function sessionPath(rootDir: string, sessionId: string): string {
  return path.join(sessionsDir(rootDir), `${sessionId}.json`);
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

function atomicWriteJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // Preserve the original rename error.
    }
    throw error;
  }
}

function compactText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function compactClassTokens(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((token) => token.trim()).filter((token) => token && !/\s/.test(token)))]
    .slice(0, 200)
    .map((token) => token.slice(0, 240));
}

function compactRuntimeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id && id.length <= 240 && !/\s/.test(id) ? id : null;
}

function compactRuntimeCount(value: unknown, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(value, maximum))
    : 0;
}

function compactLayoutScope(value: unknown): IntentRuntimeLayoutScope | null {
  if (!value || typeof value !== "object") return null;
  const scope = value as Partial<IntentRuntimeLayoutScope>;
  if (scope.kind !== "grid" && scope.kind !== "flex") return null;
  const parentId = compactRuntimeId(scope.parentId);
  if (!parentId || !Array.isArray(scope.childIds)) return null;
  const childIds = [
    ...new Set(scope.childIds.map((id) => compactRuntimeId(id)).filter((id): id is string => Boolean(id)))
  ].slice(0, 100);
  return {
    kind: scope.kind,
    parentId,
    childIds,
    unboundChildCount: compactRuntimeCount(scope.unboundChildCount, 10_000),
    renderedParentCount: compactRuntimeCount(scope.renderedParentCount, 10_000)
  };
}

export function writeRuntimeSelection(
  rootDir: string,
  entry: IntentBinding | undefined,
  request: IntentRuntimeSelectionRequest,
  sessionId: string | null = null
): IntentRuntimeSelection {
  if (request.id && !entry) throw new Error("No source binding exists for this runtime selection.");

  const selectedAt = new Date();
  const result: IntentRuntimeSelection = {
    version: 1,
    selectedAt: selectedAt.toISOString(),
    sessionId,
    freshUntil: new Date(selectedAt.getTime() + 30 * 60_000).toISOString(),
    selection: entry
      ? {
          id: entry.id,
          componentName: entry.componentName,
          tagName: entry.tagName,
          sourceFile: entry.relativeFile,
          route: compactText(request.route),
          text: compactText(request.text),
          role: compactText(request.role ?? undefined) || null,
          classTokens: compactClassTokens(request.classTokens),
          visible: request.visible ?? false,
          rect: request.rect ?? null,
          layout: compactLayoutScope(request.layout)
        }
      : null
  };
  if (sessionId) atomicWriteJson(sessionSelectionPath(rootDir, sessionId), result);
  atomicWriteJson(selectionPath(rootDir), result);
  return result;
}

function emptySelection(sessionId: string | null = null): IntentRuntimeSelection {
  return {
    version: 1,
    selectedAt: new Date(0).toISOString(),
    sessionId,
    freshUntil: new Date(0).toISOString(),
    selection: null
  };
}

function readSelectionFile(file: string, sessionId: string | null): IntentRuntimeSelection | null {
  if (!fs.existsSync(file)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<IntentRuntimeSelection>;
    return value.version === 1 && "selection" in value
      ? {
          version: 1,
          selectedAt: typeof value.selectedAt === "string" ? value.selectedAt : new Date(0).toISOString(),
          sessionId: typeof value.sessionId === "string" ? value.sessionId : sessionId,
          freshUntil:
            typeof value.freshUntil === "string" ? value.freshUntil : new Date(0).toISOString(),
          selection: value.selection
            ? {
                ...value.selection,
                classTokens: compactClassTokens(value.selection.classTokens),
                layout: compactLayoutScope(value.selection.layout)
              }
            : null
        }
      : null;
  } catch {
    return null;
  }
}

export function readRuntimeSelection(
  rootDir: string,
  sessionId: string | null = null
): IntentRuntimeSelection {
  if (sessionId) {
    return readSelectionFile(sessionSelectionPath(rootDir, sessionId), sessionId) ?? emptySelection(sessionId);
  }

  const activeSessions = new Set(readRuntimeSessions(rootDir).map((session) => session.sessionId));
  const candidates: IntentRuntimeSelection[] = [];
  const dir = selectionsDir(rootDir);
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const candidateSessionId = name.slice(0, -5);
      if (!activeSessions.has(candidateSessionId)) continue;
      const value = readSelectionFile(path.join(dir, name), candidateSessionId);
      if (value) candidates.push(value);
    }
  }
  const legacy = readSelectionFile(selectionPath(rootDir), null);
  if (legacy && (!legacy.sessionId || activeSessions.has(legacy.sessionId))) candidates.push(legacy);
  return candidates.sort((left, right) => Date.parse(right.selectedAt) - Date.parse(left.selectedAt))[0] ??
    emptySelection();
}

export function writeRuntimeSession(
  rootDir: string,
  input: Omit<IntentRuntimeSession, "version" | "sessionId" | "root" | "pid" | "startedAt">
): IntentRuntimeSession {
  const url = input.url.replace(/\/$/, "");
  const port = (() => {
    try {
      return new URL(url).port || "default";
    } catch {
      return "unknown";
    }
  })();
  const sessionId = `${process.pid}-${port}`;
  const session: IntentRuntimeSession = {
    version: 1,
    sessionId,
    root: path.resolve(rootDir),
    url,
    token: input.token,
    pid: process.pid,
    startedAt: new Date().toISOString()
  };
  atomicWriteJson(sessionPath(rootDir, sessionId), session);
  try {
    fs.unlinkSync(path.join(rootDir, ".intent", "runtime", "active.json"));
  } catch {
    // Ignore the legacy single-session record when it is absent.
  }
  return session;
}

export function readRuntimeSessions(rootDir: string): IntentRuntimeSession[] {
  const dir = sessionsDir(rootDir);
  if (!fs.existsSync(dir)) return [];
  const sessions: IntentRuntimeSession[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(dir, name);
    try {
      const session = JSON.parse(fs.readFileSync(file, "utf8")) as IntentRuntimeSession;
      const valid =
        session.version === 1 &&
        session.root === path.resolve(rootDir) &&
        Boolean(session.sessionId && session.url && session.token);
      if (!valid || !processIsAlive(session.pid)) {
        fs.unlinkSync(file);
        if (session.sessionId) {
          try {
            fs.unlinkSync(sessionSelectionPath(rootDir, session.sessionId));
          } catch {
            // A stale session may not have a selection file.
          }
        }
        continue;
      }
      sessions.push(session);
    } catch {
      try {
        fs.unlinkSync(file);
      } catch {
        // A later discovery pass can retry cleanup.
      }
    }
  }
  return sessions.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
}

export function readRuntimeSession(rootDir: string): IntentRuntimeSession | null {
  return readRuntimeSessions(rootDir)[0] ?? null;
}

export function removeRuntimeSession(rootDir: string, token: string): void {
  for (const session of readRuntimeSessions(rootDir)) {
    if (session.token !== token) continue;
    try {
      fs.unlinkSync(sessionPath(rootDir, session.sessionId));
    } catch {
      // The next discovery pass can remove a stale session record.
    }
    try {
      fs.unlinkSync(sessionSelectionPath(rootDir, session.sessionId));
    } catch {
      // Session selection may not have been written yet.
    }
  }
}

export async function queryRuntimeToken(
  rootDir: string,
  id: string,
  expectedToken: string
): Promise<IntentRuntimeTokenResult> {
  const unavailable = (detail: string): IntentRuntimeTokenResult => ({
    ok: false,
    status: "unavailable",
    id,
    expectedToken,
    renderedInstanceCount: 0,
    matchingInstanceCount: 0,
    visibleInstanceCount: 0,
    route: null,
    detail
  });
  const sessions = readRuntimeSessions(rootDir);
  if (sessions.length === 0) return unavailable("No active Vite runtime session is available.");

  const deadline = Date.now() + 2_500;
  let lastResult: IntentRuntimeTokenResult | null = null;
  while (Date.now() < deadline) {
    const results = await Promise.all(
      sessions.map(async (session): Promise<IntentRuntimeTokenResult> => {
        try {
          const response = await fetch(`${session.url}/__intent/runtime-query`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${session.token}`,
              "content-type": "application/json"
            },
            body: JSON.stringify({ id, expectedToken }),
            signal: AbortSignal.timeout(Math.max(250, deadline - Date.now()))
          });
          return response.ok
            ? ((await response.json()) as IntentRuntimeTokenResult)
            : unavailable(`Runtime query failed with HTTP ${response.status}.`);
        } catch (error) {
          return unavailable(error instanceof Error ? error.message : String(error));
        }
      })
    );
    const verified = results.find((result) => result.status === "verified");
    if (verified) return verified;
    lastResult = results.find((result) => result.status === "drifted") ?? results[0] ?? null;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return lastResult ?? unavailable("Runtime verification timed out.");
}
