import type { AiFeature, CompletionRequest, ModelRole, ProviderResult } from "../types";

/** Custom stub behaviour for tests and evals, e.g. return a fixed escalation verdict. */
export type StubResponder = (request: CompletionRequest, feature: AiFeature) => string;

/** Default stub: a predictable reply that says which feature and role answered. */
export function defaultStub(request: CompletionRequest, feature: AiFeature): string {
  const last = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const preview = last.length > 60 ? `${last.slice(0, 60)}…` : last;
  return `[stub ${feature}/${request.role}] ${preview}`;
}

export function callStub(
  request: CompletionRequest,
  feature: AiFeature,
  responder: StubResponder = defaultStub,
): ProviderResult {
  const text = responder(request, feature);
  return {
    text,
    inputTokens: estimateTokens(request.system ?? "") + request.messages.reduce((n, m) => n + estimateTokens(m.content), 0),
    outputTokens: estimateTokens(text),
    stopReason: "stub",
  };
}

export const STUB_MODEL: Record<ModelRole, string> = { fast: "stub-fast", frontier: "stub-frontier" };

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}
