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
