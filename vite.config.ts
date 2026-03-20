import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: {
    fs: {
      allow: [".."],
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
