import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.mts";

// `npm run eval`: the agent eval set against real models (src/lib/agent/evals/agent.eval.ts).
// Not part of `npm test`: it needs the evals keys and costs a little per run.
export default mergeConfig(
  base,
  defineConfig({
    test: { include: ["src/**/*.eval.ts"], silent: false, testTimeout: 15 * 60_000 },
  }),
);
