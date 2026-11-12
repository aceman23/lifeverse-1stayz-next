import { describe, expect, it } from "vitest";
import { smsSegments, toSmsText } from "./message";

describe("toSmsText / smsSegments", () => {
  it("swaps smart punctuation for plain characters", () => {
    expect(toSmsText("We’re “glad” — see you… soon")).toBe(`We're "glad" - see you... soon`);
  });
  it("a 428-character message with curly quotes is 3 texts, not 7", () => {
    const text = `${"We’re so glad you came — ".repeat(17)}ok`.slice(0, 428);
    expect(smsSegments(text)).toMatchObject({ unicode: false, segments: 3 });
  });
  it("emoji still make it Unicode", () => {
    expect(smsSegments("Hi 🙂").unicode).toBe(true);
  });
});
