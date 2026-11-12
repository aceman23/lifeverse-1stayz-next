import { describe, expect, it } from "vitest";
import { maskIdentifiers, maskMessage, maskPrompt, MAX_MASKED_PROMPT } from "./mask";

describe("maskIdentifiers (C1)", () => {
  it("masks emails, phone numbers and street addresses", () => {
    const out = maskIdentifiers("Reach me at ada.l@example.com or +1 (970) 555-0123, 412 North Maple St.");
    expect(out).toBe("Reach me at [email] or [phone], [address]");
  });
  it("keeps short numbers and times", () => {
    expect(maskIdentifiers("Service at 9:30, room 12, 3 kids")).toBe("Service at 9:30, room 12, 3 kids");
  });
  it("masks names as whole words, longest first, any case", () => {
    expect(maskIdentifiers("ada and Ada Lovelace came; Adam too", ["Ada", "Ada Lovelace"])).toBe("[name] and [name] came; Adam too");
    expect(maskIdentifiers("José came", ["José"])).toBe("[name] came");
  });
  it("ignores empty or one-letter names", () => {
    expect(maskIdentifiers("a b c", ["", " ", "a"])).toBe("a b c");
  });
});

describe("maskMessage (C3)", () => {
  it("replaces a sensitive message with its topics only", () => {
    const out = maskMessage("Please pray for my dad, he's in the hospital");
    expect(out).toMatch(/^\[sensitive message: .+\]$/);
    expect(out).not.toMatch(/dad|hospital/);
  });
  it("masks identifiers in an ordinary message", () => {
    expect(maskMessage("Hi, it's Ada! What time is church?", ["Ada"])).toBe("Hi, it's [name]! What time is church?");
  });
});

describe("maskPrompt", () => {
  it("renders system and turns, masked", () => {
    const out = maskPrompt(
      { system: "You write to Ada for Grace Church.", messages: [{ role: "user", content: "call me 970-555-0123" }, { role: "assistant", content: "Sure!" }] },
      ["Ada"],
    );
    expect(out).toBe("[system]\nYou write to [name] for Grace Church.\n\n[user]\ncall me [phone]\n\n[assistant]\nSure!");
  });
  it("caps the length", () => {
    const out = maskPrompt({ messages: [{ role: "user", content: "x".repeat(MAX_MASKED_PROMPT + 500) }] });
    expect(out.length).toBeLessThanOrEqual(MAX_MASKED_PROMPT + 20);
    expect(out.endsWith("[truncated]")).toBe(true);
  });
});
