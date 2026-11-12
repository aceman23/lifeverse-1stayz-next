import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Decision code depends on domain contracts and model ports, never delivery,
  // persistence, Next.js request state or presentation modules.
  {
    files: ["src/lib/agent/**/*.ts", "src/lib/domain/**/*.ts", "src/lib/jobs/runner.ts", "src/lib/jobs/catalog.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        group: ["next", "next/**", "@supabase/**", "@/app/**", "@/views/**", "@/components/**", "@/lib/inbox/**", "@/lib/messaging/**", "@/lib/supabase/**", "@/lib/jobs/http", "@/lib/jobs/execute"],
        message: "Keep decisions and execution policy independent of HTTP, persistence and presentation adapters.",
      }] }],
    },
  },
  // Supabase edge functions are Deno code, checked with `deno check` / `deno test`.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "supabase/functions/**"]),
]);

export default eslintConfig;
