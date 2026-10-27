import { defineConfig } from "vite-plus";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./mobile", import.meta.url)),
  base: "./",
  publicDir: false,
  build: {
    target: "safari17.4",
    outDir: "../../dist/mobile",
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: "assets/mobile.js" } },
  },
});
