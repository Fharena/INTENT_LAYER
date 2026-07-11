import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Plugin, ViteDevServer } from "vite";
import { launchAgentTask } from "./agentLaunch";
import { claimAgentTask, failAgentTask, refreshAgentQueueSignal } from "./agentQueue";
import { recordAgentResult } from "./agentResult";
import { createAgentTask } from "./agentTask";
import { IntentGraphStore, isIntentTargetFile } from "./graphStore";
import { IntentService } from "./intentService";
import { instrumentSource } from "./instrument";
import {
  readRuntimeSelection,
  removeRuntimeSession,
  writeRuntimeSelection,
  writeRuntimeSession
} from "./runtimeSession";
import { applyIntentSetup, intentSetupStatus } from "./setup";
import type {
  AgentResultRequest,
  AgentLaunchRequest,
  AgentTaskClaimRequest,
  AgentTaskRequest,
  AgentTaskStatusUpdateRequest,
  ClientMetric,
  GridLayoutApplyRequest,
  GridLayoutEditRequest,
  GridLayoutInspectRequest,
  IntentSetupRequest,
  IntentRuntimeSelectionRequest,
  IntentRuntimeTokenResult,
  PatchConflictResolveRequest,
  PatchRequest,
  PatchUndoDiscardRequest,
  PatchUndoRevertRequest
} from "./types";

const virtualClientId = "virtual:intent-layer/client";
const resolvedVirtualClientId = "\0virtual:intent-layer/client.ts";
const virtualTailwindId = "virtual:intent-layer/tailwind";
const resolvedVirtualTailwindId = "\0virtual:intent-layer/tailwind.ts";
const intentMutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

interface OverlayState {
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

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}

export function intentMutationRequestAllowed(request: IncomingMessage, sessionToken: string): boolean {
  return (
    isLoopbackAddress(request.socket.remoteAddress) &&
    request.headers["x-intent-layer-token"] === sessionToken
  );
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

function runtimeModulePath(name: "client" | "tailwind"): string {
  const built = path.join(moduleDir, `${name}.js`);
  return fs.existsSync(built) ? built : path.join(moduleDir, `${name}.ts`);
}

function readClientModule(sessionToken: string) {
  return stripTypeImports(
    fs
      .readFileSync(runtimeModulePath("client"), "utf8")
      .replace("./tailwind", virtualTailwindId)
      .replaceAll("__INTENT_LAYER_SESSION_TOKEN__", sessionToken)
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
  const runtimeToken = randomBytes(24).toString("hex");
  const graphStore = new IntentGraphStore(process.cwd());
  const intentService = new IntentService(graphStore);
  const state: OverlayState = { clientMetrics: [] };

  return {
    name: "intent-layer",
    enforce: "pre",

    configResolved(config) {
      graphStore.setRootDir(config.root);
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
        return transpileVirtualModule(readClientModule(runtimeToken), "intent-layer-client.ts");
      }
      if (id === resolvedVirtualTailwindId) {
        return transpileVirtualModule(
          stripTypeImports(fs.readFileSync(runtimeModulePath("tailwind"), "utf8")),
          "intent-layer-tailwind.ts"
        );
      }
      return null;
    },

    transform(code, id) {
      if (!isIntentTargetFile(id)) {
        return null;
      }

      const result = instrumentSource({
        code,
        file: id,
        rootDir: graphStore.rootDir
      });

      graphStore.replaceFileEntries(id, result.entries);
      graphStore.publish();

      if (result.entries.length === 0) {
        return null;
      }

      return {
        code: isServe ? overlayBootstrapCode(result.code) : result.code,
        map: null
      };
    },

    configureServer(server) {
      intentService.setSourceChanged((file) => invalidateChangedFile(server, file));
      const pendingRuntimeQueries = new Map<
        string,
        {
          resolve: (result: IntentRuntimeTokenResult) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >();
      server.ws.on("intent:runtime-result", (data: unknown) => {
        if (!data || typeof data !== "object") return;
        const result = data as IntentRuntimeTokenResult & { requestId?: string };
        if (!result.requestId) return;
        const pending = pendingRuntimeQueries.get(result.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingRuntimeQueries.delete(result.requestId);
        pending.resolve(result);
      });

      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        if (!address || typeof address === "string") return;
        writeRuntimeSession(intentService.rootDir, {
          url: `http://127.0.0.1:${address.port}`,
          token: runtimeToken
        });
      });
      server.httpServer?.once("close", () => {
        removeRuntimeSession(intentService.rootDir, runtimeToken);
      });

      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://intent-layer.local");
        const mutation = intentMutationMethods.has(request.method ?? "");

        if (
          mutation &&
          url.pathname.startsWith("/__intent/") &&
          url.pathname !== "/__intent/runtime-query" &&
          !intentMutationRequestAllowed(request, runtimeToken)
        ) {
          writeJson(response, 403, {
            ok: false,
            reason: "unsafe-intent-request",
            detail: "Intent Layer source-changing requests require a loopback connection and session token."
          });
          return;
        }

        if (url.pathname === "/__intent/runtime-query" && request.method === "POST") {
          if (
            !isLoopbackAddress(request.socket.remoteAddress) ||
            request.headers.authorization !== `Bearer ${runtimeToken}`
          ) {
            writeJson(response, 401, { ok: false, reason: "unauthorized" });
            return;
          }
          try {
            const body = JSON.parse(await readBody(request)) as {
              id?: string;
              expectedToken?: string;
            };
            if (!body.id || !body.expectedToken || !intentService.getEntry(body.id)) {
              writeJson(response, 400, { ok: false, reason: "invalid-runtime-query" });
              return;
            }
            const requestId = randomUUID();
            const result = await new Promise<IntentRuntimeTokenResult>((resolve) => {
              const timer = setTimeout(() => {
                pendingRuntimeQueries.delete(requestId);
                resolve({
                  ok: false,
                  status: "unavailable",
                  id: body.id!,
                  expectedToken: body.expectedToken!,
                  renderedInstanceCount: 0,
                  matchingInstanceCount: 0,
                  visibleInstanceCount: 0,
                  route: null,
                  detail: "No browser client answered the runtime query."
                });
              }, 1_500);
              pendingRuntimeQueries.set(requestId, { resolve, timer });
              server.ws.send("intent:runtime-query", {
                requestId,
                id: body.id,
                expectedToken: body.expectedToken
              });
            });
            writeJson(response, 200, result);
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              status: "unavailable",
              reason: "runtime-query-failed",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/graph" && request.method === "GET") {
          writeJson(response, 200, intentService.graph());
          return;
        }

        if (url.pathname === "/__intent/selection" && request.method === "GET") {
          writeJson(response, 200, readRuntimeSelection(intentService.rootDir));
          return;
        }

        if (url.pathname === "/__intent/selection" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as IntentRuntimeSelectionRequest;
            const result = writeRuntimeSelection(
              intentService.rootDir,
              body.id ? intentService.getEntry(body.id) : undefined,
              body
            );
            writeJson(response, 200, result);
          } catch (error) {
            writeJson(response, 409, {
              ok: false,
              reason: "invalid-selection",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/setup" && request.method === "GET") {
          const language = url.searchParams.get("language") === "ko" ? "ko" : undefined;
          writeJson(
            response,
            200,
            intentSetupStatus(intentService.rootDir, {
              graphEntryCount: graphStore.size,
              language
            })
          );
          return;
        }

        if (url.pathname === "/__intent/setup" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as IntentSetupRequest;
            const result = applyIntentSetup(intentService.rootDir, body, {
              graphEntryCount: graphStore.size
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
          writeJson(response, 200, intentService.undoHistory());
          return;
        }

        if (url.pathname === "/__intent/conflicts" && request.method === "GET") {
          writeJson(response, 200, intentService.conflicts());
          return;
        }

        if (url.pathname === "/__intent/grid-layout/inspect" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as GridLayoutInspectRequest;
            const result = intentService.inspectGridLayout(body);
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

        if (url.pathname === "/__intent/grid-layout/preview" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as GridLayoutEditRequest;
            const result = intentService.previewGridLayout(body);
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

        if (url.pathname === "/__intent/grid-layout/apply" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as GridLayoutApplyRequest;
            const result = intentService.applyGridLayout(body);
            writeJson(
              response,
              result.ok ? 200 : 409,
              result.ok
                ? { ...result, binding: intentService.getEntry(result.id) ?? null }
                : result
            );
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (
          (url.pathname === "/__intent/preview" || url.pathname === "/__intent/apply") &&
          request.method === "POST"
        ) {
          try {
            const body = JSON.parse(await readBody(request)) as PatchRequest;
            if (url.pathname === "/__intent/apply") {
              const result = intentService.applyToken(body);
              writeJson(
                response,
                result.ok ? 200 : 409,
                result.ok
                  ? { ...result, binding: intentService.getEntry(result.id) ?? null }
                  : result
              );
            } else {
              const result = intentService.previewToken(body);
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
            const result = intentService.revertLatest();
            writeJson(
              response,
              result.ok ? 200 : 409,
              result.ok
                ? { ...result, binding: intentService.getEntry(result.id) ?? null }
                : result
            );
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
            const result = intentService.resolveConflict(body);
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
            const result = intentService.discardUndo(body);
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
            const result = intentService.revertUndo(body);
            writeJson(
              response,
              result.ok ? 200 : 409,
              result.ok
                ? { ...result, binding: intentService.getEntry(result.id) ?? null }
                : result
            );
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
            const entry = intentService.getEntry(body.id);
            const result = createAgentTask(intentService.rootDir, entry, body);
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

        if (url.pathname === "/__intent/agent-queue" && request.method === "GET") {
          try {
            writeJson(response, 200, refreshAgentQueueSignal(intentService.rootDir));
          } catch (error) {
            writeJson(response, 500, {
              ok: false,
              reason: "server-error",
              detail: error instanceof Error ? error.message : String(error)
            });
          }
          return;
        }

        if (url.pathname === "/__intent/agent-claim" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as AgentTaskClaimRequest;
            const result = claimAgentTask(intentService.rootDir, body);
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

        if (url.pathname === "/__intent/agent-fail" && request.method === "POST") {
          try {
            const body = JSON.parse(await readBody(request)) as AgentTaskStatusUpdateRequest;
            const result = failAgentTask(intentService.rootDir, body);
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
              const entry = intentService.getEntry(body.id);
              const task = createAgentTask(intentService.rootDir, entry, {
                id: body.id,
                desiredChange: body.desiredChange
              });
              if (!task.ok) {
                writeJson(response, 409, task);
                return;
              }
              taskFile = task.taskFile;
            }
            const result = launchAgentTask(intentService.rootDir, {
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
            const entry = intentService.getEntry(body.id);
            const result = recordAgentResult(intentService.rootDir, entry, body);
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
