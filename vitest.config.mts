import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // Each test file boots its own PGlite database; one worker per core overloads the machine and times tests out.
    maxWorkers: "50%",
    hookTimeout: 60_000,
    env: { NODE_ENV: "test" },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});
