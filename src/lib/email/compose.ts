// Writing guest email and reading replies. No server-only imports, so it can be unit tested.

export interface EmailParts {
  churchName: string;
  churchAddress: string;
  body: string;
  unsubscribeUrl: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "Grace Church" <welcome@mail.app.1stayz.com>, with the name made safe for a header. */
export function fromAddress(churchName: string, local: string, domain: string): string {
  const name = churchName.replace(/["\\\r\n<>]/g, "").trim() || "Your church";
  return `"${name}" <${local}@${domain}>`;
}

/** Plain text and HTML versions of a guest email, with the unsubscribe footer. */
export function composeEmail(p: EmailParts): { text: string; html: string } {
  const footer = [
    `You're getting this because you shared your email with ${p.churchName}.`,
    `Unsubscribe: ${p.unsubscribeUrl}`,
  ];
  const signature = [p.churchName, p.churchAddress].filter(Boolean);
  const text = [p.body.trim(), "", ...signature, "", ...footer].join("\n");

  const paragraphs = p.body
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px;">${esc(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff;">
<div style="max-width:560px;margin:0 auto;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
${paragraphs}
<p style="margin:20px 0 0;color:#44403c;">${signature.map(esc).join("<br>")}</p>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c;">
${esc(footer[0])} <a href="${esc(p.unsubscribeUrl)}" style="color:#78716c;">Unsubscribe</a></p>
</div></body></html>`;
  return { text, html };
}

/**
 * The new part of a reply: drops the quoted earlier message ("On … wrote:", "> …",
 * "-----Original Message-----", Outlook's "From: …" block) and trailing whitespace.
 */
export function replyText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    if (/^\s*On\b.*\bwrote:\s*$/i.test(line)) break;
    if (/^\s*On\b/i.test(line) && /^\s*.*\bwrote:\s*$/i.test(next) && !/^\s*>/.test(next)) break;
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^\s*_{5,}\s*$/.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && lines.slice(i + 1, i + 5).some((l) => /^\s*(Sent|Date|To|Subject):/i.test(l))) break;
    if (/^\s*>/.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Readable text from an HTML-only email. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
