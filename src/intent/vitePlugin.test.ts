import type { IncomingMessage } from "node:http";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeConfig, normalizePath, type ConfigEnv, type UserConfig } from "vite";
import { intentLayer, intentMutationRequestAllowed, isLoopbackAddress } from "./vitePlugin";

function request(address: string, token: string): IncomingMessage {
  return {
    headers: { "x-intent-layer-token": token },
    socket: { remoteAddress: address }
  } as unknown as IncomingMessage;
}

describe("Intent Layer dev-server mutation boundary", () => {
  it("never instruments production builds", () => {
    expect(intentLayer().apply).toBe("serve");
  });

  it("keeps runtime artifacts out of the Vite watcher", async () => {
    const hook = intentLayer().config;
    expect(typeof hook).toBe("function");
    const root = path.resolve(".intent/tmp/nested-project");
    const expected = [
      `${normalizePath(root)}/.intent/**`,
      `${normalizePath(root)}/.intent-agent-queue.json*`
    ];
    const config = await (hook as (config: UserConfig, env: ConfigEnv) => UserConfig)(
      { root },
      { command: "serve", mode: "development", isSsrBuild: false, isPreview: false }
    );
    expect(config.server?.watch?.ignored).toEqual(expected);
    expect(
      mergeConfig({ server: { watch: { ignored: ["**/coverage/**"] } } }, config).server?.watch
        ?.ignored
    ).toEqual(["**/coverage/**", ...expected]);
  });

  it("accepts only a matching session token from loopback", () => {
    expect(intentMutationRequestAllowed(request("127.0.0.1", "session"), "session")).toBe(true);
    expect(intentMutationRequestAllowed(request("::1", "session"), "session")).toBe(true);
    expect(intentMutationRequestAllowed(request("127.0.0.1", "wrong"), "session")).toBe(false);
    expect(intentMutationRequestAllowed(request("192.168.1.20", "session"), "session")).toBe(false);
  });

  it("recognizes IPv4 and IPv6 loopback addresses", () => {
    expect(isLoopbackAddress("127.0.0.42")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("0.0.0.0")).toBe(false);
  });

  it("embeds the private session token in the virtual overlay client", async () => {
    const plugin = intentLayer();
    const resolveId = plugin.resolveId as (id: string) => string | null;
    const load = plugin.load as (id: string) => string | null;
    const resolved = await resolveId("virtual:intent-layer/client");
    expect(resolved).toBeTruthy();
    const code = await load(resolved!);
    expect(code).toContain("x-intent-layer-token");
    expect(code).not.toContain("__INTENT_LAYER_SESSION_TOKEN__");
  });
});
