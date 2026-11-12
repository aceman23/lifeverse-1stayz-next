import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for server code that doesn't need a database (src/**/*.test.ts).
// Database rules are tested in SQL (supabase/tests).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `import "server-only"` throws outside a React Server Components build.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Model-call log lines are expected; show output only for failing tests.
    silent: "passed-only",
  },
});
