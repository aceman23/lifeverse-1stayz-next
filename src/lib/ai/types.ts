/**
 * Which part of 1Stayz is calling a model. Each feature has its own API keys
 * (one Groq project and one Claude workspace per feature), so usage and spend
 * show up separately in both consoles.
 */
export type AiFeature = "onboarding" | "messaging" | "evals";

/**
 * fast     = everyday replies and classification (Groq)
 * frontier = sensitive judgement and the must-route-to-human gate (Claude)
 */
export type ModelRole = "fast" | "frontier";

export type ProviderName = "groq" | "anthropic" | "stub";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  role: ModelRole;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /**
   * The prompt holds guest data (a guest's message, name, facts). Refused for real providers
   * until AI_ALLOW_GUEST_DATA=1, which is set only once the provider's data terms are confirmed
   * (pilot plan AI-02). The stub always accepts it.
   */
  guestData?: boolean;
  /**
   * The church and guardrail version this call works for (DB-08). Required for guest data:
   * the provider gets a church-scoped cache key and the system prompt starts with it, so no
   * cached prompt is shared across churches.
   */
  cacheScope?: { churchId: string; guardrailVersion: number | null };
}

export interface CompletionResult {
  text: string;
  feature: AiFeature;
  role: ModelRole;
  provider: ProviderName;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string | null;
  latencyMs: number;
  /** What was sent (system as sent, with its scope line), for the masked prompt log (DB-07). */
  prompt?: { system?: string; messages: ChatMessage[] };
}

export interface ModelClient {
  readonly feature: AiFeature;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** What a provider adapter receives once the client has resolved model and key. */
export interface ProviderCall {
  model: string;
  apiKey: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Per-church prompt-cache key (see cache-scope.ts). */
  cacheKey?: string;
}

export interface ProviderResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

/** A missing or invalid setting. Not retryable; fix the environment. */
export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

/** A failed call to a provider. */
export class ModelProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderName,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}
