// Server only: these modules read API keys from the environment.
// Importing them from a client component fails the build.
import "server-only";

export { createModelClient, type ModelClientOptions } from "./client";
export { AI_FEATURES, keyEnvName, modelFor } from "./config";
export type { StubResponder } from "./providers/stub";
export {
  ModelConfigError,
  ModelProviderError,
  type AiFeature,
  type ChatMessage,
  type CompletionRequest,
  type CompletionResult,
  type ModelClient,
  type ModelRole,
} from "./types";
