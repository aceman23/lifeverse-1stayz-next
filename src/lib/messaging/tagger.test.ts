import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createModelClient } from "@/lib/ai/client";

// The tagger with a fake database: which rows get which class, what's audited, what's retried.

type Call = { fn: string; args: Record<string, unknown> };
const calls: Call[] = [];
let untagged: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "claim_untagged_messages") return { data: untagged, error: null };
      if (fn === "current_guardrail_version") return { data: [{ version: 3, config: {} }], error: null };
      if (fn === "tag_message_data_class") return { data: true, error: null };
      return { data: null, error: null };
    },
  }),
}));

const { runTagger } = await import("./tagger");

const row = (id: string, body: string, names: string[] = ["Hannah", "Brooks"]) => ({
  message_id: id,
  church_id: "church-a",
  thread_id: "thread-1",
  body,
  direction: "inbound",
  sender: "guest",
  names,
});
const tags = () => calls.filter((c) => c.fn === "tag_message_data_class").map((c) => [c.args.p_message, c.args.p_class, c.args.p_source]);

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("runTagger", () => {
  it("settles sensitive messages by rules, the rest by the model, stricter class wins", async () => {
    vi.stubEnv("AI_STUB", "1");
    untagged = [
      row("m1", "Please pray for my mom"),
      row("m2", "What time is the 11am service?"),
      row("m3", "This is Hannah, is there parking?"),
      row("m4", "Text me at 217-555-0142 about groups"),
    ];
    // The stub model: says "ordinary" for everything (m3/m4 become C1 from the rules anyway).
    const client = createModelClient("messaging", { stub: () => '{"labels":["ordinary"],"confidence":0.9}' });
    const summary = await runTagger({ client });

    expect(tags()).toEqual([
      ["m1", "C3", "rules"],
      ["m2", "C2", "model"],
      ["m3", "C1", "model"],
      ["m4", "C1", "model"],
    ]);
    expect(summary).toMatchObject({ tagged: 4, byRules: 1, byModel: 3, undecided: 0 });

    // One model call per model-tagged message, audited with the guardrail version; no call for m1.
    const logs = calls.filter((c) => c.fn === "log_model_call");
    expect(logs.map((c) => c.args.p_message)).toEqual(["m2", "m3", "m4"]);
    expect(logs[0]!.args).toMatchObject({ p_purpose: "data_class", p_guardrail_version: 3, p_model: "stub-fast" });
    // Guardrail version looked up once per church per run.
    expect(calls.filter((c) => c.fn === "current_guardrail_version")).toHaveLength(1);
    // Audit details carry labels, never the text.
    const detail = JSON.stringify(calls.filter((c) => c.fn === "tag_message_data_class").map((c) => c.args.p_detail));
    expect(detail).not.toContain("parking");
  });

  it("an unclear model answer leaves the message C3 and counts the attempt", async () => {
    vi.stubEnv("AI_STUB", "1");
    untagged = [row("m5", "hello there")];
    const client = createModelClient("messaging", { stub: () => "not sure" });
    const summary = await runTagger({ client });
    expect(tags()).toEqual([]);
    expect(calls.some((c) => c.fn === "note_tag_attempt" && c.args.p_message === "m5")).toBe(true);
    expect(summary).toMatchObject({ tagged: 0, undecided: 1 });
  });

  it("without AI-02 clearance, guest text never reaches a model; rules still tag C3", async () => {
    vi.stubEnv("AI_STUB", "");
    vi.stubEnv("AI_ALLOW_GUEST_DATA", "");
    untagged = [row("m6", "My dad died on Tuesday"), row("m7", "Where do I park?")];
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const summary = await runTagger();
    expect(tags()).toEqual([["m6", "C3", "rules"]]);
    expect(calls.some((c) => c.fn === "log_model_call")).toBe(false);
    expect(calls.some((c) => c.fn === "note_tag_attempt" && c.args.p_message === "m7")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ byRules: 1, byModel: 0, undecided: 1 });
  });
});
