import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "zustand"],
          canvas: ["konva", "react-konva"],
          icons: ["lucide-react"]
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
