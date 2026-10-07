import type { ProviderCall, ProviderResult } from "../types";
import { postJson } from "./http";

// Groq exposes an OpenAI-compatible API.
const URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqResponse {
  choices: { message: { content: string | null }; finish_reason: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function callGroq(call: ProviderCall): Promise<ProviderResult> {
  const messages = [
    ...(call.system ? [{ role: "system" as const, content: call.system }] : []),
    ...call.messages,
  ];

  const data = await postJson<GroqResponse>(
    "groq",
    URL,
    { authorization: `Bearer ${call.apiKey}` },
    {
      model: call.model,
      messages,
      max_completion_tokens: call.maxTokens,
      ...(call.temperature !== undefined && { temperature: call.temperature }),
    },
    call.timeoutMs,
  );

  const choice = data.choices[0];
  return {
    text: choice?.message.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    stopReason: choice?.finish_reason ?? null,
  };
}
