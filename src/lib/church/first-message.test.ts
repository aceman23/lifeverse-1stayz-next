import { describe, expect, it } from "vitest";
import { MESSAGE_TEMPLATES } from "@/lib/onboarding/constants";
import { checkFirstMessage, FAMILIES, FAMILY_ORDER, firstMessageProblem, kidsMinistryName, renderFirstMessage } from "./first-message";

const ctx = { churchName: "Grace Community Church", kidsMinistry: "Grace Kids" };
const failed = (body: string) => checkFirstMessage(body, ctx).filter((c) => !c.ok).map((c) => c.id);

describe("first-message families (AI-07)", () => {
  it("every default body passes every rule", () => {
    for (const f of FAMILY_ORDER) expect(failed(FAMILIES[f].defaultBody), f).toEqual([]);
  });

  it("the onboarding templates pass the blocking rules too", () => {
    for (const t of MESSAGE_TEMPLATES) expect(firstMessageProblem(t.body, ctx), t.id).toBeNull();
  });

  it("renders the variables", () => {
    expect(renderFirstMessage("Hi {first_name} from {church_name} and {kids_ministry}", { churchName: " ", kidsMinistry: "" }, "Sam")).toBe(
      "Hi Sam from your church and Kids Ministry",
    );
  });

  it("requires the name, the STOP line and known variables", () => {
    expect(failed("Hi there! Any questions? Reply STOP to opt out.")).toEqual(["named"]);
    expect(failed("Hi {first_name}! Any questions?")).toEqual(["stop"]);
    expect(failed("Hi {first_name} {pastor}! Any questions? Reply STOP to opt out.")).toEqual(["variables"]);
    expect(firstMessageProblem("Hi {first_name} {pastor}! Any questions? Reply STOP to opt out.", ctx)).toContain("{pastor}");
  });

  it("one question: none is a warning, two is blocking", () => {
    const none = checkFirstMessage("Hi {first_name}! Welcome. Reply STOP to opt out.", ctx).find((c) => c.id === "one_question")!;
    expect(none).toMatchObject({ ok: false, blocking: false });
    expect(firstMessageProblem("Hi {first_name}! Welcome. Reply STOP to opt out.", ctx)).toBeNull();
    expect(firstMessageProblem("Hi {first_name}! Coming back? Need a ride? Reply STOP to opt out.", ctx)).toMatch(/2 questions/);
  });

  it("over two texts is a warning, over four can't be saved; smart punctuation doesn't count against it", () => {
    const three = `Hi {first_name}! ${"We loved having you. ".repeat(14)}Any questions? Reply STOP to opt out.`;
    expect(checkFirstMessage(three, ctx).find((c) => c.id === "segments")).toMatchObject({ ok: false, blocking: false });
    expect(firstMessageProblem(three, ctx)).toBeNull();
    const six = `Hi {first_name}! ${"We loved having you. ".repeat(40)}Any questions? Reply STOP to opt out.`;
    expect(firstMessageProblem(six, ctx)).toMatch(/4 texts at most/);
    // Curly quotes and dashes are sent as plain ones, so they no longer force Unicode.
    const curly = `Hi {first_name}— ${"We’re so glad. ".repeat(6)}Any questions? Reply STOP to opt out.`;
    expect(failed(curly)).not.toContain("segments");
    // An emoji still does.
    expect(failed(`Hi {first_name} 🙂 ${"We're so glad. ".repeat(6)}Any questions? Reply STOP to opt out.`)).toContain("segments");
  });

  it("the CEO's message: 3 texts is fine, but the placeholder and second question block saving", () => {
    const ceo =
      "Hi {first_name}—\nLoved having you with us today. In our services we don’t always get the chance to connect with each first-time guest the way we’d like. That’s why I’m reaching out now.\n\nYou already heard what we shared.\nI’m handing you the microphone here...\n\nWhat’s the top question you have? What would be genuinely useful for you next?\n\n[Church Helper Name]\nDigital Bridge Coordinator\n{church_name}\n\nReply STOP to opt out";
    const ids = checkFirstMessage(ceo, ctx).filter((c) => !c.ok && c.blocking).map((c) => c.id);
    expect(ids).toEqual(["one_question", "placeholder"]);
    expect(firstMessageProblem(ceo.replace("[Church Helper Name]", "Anna").replace(" What would be genuinely useful for you next?", ""), ctx)).toBeNull();
  });

  it("links are a warning only", () => {
    const c = checkFirstMessage("Hi {first_name}! See www.grace.org. Questions? Reply STOP to opt out.", ctx).find((x) => x.id === "no_links")!;
    expect(c).toMatchObject({ ok: false, blocking: false });
  });

  it("finds the kids ministry name", () => {
    expect(kidsMinistryName(["Worship", "Grace Kids", "Youth"])).toBe("Grace Kids");
    expect(kidsMinistryName(["Children's Church"])).toBe("Children's Church");
    expect(kidsMinistryName([])).toBe("Kids Ministry");
  });
});
