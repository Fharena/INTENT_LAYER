#!/usr/bin/env node
import path from "node:path";
import { runIntentMcpServer } from "./server";

function rootFromArgs(args: string[]): string {
  const index = args.indexOf("--root");
  return path.resolve(index >= 0 && args[index + 1] ? args[index + 1] : process.cwd());
}

runIntentMcpServer({ rootDir: rootFromArgs(process.argv.slice(2)) }).catch((error) => {
  process.stderr.write(`Intent Layer MCP failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
