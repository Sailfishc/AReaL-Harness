import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./mobile", import.meta.url)),
  base: "./",
  plugins: [react(), tailwindcss()],
  publicDir: false,
  build: {
    target: "safari17.4",
    outDir: "../../dist/mobile",
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: "assets/mobile.js" } },
  },
});
