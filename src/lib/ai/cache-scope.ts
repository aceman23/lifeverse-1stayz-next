import { createHash } from "node:crypto";

// Per-church prompt-cache keying (guidelines §4.4, tracker DB-08). No prompt or cache is ever
// shared across churches: every model call that carries guest data names its church and the
// guardrail version it follows. The client turns that into
//   - an opaque key sent to the provider (Anthropic metadata.user_id, Groq `user`), and
//   - a first system-prompt line, so any provider-side prefix cache is per church and version.
// If explicit prompt caching (cache_control) is ever turned on, the breakpoint must come after
// that line.

export interface CacheScope {
  churchId: string;
  guardrailVersion: number | null;
}

/** Opaque, stable per church + guardrail version; reveals neither. */
export function promptCacheKey(scope: CacheScope): string {
  const h = createHash("sha256").update(`1stayz:${scope.churchId}:${scope.guardrailVersion ?? "none"}`).digest("hex");
  return `c_${h.slice(0, 32)}`;
}

/** The system prompt with its scope line first. */
export function scopedSystem(system: string | undefined, key: string): string {
  return `[scope ${key}]${system ? `\n${system}` : ""}`;
}
