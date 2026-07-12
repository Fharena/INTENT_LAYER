import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  queryRuntimeToken,
  readRuntimeSelection,
  readRuntimeSession,
  readRuntimeSessions,
  removeRuntimeSession,
  writeRuntimeSelection,
  writeRuntimeSession
} from "./runtimeSession";
import type { IntentBinding } from "./types";

const roots: string[] = [];
const servers: http.Server[] = [];

function rootFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-runtime-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve()))
    )
  );
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("runtime sessions", () => {
  it("returns unavailable when no Vite session is active", async () => {
    const result = await queryRuntimeToken(rootFixture(), "intent-id", "gap-6");
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("authenticates a loopback runtime query and removes only its own session", async () => {
    const root = rootFixture();
    const token = "runtime-secret";
    const server = http.createServer((request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          ok: true,
          status: "verified",
          id: "intent-id",
          expectedToken: "gap-6",
          renderedInstanceCount: 2,
          matchingInstanceCount: 2,
          visibleInstanceCount: 1,
          route: "/demo",
          detail: "verified"
        })
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    writeRuntimeSession(root, { url: `http://127.0.0.1:${address.port}`, token });

    const result = await queryRuntimeToken(root, "intent-id", "gap-6");
    expect(result).toMatchObject({
      ok: true,
      status: "verified",
      renderedInstanceCount: 2,
      matchingInstanceCount: 2
    });

    writeRuntimeSession(root, {
      url: `http://127.0.0.1:${address.port + 1}`,
      token: "another-token"
    });
    expect(readRuntimeSessions(root)).toHaveLength(2);
    removeRuntimeSession(root, "another-token");
    expect(readRuntimeSession(root)).not.toBeNull();
    removeRuntimeSession(root, token);
    expect(readRuntimeSession(root)).toBeNull();
  });

  it("keeps browser selections scoped to their Vite sessions", () => {
    const root = rootFixture();
    const first = writeRuntimeSession(root, { url: "http://127.0.0.1:4101", token: "first" });
    const second = writeRuntimeSession(root, { url: "http://127.0.0.1:4102", token: "second" });
    const binding = (id: string): IntentBinding => ({
      id,
      file: path.join(root, "src", "App.tsx"),
      relativeFile: "src/App.tsx",
      tagName: "div",
      componentName: "App",
      sourceHash: "hash",
      transformMs: 1,
      className: { kind: "static", start: 0, end: 3, value: "p-4", dynamicSegments: 0 },
      tokens: []
    });

    writeRuntimeSelection(root, binding("first-id"), { id: "first-id", route: "/first" }, first.sessionId);
    writeRuntimeSelection(root, binding("second-id"), { id: "second-id", route: "/second" }, second.sessionId);

    expect(readRuntimeSelection(root, first.sessionId)).toMatchObject({
      sessionId: first.sessionId,
      selection: { id: "first-id", route: "/first" }
    });
    expect(readRuntimeSelection(root, second.sessionId)).toMatchObject({
      sessionId: second.sessionId,
      selection: { id: "second-id", route: "/second" }
    });
    expect(Date.parse(readRuntimeSelection(root).freshUntil)).toBeGreaterThan(Date.now());

    removeRuntimeSession(root, "first");
    expect(readRuntimeSelection(root, first.sessionId).selection).toBeNull();
    expect(readRuntimeSelection(root, second.sessionId).selection?.id).toBe("second-id");
  });

  it("removes a dead session selection during discovery", () => {
    const root = rootFixture();
    const session = writeRuntimeSession(root, { url: "http://127.0.0.1:4199", token: "dead" });
    const sessionFile = path.join(root, ".intent", "runtime", "sessions", `${session.sessionId}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify({ ...session, pid: 2_147_483_647 }), "utf8");
    writeRuntimeSelection(
      root,
      {
        id: "dead-id",
        file: path.join(root, "src", "App.tsx"),
        relativeFile: "src/App.tsx",
        tagName: "div",
        componentName: "App",
        sourceHash: "hash",
        transformMs: 1,
        className: { kind: "static", start: 0, end: 3, value: "p-4", dynamicSegments: 0 },
        tokens: []
      },
      { id: "dead-id" },
      session.sessionId
    );

    expect(readRuntimeSessions(root)).toHaveLength(0);
    expect(readRuntimeSelection(root, session.sessionId).selection).toBeNull();
  });
});
