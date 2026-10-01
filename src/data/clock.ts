// Mock data is anchored to a fixed "now" so relative times ("2h ago") render the same on
// the server and the client. Replace with `new Date()` once rows come from Supabase.
export const NOW = new Date("2026-10-01T09:30:00-05:00");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function hoursAgo(h: number) {
  return new Date(NOW.getTime() - h * HOUR).toISOString();
}

export function daysAgo(d: number, hour?: number) {
  const date = new Date(NOW.getTime() - d * DAY);
  if (hour !== undefined) date.setUTCHours(hour + 5, 0, 0, 0); // hour in church time (UTC-5)
  return date.toISOString();
}

export function daysFromNow(d: number, hour: number, minute = 0) {
  const date = new Date(NOW.getTime() + d * DAY);
  date.setUTCHours(hour + 5, minute, 0, 0);
  return date.toISOString();
}
