import { describe, expect, it } from "vitest";
import { parseChatMarkdown, stripMarkdown } from "./markdown";

const SAMPLE = `**Approval Mode**

- **What it does:** Every text is held until a staff member clicks **Approve**.
- **Why use it:**
• Guarantees the tone matches your church's voice.
* Lets you catch *sensitive* replies.`;

describe("stripMarkdown", () => {
  it("removes bold, italics and bullet markers", () => {
    const out = stripMarkdown(SAMPLE);
    expect(out).not.toMatch(/\*/);
    expect(out).toContain("Approval Mode\n\n• What it does: Every text is held until a staff member clicks Approve.");
    expect(out).toContain("• Lets you catch sensitive replies.");
  });
  it("leaves ordinary text alone", () => {
    const text = "See you Sunday at 9:00 and 11:00! Kids 3-11 welcome. 2*3 = 6, snake_case_name";
    expect(stripMarkdown(text)).toBe(text);
  });
  it("flattens headings, links and code", () => {
    expect(stripMarkdown("## Parking\nUse the [map](https://example.org/map) or `Lot B`")).toBe("Parking\nUse the map (https://example.org/map) or Lot B");
  });
  it("keeps numbered lists", () => {
    expect(stripMarkdown("1. First\n2) Second")).toBe("1. First\n2) Second");
  });
});

describe("parseChatMarkdown", () => {
  it("turns bold runs and bullets into blocks", () => {
    const blocks = parseChatMarkdown(SAMPLE);
    expect(blocks[0]).toEqual({ kind: "p", spans: [{ text: "Approval Mode", bold: true }] });
    expect(blocks[1]).toEqual({ kind: "gap" });
    expect(blocks[2]).toMatchObject({ kind: "bullet", spans: [{ text: "What it does:", bold: true }, { text: " Every text is held until a staff member clicks ", bold: false }, { text: "Approve", bold: true }, { text: ".", bold: false }] });
    expect(blocks.filter((b) => b.kind === "bullet")).toHaveLength(4);
    expect(JSON.stringify(blocks)).not.toContain("*");
  });
  it("numbered items keep their number", () => {
    expect(parseChatMarkdown("1. Open Settings")[0]).toMatchObject({ kind: "numbered", marker: "1." });
  });
});
