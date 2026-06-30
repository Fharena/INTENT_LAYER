"use strict";

require("tsx/cjs");

const vitePlugin = require("./src/intent/vitePlugin.ts");

exports.intentLayer = vitePlugin.intentLayer;
exports.intentLayerSpike = vitePlugin.intentLayerSpike;
exports.default = vitePlugin.intentLayer;
