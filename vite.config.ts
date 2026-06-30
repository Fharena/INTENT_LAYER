import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { intentLayer } from "./src/intent/vitePlugin";

export default defineConfig({
  plugins: [intentLayer(), react()]
});
