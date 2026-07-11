import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  queryRuntimeToken,
  readRuntimeSession,
  readRuntimeSessions,
  removeRuntimeSession,
  writeRuntimeSession
} from "./runtimeSession";

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
});
