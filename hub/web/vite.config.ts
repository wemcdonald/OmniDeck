import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@codemirror") || id.includes("@uiw/react-codemirror") || id.includes("@lezer")) {
            return "vendor-codemirror";
          }
          if (id.includes("@iconify")) {
            return "vendor-icons";
          }
          if (id.includes("emoji-picker-react")) {
            return "vendor-emoji";
          }
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("scheduler")) {
            return "vendor-react";
          }
          if (id.includes("@tanstack")) {
            return "vendor-query";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:28120",
      "/ws": {
        target: "ws://localhost:28120",
        ws: true,
      },
    },
  },
});
