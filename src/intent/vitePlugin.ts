import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import ts from "typescript";
import type { Plugin, ViteDevServer } from "vite";
import { launchAgentTask } from "./agentLaunch";
import { recordAgentResult } from "./agentResult";
import { createAgentTask } from "./agentTask";
import { instrumentSource } from "./instrument";
import { applyIntentSetup, intentSetupStatus } from "./setup";
import {
  applyTokenPatch,
  discardPendingUndo,
  pendingUndoStackFromOperationLog,
  planTokenPatch,
  readPatchConflictReport,
  recordPatchApplyInOperationLog,
  recordPatchRevertInOperationLog,
  removeDiscardedPatchFromStack,
  revertPendingUndo,
  revertTokenPatch,
  resolvePatchConflict,
  undoHistoryFromStack
} from "./patch";
import type {
  AgentResultRequest,
  AgentLaunchRequest,
  AgentTaskRequest,
  ClientMetric,
  IntentBinding,
  IntentGraph,
  IntentSetupRequest,
  PatchApplyResult,
  PatchConflictResolveRequest,
  PatchRequest,
  PatchUndoDiscardRequest,
  PatchUndoRevertRequest
} from "./types";

const virtualClientId = "virtual:intent-layer/client";
const resolvedVirtualClientId = "\0virtual:intent-layer/client.ts";
const virtualTailwindId = "virtual:intent-layer/tailwind";
const resolvedVirtualTailwindId = "\0virtual:intent-layer/tailwind.ts";

interface IntentState {
  rootDir: string;
  entriesByFile: Map<string, IntentBinding[]>;
  entriesById: Map<string, IntentBinding>;
  undoStack: PatchApplyResult[];
  clientMetrics: ClientMetric[];
  lastPublishedEntriesJson: string | null;
  lastPublishedGeneratedAt: string | null;
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value, null, 2));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function graphOutputPath(state: IntentState): string {
  return path.join(state.rootDir, ".intent", "graph.intent.json");
}

function graphEntries(state: IntentState): Record<string, IntentBinding> {
  const entries: Record<string, IntentBinding> = {};

  for (const id of [...state.entriesById.keys()].sort()) {
    const entry = state.entriesById.get(id);
    if (entry) {
      entries[id] = entry;
    }
  }

  return entries;
}

function toGraph(state: IntentState): IntentGraph {
  return {
    version: 1,
    generatedAt: state.lastPublishedGeneratedAt ?? new Date().toISOString(),
    entries: graphEntries(state)
  };
}

function nextGraphGeneratedAt(state: IntentState): string {
  const next = new Date();
  const previousMs = state.lastPublishedGeneratedAt ? Date.parse(state.lastPublishedGeneratedAt) : Number.NaN;

  if (Number.isFinite(previousMs) && next.getTime() <= previousMs) {
    next.setTime(previousMs + 1);
  }

  return next.toISOString();
}

function graphPublishFingerprint(entries: Record<string, IntentBinding>): string {
  return JSON.stringify(entries, (key, value) => (key === "transformMs" ? 0 : value));
}

function publishGraph(state: IntentState) {
  const entries = graphEntries(state);
  const entriesJson = graphPublishFingerprint(entries);
  const output = graphOutputPath(state);

  if (
    state.lastPublishedEntriesJson === entriesJson &&
    state.lastPublishedGeneratedAt &&
    fs.existsSync(output)
  ) {
    return;
  }

  const generatedAt = nextGraphGeneratedAt(state);
  const graph: IntentGraph = {
    version: 1,
    generatedAt,
    entries
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(graph, null, 2)}\n`);
  state.lastPublishedEntriesJson = entriesJson;
  state.lastPublishedGeneratedAt = generatedAt;
}

function replaceFileEntries(state: IntentState, file: string, entries: IntentBinding[]) {
  const previous = state.entriesByFile.get(file) ?? [];
  for (const entry of previous) {
    state.entriesById.delete(entry.id);
  }

  state.entriesByFile.set(file, entries);
  for (const entry of entries) {
    state.entriesById.set(entry.id, entry);
  }
}

function isTargetFile(id: string): boolean {
  return /\.[jt]sx$/.test(id) && !id.includes("/node_modules/") && !id.includes("\\node_modules\\");
}

function refreshChangedFile(state: IntentState, file: string) {
  if (!isTargetFile(file) || !fs.existsSync(file)) {
    return;
  }

  const result = instrumentSource({
    code: fs.readFileSync(file, "utf8"),
    file,
    rootDir: state.rootDir
  });
  replaceFileEntries(state, file, result.entries);
  publishGraph(state);
}

function invalidateChangedFile(server: ViteDevServer, file: string) {
  const candidates = [...new Set([file, path.normalize(file), file.replace(/\\/g, "/")])];
  const timestamp = Date.now();

  for (const candidate of candidates) {
    server.moduleGraph.onFileChange(candidate);
    const modules = server.moduleGraph.getModulesByFile(candidate);
    if (!modules) {
      continue;
    }

    for (const moduleNode of modules) {
      server.moduleGraph.invalidateModule(moduleNode, undefined, timestamp, true);
    }
  }

  server.moduleGraph.invalidateAll();
}

function syncChangedFile(server: ViteDevServer, state: IntentState, file: string) {
  refreshChangedFile(state, file);
  invalidateChangedFile(server, file);
}

function isPatchInCurrentGraph(state: IntentState, patch: PatchApplyResult): boolean {
  const entry = state.entriesById.get(patch.id);
  if (!entry) {
    return false;
  }

  return path.resolve(entry.file) === path.resolve(patch.file);
}

function scopeUndoStackToCurrentGraph(state: IntentState, stack: PatchApplyResult[]): PatchApplyResult[] {
  return stack.filter((patch) => isPatchInCurrentGraph(state, patch));
}

function refreshUndoStackForCurrentGraph(state: IntentState): PatchApplyResult[] {
  const sourceStack =
    state.undoStack.length > 0 ? state.undoStack : pendingUndoStackFromOperationLog(state.rootDir);
  state.undoStack = scopeUndoStackToCurrentGraph(state, sourceStack);
  return state.undoStack;
}

function overlayBootstrapCode(code: string): string {
  if (code.includes(virtualClientId)) {
    return code;
  }

  return `${code}
import { initIntentOverlay as __intentLayerInitOverlay } from "${virtualClientId}";
if (import.meta.env.DEV) {
  __intentLayerInitOverlay();
}
`;
}

function stripTypeImports(source: string): string {
  return source.replace(/import type \{[\s\S]*?\} from "\.\/types";\r?\n/g, "");
}

function readClientModule() {
  return stripTypeImports(
    fs
      .readFileSync(path.join(__dirname, "client.ts"), "utf8")
      .replace("./tailwind", virtualTailwindId)
  );
}

function transpileVirtualModule(source: string, fileName: string): string {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      useDefineForClassFields: true
    }
  }).outputText;
}

export function intentLayerSpike(): Plugin {
  let isServe = false;
  const state: IntentState = {
    rootDir: process.cwd(),
    entriesByFile: new Map(),
    entriesById: new Map(),
    undoStack: [],
    clientMetrics: [],
    lastPublishedEntriesJson: null,
    lastPublishedGeneratedAt: null
  };

  return {
    name: "intent-layer",
    enforce: "pre",

    configResolved(config) {
      state.rootDir = config.root;
      isServe = config.command === "serve";
    },

    resolveId(id) {
      if (id === virtualClientId) {
        return resolvedVirtualClientId;
      }
      if (id === virtualTailwindId) {
        return resolvedVirtualTailwindId;
      }
      return null;
    },

    load(id) {
      if (id === resolvedVirtualClientId) {
        return transpileVirtualModule(readClientModule(), "intent-layer-client.ts");
      }
      if (id === resolvedVirtualTailwindId) {
        return transpileVirtualModule(
          stripTypeImports(fs.readFileSync(path.join(__dirname, "tailwind.ts"), "utf8")),
          "intent-layer-tailwind.ts"
        );
      }
      return null;
    },

    transform(code, id) {
      if (!isTargetFile(id)) {
        return null;
      }

      const result = instrumentSource({
        code,
        file: id,
        rootDir: state.rootDir
      });

      replaceFileEntries(state, id, result.entries);
      publishGraph(state);

      if (result.entries.length === 0) {
        return null;
      }

      return {
        code: isServe ? overlayBootstrapCode(result.code) : result.code,
        map: null
      };
    },

    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://intent-layer.local");

        if (url.pathname === "/__intent/graph" && request.method === "GET") {
          writeJson(response, 200, toGraph(state));
          return;
        }

        if (url.pathname === "/__intent/setup" && request.method === "GET") {
          const language = url.searchParams.get("language") === "ko" ? "ko" : undefined;
          writeJson(
            response,
            200,
            intentSetupStatus(state.rootDir, {
              graphEntryCount: state.entriesById.size,
              language
            })
          );
          return;
        }

        if (url.pathname === "/__intent/setup" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as IntentSetupRequest;
            const result = applyIntentSetup(state.rootDir, body, {
              graphEntryCount: state.entriesById.size
            });
            writeJson(response, 200, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/client-metrics" && request.method === "GET") {
          writeJson(response, 200, {
            version: 1,
            generatedAt: new Date().toISOString(),
            metrics: state.clientMetrics
          });
          return;
        }

        if (url.pathname === "/__intent/client-metrics" && request.method === "DELETE") {
          state.clientMetrics = [];
          writeJson(response, 200, {
            ok: true,
            metrics: []
          });
          return;
        }

        if (url.pathname === "/__intent/client-metric" && request.method === "POST") {
          try {
            const metric = JSON.parse(await readBody(request)) as ClientMetric;
            state.clientMetrics.push(metric);
            state.clientMetrics = state.clientMetrics.slice(-100);
            writeJson(response, 200, { ok: true });
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/undo-history" && request.method === "GET") {
          writeJson(response, 200, undoHistoryFromStack(refreshUndoStackForCurrentGraph(state)));
          return;
        }

        if (url.pathname === "/__intent/conflicts" && request.method === "GET") {
          writeJson(response, 200, readPatchConflictReport(state.rootDir));
          return;
        }

        if (
          (url.pathname === "/__intent/preview" || url.pathname === "/__intent/apply") &&
          request.method === "POST"
        ) {
          try {
            const body = JSON.parse(await readBody(request)) as PatchRequest;
            const entry = state.entriesById.get(body.id);
            if (url.pathname === "/__intent/apply") {
              const result = applyTokenPatch(state.rootDir, entry, body);
              if (result.ok) {
                state.undoStack.push(result);
                recordPatchApplyInOperationLog(state.rootDir, result);
                syncChangedFile(server, state, result.file);
              }
              writeJson(response, result.ok ? 200 : 409, result);
            } else {
              const result = planTokenPatch(entry, body);
              writeJson(response, result.ok ? 200 : 409, result);
            }
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/revert-last" && request.method === "POST") {
          try {
            refreshUndoStackForCurrentGraph(state);
            const lastPatch = state.undoStack[state.undoStack.length - 1] ?? null;
            const entry = lastPatch ? state.entriesById.get(lastPatch.id) : undefined;
            const result = revertTokenPatch(state.rootDir, lastPatch, entry);
            if (result.ok) {
              state.undoStack.pop();
              recordPatchRevertInOperationLog(state.rootDir, result);
              syncChangedFile(server, state, result.file);
            }
            writeJson(response, result.ok ? 200 : 409, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/resolve-conflict" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as PatchConflictResolveRequest;
            const result = resolvePatchConflict(state.rootDir, body);
            if (result.ok) {
              state.undoStack = removeDiscardedPatchFromStack(state.undoStack, result.discardedPatch);
            }
            writeJson(response, result.ok ? 200 : 409, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/discard-undo" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as PatchUndoDiscardRequest;
            const result = discardPendingUndo(state.rootDir, body);
            if (result.ok) {
              state.undoStack = removeDiscardedPatchFromStack(state.undoStack, result.discardedPatch);
            }
            writeJson(response, result.ok ? 200 : 409, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/revert-undo" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as PatchUndoRevertRequest;
            refreshUndoStackForCurrentGraph(state);
            const patch = state.undoStack.find((item) => item.operationFile === body.operationFile);
            const entry = patch ? state.entriesById.get(patch.id) : undefined;
            const result = revertPendingUndo(state.rootDir, entry, body);
            if (result.ok) {
              state.undoStack = state.undoStack.filter((item) => item.operationFile !== body.operationFile);
              syncChangedFile(server, state, result.file);
            }
            writeJson(response, result.ok ? 200 : 409, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/agent-task" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as AgentTaskRequest;
            const entry = state.entriesById.get(body.id);
            const result = createAgentTask(state.rootDir, entry, body);
            writeJson(response, result.ok ? 200 : 409, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/agent-launch" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as AgentLaunchRequest;
            let taskFile = body.taskFile;
            if (!taskFile && body.id && body.desiredChange) {
              const entry = state.entriesById.get(body.id);
              const task = createAgentTask(state.rootDir, entry, {
                id: body.id,
                desiredChange: body.desiredChange
              });
              if (!task.ok) {
                writeJson(response, 409, task);
                return;
              }
              taskFile = task.taskFile;
            }
            const result = launchAgentTask(state.rootDir, {
              ...body,
              taskFile
            });
            writeJson(response, result.ok ? 200 : 409, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/agent-result" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as AgentResultRequest;
            const entry = state.entriesById.get(body.id);
            const result = recordAgentResult(state.rootDir, entry, body);
            writeJson(response, result.ok ? 200 : 409, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        next();
      });
    }
  };
}

export function intentLayer(): Plugin {
  return intentLayerSpike();
}
