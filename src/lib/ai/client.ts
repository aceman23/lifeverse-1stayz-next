import { promptCacheKey, scopedSystem } from "./cache-scope";
import { apiKeyFor, guestDataAllowed, modelFor, ROLE_PROVIDER, stubForced } from "./config";
import { callAnthropic } from "./providers/anthropic";
import { callGroq } from "./providers/groq";
import { callStub, STUB_MODEL, type StubResponder } from "./providers/stub";
import {
  ModelConfigError,
  ModelProviderError,
  type AiFeature,
  type CompletionRequest,
  type CompletionResult,
  type ModelClient,
  type ProviderName,
  type ProviderResult,
} from "./types";
import { log } from "@/lib/log";

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ModelClientOptions {
  /** Cancellation for this client, supplied by the job/application boundary. */
  signal?: AbortSignal;
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
      options.signal?.throwIfAborted();
      const provider: ProviderName = useStub ? "stub" : ROLE_PROVIDER[request.role];
      const model = useStub ? STUB_MODEL[request.role] : modelFor(request.role);
      const started = Date.now();

      // Guest data never reaches a real provider before its terms are confirmed (AI-02).
      if (request.guestData && provider !== "stub" && !guestDataAllowed()) {
        logCall({ feature, role: request.role, provider, model, latencyMs: 0, ok: false, error: "GuestDataNotAllowed" });
        throw new ModelConfigError(
          "Guest data can't be sent to a model provider yet: set AI_ALLOW_GUEST_DATA=1 only once the provider's data terms are confirmed (AI-02).",
        );
      }

      // DB-08: guest data only with a church scope, so nothing cached is shared across churches.
      if (request.guestData && provider !== "stub" && !request.cacheScope) {
        logCall({ feature, role: request.role, provider, model, latencyMs: 0, ok: false, error: "MissingCacheScope" });
        throw new ModelConfigError("A model call with guest data must name its church (cacheScope).");
      }
      const cacheKey = request.cacheScope ? promptCacheKey(request.cacheScope) : undefined;
      const system = cacheKey ? scopedSystem(request.system, cacheKey) : request.system;

      let result: ProviderResult;
      try {
        if (provider === "stub") {
          result = callStub({ ...request, system }, feature, responder);
        } else {
          const call = {
            model,
            apiKey: apiKeyFor(feature, request.role),
            system,
            messages: request.messages,
            maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: request.temperature,
            timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            signal: options.signal,
            cacheKey,
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
        prompt: { system, messages: request.messages },
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
  log("ai.call", { ...entry });
}
