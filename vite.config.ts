import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { intentLayerSpike } from "./src/intent/vitePlugin";

export default defineConfig({
  plugins: [intentLayerSpike(), react()]
});
