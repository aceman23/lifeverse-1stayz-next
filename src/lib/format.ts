import { NOW } from "@/data/clock";

// Fixed locale and zone so server and client render identical strings.
const ZONE = "America/Chicago";

const time = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric" });
const longDay = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long", month: "long", day: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric" });
const weekdayDate = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long", month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDay = (iso: string) => day.format(new Date(iso));
export const formatLongDay = (iso: string) => longDay.format(new Date(iso));
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));
/** "Thursday, Oct 1" */
export const formatWeekdayDate = (iso: string) => weekdayDate.format(new Date(iso));
/** 24-hour "14:32", for compact activity logs. */
export const formatClock = (iso: string) => clock.format(new Date(iso));
export const formatDayTime =(iso: string) => `${formatDay(iso)} · ${formatTime(iso)}`;

export function formatRelative(iso: string) {
  const diff = NOW.getTime() - new Date(iso).getTime();
  const future = diff < 0;
  const mins = Math.round(Math.abs(diff) / 60000);
  const wrap = (s: string) => (future ? `in ${s}` : `${s} ago`);
  if (mins < 1) return "just now";
  if (mins < 60) return wrap(`${mins}m`);
  const hours = Math.round(mins / 60);
  if (hours < 24) return wrap(`${hours}h`);
  const days = Math.round(hours / 24);
  if (days === 1) return future ? "tomorrow" : "yesterday";
  if (days < 7) return wrap(`${days}d`);
  return formatShortDate(iso);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

// <input type="date"> / <input type="time"> values in church time, and back to ISO.
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function toDateInput(iso: string) {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function fromDateInput(date: string, time: string) {
  // Treat the wall time as UTC, then shift by the zone's offset at that moment.
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = toDateInput(guess.toISOString());
  const shownAsUtc = new Date(`${shown.date}T${shown.time}:00Z`);
  return new Date(guess.getTime() + (guess.getTime() - shownAsUtc.getTime())).toISOString();
}

/** Calendar-day key in church time, for grouping. */
export const dayKey = (iso: string) => toDateInput(iso).date;
