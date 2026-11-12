// Server only: these modules read API keys from the environment.
// Importing them from a client component fails the build.
import "server-only";

export { createModelClient, type ModelClientOptions } from "./client";
export { AI_FEATURES, canSendGuestData, guestDataAllowed, keyEnvName, modelFor } from "./config";
export { classify, type ClassifyLabel, type ClassifyRequest, type ClassifyResult } from "./classify";
export {
  applyRules,
  classFromRules,
  combineClass,
  DATA_CLASS_FALLBACK,
  DATA_CLASS_LABELS,
  DATA_CLASS_TASK,
  type DataClassLabel,
  type MessageClass,
  type RuleResult,
} from "./data-class";
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
