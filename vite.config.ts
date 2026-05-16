import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/zustand")) return "react";
          if (id.includes("node_modules/konva") || id.includes("node_modules/react-konva")) return "canvas";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("/src/simulation/")) return "simulation";
          if (id.includes("/src/analytics/")) return "analytics";
          if (id.includes("/src/generators/")) return "generation";
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    exclude: ["node_modules", "dist", "e2e"],
    testTimeout: 10000
  }
});
