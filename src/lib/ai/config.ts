import { ModelConfigError, type AiFeature, type ModelRole, type ProviderName } from "./types";

export const AI_FEATURES: readonly AiFeature[] = ["onboarding", "messaging", "evals"];

/** Which provider serves each role. The model itself is chosen by env (benchmark decides). */
export const ROLE_PROVIDER: Record<ModelRole, Exclude<ProviderName, "stub">> = {
  fast: "groq",
  frontier: "anthropic",
};

// Defaults until the model-selection benchmark (week 6) picks the final models.
const DEFAULT_MODELS: Record<ModelRole, string> = {
  fast: "openai/gpt-oss-120b",
  frontier: "claude-sonnet-5-5",
};

/**
 * Env var holding the key for one feature and provider, e.g.
 * AI_MESSAGING_GROQ_API_KEY or AI_ONBOARDING_ANTHROPIC_API_KEY.
 * Same names in every environment; Vercel holds a different key per environment.
 */
export function keyEnvName(feature: AiFeature, provider: Exclude<ProviderName, "stub">): string {
  return `AI_${feature.toUpperCase()}_${provider.toUpperCase()}_API_KEY`;
}

/** AI_FAST_MODEL / AI_FRONTIER_MODEL override the defaults for every feature. */
export function modelFor(role: ModelRole): string {
  const fromEnv = role === "fast" ? process.env.AI_FAST_MODEL : process.env.AI_FRONTIER_MODEL;
  return fromEnv?.trim() || DEFAULT_MODELS[role];
}

/** AI_STUB=1 routes every call to the stub provider: no keys needed, no spend. */
export function stubForced(): boolean {
  return process.env.AI_STUB === "1" || process.env.AI_STUB === "true";
}

export function apiKeyFor(feature: AiFeature, role: ModelRole): string {
  const name = keyEnvName(feature, ROLE_PROVIDER[role]);
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ModelConfigError(
      `${name} is not set. Add the ${feature} key for ${ROLE_PROVIDER[role]} to the server environment, ` +
        `or set AI_STUB=1 to develop without keys.`,
    );
  }
  return value;
}
