import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const fromProjectRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromProjectRoot("./github-pages/"),
  base: "./",
  publicDir: fromProjectRoot("./public/"),
  plugins: [react()],
  build: {
    outDir: fromProjectRoot("./pages-dist/"),
    emptyOutDir: true,
  },
});
