import path from "node:path";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        offscreen: path.resolve(__dirname, "src/offscreen/offscreen.html"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          const id = chunkInfo.facadeModuleId ?? "";
          if (id.includes("sidepanel")) {
            return "assets/sidepanel-[hash].js";
          }
          if (id.includes("offscreen")) {
            return "assets/offscreen-[hash].js";
          }
          if (id.includes("options")) {
            return "assets/options-[hash].js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "sidepanel-vendor";
          }
        },
      },
    },
  },
});
