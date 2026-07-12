import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IntentGraphStore } from "./graphStore";
import type { IntentBinding, IntentGraph } from "./types";

const roots: string[] = [];

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-graph-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  return root;
}

function binding(root: string, relativeFile: string, id: string, token = "p-4"): IntentBinding {
  const file = path.join(root, relativeFile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `export const value = "${token}";\n`, "utf8");
  return {
    id,
    file,
    relativeFile: relativeFile.replace(/\\/g, "/"),
    tagName: "div",
    componentName: "Fixture",
    sourceHash: `${id}-hash`,
    transformMs: 1,
    className: { kind: "static", start: 0, end: token.length, value: token, dynamicSegments: 0 },
    tokens: []
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("multi-session graph publishing", () => {
  it("merges files owned by separate Vite graph stores", () => {
    const root = workspace();
    const first = new IntentGraphStore(root);
    const second = new IntentGraphStore(root);
    const appFile = path.join(root, "src", "App.tsx");
    const routeFile = path.join(root, "src", "Route.tsx");

    first.replaceFileEntries(appFile, [binding(root, "src/App.tsx", "app")]);
    first.publish();
    second.replaceFileEntries(routeFile, [binding(root, "src/Route.tsx", "route")]);
    second.publish();

    let graph = JSON.parse(
      fs.readFileSync(path.join(root, ".intent", "graph.intent.json"), "utf8")
    ) as IntentGraph;
    expect(Object.keys(graph.entries).sort()).toEqual(["app", "route"]);

    first.replaceFileEntries(appFile, [binding(root, "src/App.tsx", "app-next", "p-6")]);
    first.publish();
    graph = JSON.parse(
      fs.readFileSync(path.join(root, ".intent", "graph.intent.json"), "utf8")
    ) as IntentGraph;
    expect(Object.keys(graph.entries).sort()).toEqual(["app-next", "route"]);
  });

  it("removes only entries for a file owned by the publishing store", () => {
    const root = workspace();
    const first = new IntentGraphStore(root);
    const second = new IntentGraphStore(root);
    const appFile = path.join(root, "src", "App.tsx");
    const routeFile = path.join(root, "src", "Route.tsx");
    first.replaceFileEntries(appFile, [binding(root, "src/App.tsx", "app")]);
    first.publish();
    second.replaceFileEntries(routeFile, [binding(root, "src/Route.tsx", "route")]);
    second.publish();

    first.replaceFileEntries(appFile, []);
    first.publish();

    const graph = JSON.parse(
      fs.readFileSync(path.join(root, ".intent", "graph.intent.json"), "utf8")
    ) as IntentGraph;
    expect(Object.keys(graph.entries)).toEqual(["route"]);
  });
});
