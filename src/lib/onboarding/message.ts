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

/** How many SMS segments a message takes, and whether it falls back to Unicode (UCS-2). */
export function smsSegments(text: string): { segments: number; unicode: boolean; length: number } {
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
