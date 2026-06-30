import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { recordAgentResult } from "./agentResult";
import { createAgentTask } from "./agentTask";
import { instrumentSource } from "./instrument";
import {
  applyTokenPatch,
  discardPendingUndo,
  pendingUndoHistoryFromOperationLog,
  pendingUndoStackFromOperationLog,
  planTokenPatch,
  readPatchConflictReport,
  recordPatchApplyInOperationLog,
  recordPatchRevertInOperationLog,
  removeDiscardedPatchFromStack,
  revertTokenPatch,
  resolvePatchConflict,
  undoHistoryFromStack
} from "./patch";
import type {
  AgentResultRequest,
  AgentTaskRequest,
  ClientMetric,
  IntentBinding,
  IntentGraph,
  PatchApplyResult,
  PatchConflictResolveRequest,
  PatchRequest,
  PatchUndoDiscardRequest
} from "./types";

interface IntentState {
  rootDir: string;
  entriesByFile: Map<string, IntentBinding[]>;
  entriesById: Map<string, IntentBinding>;
  undoStack: PatchApplyResult[];
  clientMetrics: ClientMetric[];
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

function toGraph(state: IntentState): IntentGraph {
  const entries: Record<string, IntentBinding> = {};

  for (const [id, entry] of state.entriesById.entries()) {
    entries[id] = entry;
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries
  };
}

function publishGraph(state: IntentState) {
  const graph = toGraph(state);
  const output = path.join(state.rootDir, ".intent", "graph.intent.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(graph, null, 2)}\n`);
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

export function intentLayerSpike(): Plugin {
  const state: IntentState = {
    rootDir: process.cwd(),
    entriesByFile: new Map(),
    entriesById: new Map(),
    undoStack: [],
    clientMetrics: []
  };

  return {
    name: "intent-layer-spike",
    enforce: "pre",

    configResolved(config) {
      state.rootDir = config.root;
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
        code: result.code,
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
          if (state.undoStack.length === 0) {
            const restored = pendingUndoHistoryFromOperationLog(state.rootDir);
            writeJson(response, 200, restored);
          } else {
            writeJson(response, 200, undoHistoryFromStack(state.undoStack));
          }
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
            if (state.undoStack.length === 0) {
              state.undoStack = pendingUndoStackFromOperationLog(state.rootDir);
            }
            const lastPatch = state.undoStack[state.undoStack.length - 1] ?? null;
            const entry = lastPatch ? state.entriesById.get(lastPatch.id) : undefined;
            const result = revertTokenPatch(state.rootDir, lastPatch, entry);
            if (result.ok) {
              state.undoStack.pop();
              recordPatchRevertInOperationLog(state.rootDir, result);
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
