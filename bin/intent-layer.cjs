#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const cliFile = path.resolve(__dirname, "..", "src", "intent", "cli.ts");
const tsxCli = require.resolve("tsx/cli");

const child = spawn(process.execPath, [tsxCli, cliFile, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 0;
});

child.on("error", (error) => {
  process.stderr.write(`intent-layer failed to start: ${error.message}\n`);
  process.exitCode = 1;
});
