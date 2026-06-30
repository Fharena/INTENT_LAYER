import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createAgentTask } from "./agentTask";
import { instrumentSource } from "./instrument";
import { applyTokenPatch, planTokenPatch, revertTokenPatch } from "./patch";
import type {
  AgentTaskRequest,
  IntentBinding,
  IntentGraph,
  PatchApplyResult,
  PatchRequest
} from "./types";

interface IntentState {
  rootDir: string;
  entriesByFile: Map<string, IntentBinding[]>;
  entriesById: Map<string, IntentBinding>;
  lastAppliedPatch: PatchApplyResult | null;
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
    lastAppliedPatch: null
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
                state.lastAppliedPatch = result;
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
            const entry = state.lastAppliedPatch
              ? state.entriesById.get(state.lastAppliedPatch.id)
              : undefined;
            const result = revertTokenPatch(state.rootDir, state.lastAppliedPatch, entry);
            if (result.ok) {
              state.lastAppliedPatch = null;
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

        next();
      });
    }
  };
}
