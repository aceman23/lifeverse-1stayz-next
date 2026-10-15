import type { ProviderCall, ProviderResult } from "../types";
import { postJson } from "./http";

const URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

interface AnthropicResponse {
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function callAnthropic(call: ProviderCall): Promise<ProviderResult> {
  const data = await postJson<AnthropicResponse>(
    "anthropic",
    URL,
    { "x-api-key": call.apiKey, "anthropic-version": API_VERSION },
    {
      model: call.model,
      max_tokens: call.maxTokens,
      ...(call.system && { system: call.system }),
      messages: call.messages,
      ...(call.temperature !== undefined && { temperature: call.temperature }),
    },
    call.timeoutMs,
  );

  return {
    text: data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join(""),
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    stopReason: data.stop_reason,
  };
}
