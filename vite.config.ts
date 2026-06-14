/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // Honour a PORT env var when set (e.g. a preview harness assigns one);
  // otherwise fall back to Vite's default 5173.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // Skip transient git worktrees (.claude/worktrees/*) — they carry their own
    // node_modules, so a second React copy there breaks component tests with
    // "Invalid hook call".
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
