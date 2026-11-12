import { afterEach, describe, expect, it, vi } from "vitest";
import { agentOff, dailyTokenBudget, DEFAULT_DAILY_TOKEN_BUDGET, overBudget } from "@/lib/ai/budget";
import { scrub, scrubString } from "@/lib/log";
import { notificationText, type NotificationRow } from "@/lib/messaging/notify-text";

describe("log scrubbing", () => {
  it("masks phone numbers and email addresses inside any string", () => {
    expect(scrubString('duplicate key (phone)=(+12175550142) for jo@example.com')).toBe("duplicate key (phone)=([phone]) for [email]");
    expect(scrubString("call (217) 555-0142 now")).toBe("call [phone] now");
  });
  it("leaves ids, SIDs and short numbers alone", () => {
    const id = "50000000-0000-0000-0000-00000000000a";
    expect(scrubString(id)).toBe(id);
    expect(scrubString("IM25920c0afcdf07d1d9da045d5211ef48")).toBe("IM25920c0afcdf07d1d9da045d5211ef48");
    expect(scrubString("twilio_30007 after 3 attempts in 120 ms")).toBe("twilio_30007 after 3 attempts in 120 ms");
  });
  it("redacts fields that can hold guest data, at any depth", () => {
    expect(scrub({ thread_id: "t1", body: "Please pray for my mom", nested: { to: "+12175550142", first_name: "Hannah" }, count: 3 })).toEqual({
      thread_id: "t1",
      body: "[redacted]",
      nested: { to: "[redacted]", first_name: "[redacted]" },
      count: 3,
    });
  });
  it("caps long strings", () => {
    expect((scrubString("x".repeat(1000)) as string).length).toBeLessThan(310);
  });
});

const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: "n1",
  church_id: "c1",
  church_name: "Grace Community",
  thread_id: "t1",
  kind: "escalation",
  audience: "staff",
  channel: "email",
  to_address: "ray@grace.test",
  recipient_name: "Ray Mitchell",
  payload: { first_name: "Hannah", reason: "care", flagged_by: "assistant" },
  attempts: 1,
  ...over,
});

describe("notification text", () => {
  const app = "https://app.1stayz.com";
  it("staff email: first name, category, link, who flagged it", () => {
    const t = notificationText(row(), app);
    expect(t.subject).toBe("Hannah needs a pastor (care or prayer)");
    expect(t.text).toContain("Hi Ray,");
    expect(t.text).toContain("https://app.1stayz.com/conversations?thread=t1");
    expect(t.text).toContain("The assistant flagged it");
  });
  it("staff text: short, with the link", () => {
    const t = notificationText(row({ channel: "sms" }), app);
    expect(t.text).toBe("1Stayz: Hannah needs a pastor (care or prayer). Please reply within 15 min: https://app.1stayz.com/conversations?thread=t1");
    expect(t.text.length).toBeLessThanOrEqual(160);
  });
  it("reminder says it's still waiting", () => {
    expect(notificationText(row({ kind: "escalation_reminder" }), app).subject).toBe("Still waiting: Hannah needs a pastor");
  });
  it("on-call (1Stayz) messages never name the guest", () => {
    const reminder = notificationText(row({ audience: "ops", kind: "escalation_reminder", to_address: null }), app);
    const alert = notificationText(row({ audience: "ops", kind: "alert", payload: { alert_kind: "send_failed", reason: "twilio_30007" } }), app);
    for (const t of [reminder, alert]) {
      expect(`${t.subject} ${t.text}`).not.toContain("Hannah");
      expect(t.text).toContain("Grace Community");
    }
    expect(alert.subject).toBe("[1Stayz] Grace Community: A message couldn't be delivered");
    expect(alert.text).toContain("Code: twilio_30007");
  });
});

describe("AI budget and kill switch", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("budget from env, with a default", () => {
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "");
    expect(dailyTokenBudget()).toBe(DEFAULT_DAILY_TOKEN_BUDGET);
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "50000");
    expect(dailyTokenBudget()).toBe(50000);
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "lots");
    expect(dailyTokenBudget()).toBe(DEFAULT_DAILY_TOKEN_BUDGET);
  });
  it("kill switch", () => {
    vi.stubEnv("AI_AGENT_OFF", "1");
    expect(agentOff()).toBe(true);
    vi.stubEnv("AI_AGENT_OFF", "");
    expect(agentOff()).toBe(false);
  });
  it("over budget raises the alert once per run and is cached", async () => {
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "1000");
    const calls: string[] = [];
    const admin = {
      rpc: async (fn: string) => {
        calls.push(fn);
        return { data: fn === "church_ai_tokens_today" ? 1200 : null, error: null };
      },
    } as unknown as Parameters<typeof overBudget>[0];
    const cache = new Map<string, boolean>();
    expect(await overBudget(admin, "c1", cache)).toBe(true);
    expect(await overBudget(admin, "c1", cache)).toBe(true);
    expect(calls).toEqual(["church_ai_tokens_today", "raise_church_alert"]);
  });
});
