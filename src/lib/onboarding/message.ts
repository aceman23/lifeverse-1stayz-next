import type { OnboardingState } from "./types";

export const SAMPLE_FIRST_NAME = "Jordan";

/** Replaces message variables with the church's details (and a sample guest name). */
export function fillVariables(text: string, s: OnboardingState): string {
  const kids = s.ministries.find((m) => /kid|child/i.test(m)) ?? "Kids Ministry";
  return text
    .replaceAll("{first_name}", SAMPLE_FIRST_NAME)
    .replaceAll("{church_name}", s.church.name.trim() || "your church")
    .replaceAll("{kids_ministry}", kids);
}

// Characters that fit in a GSM-7 SMS (basic set plus the extension table).
const GSM_7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€";

// Phones and word processors type “smart” quotes, ’ and — . One of them switches a whole SMS to
// Unicode, where each text holds 67 characters instead of 153 (a 430-character message goes from 3
// texts to 7). They look the same as plain ones on the guest's phone, so we swap them before
// counting and before sending.
const SMART: [RegExp, string][] = [
  [/[\u2018\u2019\u201A\u201B\u2032\u02BC]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2013\u2014\u2015\u2212]/g, "-"],
  [/\u2026/g, "..."],
  [/[\u00A0\u2000-\u200A\u202F\u205F]/g, " "],
  [/[\u200B-\u200D\u2060\uFEFF]/g, ""],
  [/\u2022/g, "-"],
];

/** The text as it's sent by SMS: smart punctuation swapped for plain GSM-7 characters. */
export function toSmsText(text: string): string {
  return SMART.reduce((t, [re, plain]) => t.replace(re, plain), text);
}

/** How many SMS segments a message takes once sent (see toSmsText), and whether it's still Unicode (UCS-2). */
export function smsSegments(raw: string): { segments: number; unicode: boolean; length: number } {
  const text = toSmsText(raw);
  const chars = Array.from(text);
  const unicode = chars.some((c) => !GSM_7.includes(c));
  const length = chars.length;
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return { segments, unicode, length };
}

export function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
