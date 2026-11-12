import type { WorkspaceMode } from "./types";

export const CHURCH = {
  name: "Grace Community Church",
  phone: "(217) 555-0100",
  website: "gracecommunity.org",
  address: "1420 S Grand Ave W, Springfield, IL 62704",
  timezone: "America/Chicago",
  denomination: "Non-denominational",
  averageAttendance: 420,
};

export const SERVICES = [
  { id: "sv1", day: "Sunday", time: "9:00 AM", name: "Traditional", kids: true },
  { id: "sv2", day: "Sunday", time: "10:30 AM", name: "Contemporary", kids: true },
  { id: "sv3", day: "Wednesday", time: "6:30 PM", name: "Student Night", kids: false },
];

export const FIRST_MESSAGE =
  "Hi {first_name}, it's Grace Community! Thanks for joining us {service_day}. We're really glad you came. If you have any questions, just text back. A real person is always nearby.";

export const INTEGRATIONS = [
  { id: "subsplash", name: "Subsplash", description: "Sync connect cards and app sign-ups", connected: true, lastSync: "12 min ago" },
  { id: "planning-center", name: "Planning Center", description: "Import people, groups and check-ins", connected: false, lastSync: null },
  { id: "twilio", name: "Twilio SMS", description: "Send texts from your church number", connected: true, lastSync: "Live" },
  { id: "google-calendar", name: "Google Calendar", description: "Offer staff availability for coffee chats", connected: false, lastSync: null },
];

export const INITIAL_MODE: WorkspaceMode = "shadow";

export const MODE_COPY: Record<WorkspaceMode, { label: string; description: string }> = {
  setup: { label: "Setup", description: "Nothing is sent. Finish training and guardrails first." },
  shadow: { label: "Shadow", description: "The assistant drafts every message and staff approve before anything is sent." },
  live: { label: "Live", description: "Routine messages send automatically. Escalations still go to a person." },
};
