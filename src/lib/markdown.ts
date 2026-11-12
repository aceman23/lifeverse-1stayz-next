// Models answer in Markdown by habit (**bold**, "- " bullets, # headings). Guest texts and emails
// are plain text, so stripMarkdown removes it; the in-app chat renders a small safe subset
// (parseChatMarkdown) instead of showing the raw asterisks.

const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+/;

/** Inline Markdown to plain text: bold, italics, code, links ("text (url)"). */
function stripInline(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/g, "$1$2")
    .replace(/(^|[^\w_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w_])/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*/g, "");
}

/** Markdown to plain text for SMS and email. Bullets become "• ", headings plain lines. */
export function stripMarkdown(text: string): string {
  return text
    .split("\n")
    .map((raw) => {
      if (/^\s*(?:[-*_]\s*){3,}$/.test(raw)) return "";
      const line = raw.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*>\s?/, "");
      const bullet = BULLET.exec(line);
      if (bullet) {
        const marker = /\d/.test(bullet[0]) ? bullet[0].trim() + " " : "• ";
        return marker + stripInline(line.slice(bullet[0].length));
      }
      return stripInline(line);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ChatSpan = { text: string; bold: boolean };
export type ChatBlock = { kind: "p" | "bullet" | "numbered"; marker?: string; spans: ChatSpan[] } | { kind: "gap" };

/** Bold (**x** or __x__) runs within a line; everything else is plain text. */
function spans(line: string): ChatSpan[] {
  const out: ChatSpan[] = [];
  const re = /(\*\*|__)(?=\S)([\s\S]*?\S)\1/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: stripInline(line.slice(last, m.index)), bold: false });
    out.push({ text: stripInline(m[2]), bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: stripInline(line.slice(last)), bold: false });
  return out.filter((s) => s.text);
}

/** A chat reply as blocks to render: paragraphs, bullets, numbered items and blank-line gaps. */
export function parseChatMarkdown(text: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const raw of text.trim().split("\n")) {
    if (!raw.trim() || /^\s*(?:[-*_]\s*){3,}$/.test(raw)) {
      if (blocks.length && blocks.at(-1)!.kind !== "gap") blocks.push({ kind: "gap" });
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(raw);
    if (heading) {
      blocks.push({ kind: "p", spans: [{ text: stripInline(heading[1]), bold: true }] });
      continue;
    }
    const bullet = BULLET.exec(raw);
    if (bullet) {
      const numbered = /\d/.test(bullet[0]);
      blocks.push({ kind: numbered ? "numbered" : "bullet", marker: numbered ? bullet[0].trim() : undefined, spans: spans(raw.slice(bullet[0].length)) });
      continue;
    }
    blocks.push({ kind: "p", spans: spans(raw.replace(/^\s*>\s?/, "")) });
  }
  while (blocks.at(-1)?.kind === "gap") blocks.pop();
  return blocks;
}
