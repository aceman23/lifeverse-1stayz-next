import { apiKeyFor, modelFor, ROLE_PROVIDER, stubForced } from "./config";
import { callAnthropic } from "./providers/anthropic";
import { callGroq } from "./providers/groq";
import { callStub, STUB_MODEL, type StubResponder } from "./providers/stub";
import {
  ModelProviderError,
  type AiFeature,
  type CompletionRequest,
  type CompletionResult,
  type ModelClient,
  type ProviderName,
  type ProviderResult,
} from "./types";

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ModelClientOptions {
  /** Use the stub for this client regardless of AI_STUB, optionally with custom replies. */
  stub?: boolean | StubResponder;
}

/**
 * One client per feature. The feature decides which API keys are used:
 *
 *   const ai = createModelClient("messaging");
 *   const reply = await ai.complete({ role: "fast", system, messages });
 */
export function createModelClient(feature: AiFeature, options: ModelClientOptions = {}): ModelClient {
  const useStub = options.stub !== undefined && options.stub !== false ? true : stubForced();
  const responder = typeof options.stub === "function" ? options.stub : undefined;

  return {
    feature,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const provider: ProviderName = useStub ? "stub" : ROLE_PROVIDER[request.role];
      const model = useStub ? STUB_MODEL[request.role] : modelFor(request.role);
      const started = Date.now();

      let result: ProviderResult;
      try {
        if (provider === "stub") {
          result = callStub(request, feature, responder);
        } else {
          const call = {
            model,
            apiKey: apiKeyFor(feature, request.role),
            system: request.system,
            messages: request.messages,
            maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: request.temperature,
            timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          };
          result = provider === "groq" ? await callGroq(call) : await callAnthropic(call);
        }
      } catch (err) {
        logCall({
          feature,
          role: request.role,
          provider,
          model,
          latencyMs: Date.now() - started,
          ok: false,
          status: err instanceof ModelProviderError ? err.status : null,
          error: err instanceof Error ? err.name : "Error",
        });
        throw err;
      }

      const completion: CompletionResult = {
        text: result.text,
        feature,
        role: request.role,
        provider,
        model,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        stopReason: result.stopReason,
        latencyMs: Date.now() - started,
      };
      logCall({
        feature,
        role: request.role,
        provider,
        model,
        latencyMs: completion.latencyMs,
        ok: true,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      return completion;
    },
  };
}

/**
 * One JSON line per call in the server logs, so usage can be traced to a feature.
 * Metadata only: never prompts or replies, which can hold guest data (C1/C3).
 */
function logCall(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ event: "ai.call", ...entry }));
}
