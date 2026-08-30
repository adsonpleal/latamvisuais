/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

// Every script in tools/ opens with `#!/usr/bin/env node`. Vite hands .mjs to
// the loader untransformed, so that shebang arrives as an invalid token and any
// test importing one dies at parse time with "SyntaxError: Invalid or unexpected
// token" — blamed on the *test* file's line numbers, which makes it look like a
// comment is at fault. Strip it in-memory (the files keep theirs) so
// tools/*.test.mjs can exercise the transforms.
const stripShebang = {
  name: "strip-shebang",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.endsWith(".mjs") || !code.startsWith("#!")) return null;
    // Replaced by a blank line, not removed, so every later line keeps its
    // number in stack traces and source maps.
    return { code: code.replace(/^#![^\n]*/, ""), map: null };
  },
};

export default defineConfig({
  base: "./",
  plugins: [react(), stripShebang],
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
