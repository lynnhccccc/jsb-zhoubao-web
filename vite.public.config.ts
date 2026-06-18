import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const dataCacheVersion =
  process.env.DATA_CACHE_VERSION ??
  process.env.GITHUB_SHA ??
  new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

export default defineConfig({
  plugins: [react()],
  base: process.env.PUBLIC_BASE_PATH ?? "/",
  define: {
    __DATA_CACHE_VERSION__: JSON.stringify(dataCacheVersion),
  },
  root: "public-spa",
  publicDir: "../public",
  build: {
    outDir: "../public-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "public-spa/index.html"),
        flagship: resolve(__dirname, "public-spa/flagship/index.html"),
      },
    },
  },
});
