import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: {
    fs: {
      allow: [".."],
    },
    proxy: {
      "/api": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
