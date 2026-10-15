import type { EmailProvider, MessageTemplate, SubsplashMethod } from "./types";

export const STORAGE_KEY = "1stayz_onboarding";
export const LAST_STEP = 7;

export const STEP_LABELS = [
  "Your Church",
  "Reading Your Site",
  "What You Need",
  "Connect Systems",
  "Guardrails",
  "Team & Escalations",
  "First Message",
  "Ready Check",
] as const;

export const COACH_CONTENT: Record<number, string> = {
  0: "Tell us about your church so 1Stayz can personalize every conversation. We use your website to pre-fill service times, ministries, and beliefs — you'll review everything before it goes live.",
  1: "We read your website to save you time. Everything we found is a draft — you review and approve each card. The service schedule matters most: your first text goes out within 30 minutes after the service a guest attended ends.",
  2: "Choose what you want 1Stayz to handle during the pilot. We'll focus on the essentials first — following up with every guest and alerting you when someone needs a pastor.",
  3: "Subsplash stays your system of record — 1Stayz only runs follow-up. Until your text number is approved by the carrier, we'll reach out by email first.",
  4: "This is the most important step. If your church holds a specific view on baptism and a guest asks about it, your agent needs to know whether to explain it or hand it to a pastor. These guardrails keep the assistant aligned with your church's beliefs.",
  5: "When someone needs a pastor, 1Stayz needs to know who to contact and in what order. Quiet hours protect your guests from late-night messages in their local time zone.",
  6: "Your first message sets the tone for every conversation. Pick a template, make it yours, and send it to your pastor for approval. The preview shows exactly what a guest will see.",
  7: "Almost there! Approval Mode means 1Stayz writes every message but holds it for your approval before sending. Go live when you're ready — we'll check that everything is in place.",
};

export const TIMEZONES = [
  "America/New_York (ET)",
  "America/Chicago (CT)",
  "America/Denver (MT)",
  "America/Los_Angeles (PT)",
  "America/Anchorage (AKT)",
  "Pacific/Honolulu (HST)",
];

export const ROLES = ["Senior Pastor", "Executive Pastor", "Assimilation Director", "Church Admin", "Other"];

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULT_MINISTRIES = [
  "Kids Ministry",
  "Youth Group",
  "Small Groups",
  "Newcomer Lunch",
  "Recovery Ministry",
  "Men's Breakfast",
  "Women's Bible Study",
  "Worship Team",
  "Missions & Outreach",
  "Young Adults",
];

export const GUEST_FIELDS: { id: string; label: string }[] = [
  { id: "first_name", label: "First name" },
  { id: "last_name", label: "Last name" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "household_size", label: "Household size" },
  { id: "kids_ages", label: "Kids' ages" },
  { id: "how_they_heard", label: "How they heard" },
  { id: "prayer_request", label: "Prayer request" },
  { id: "which_service", label: "Which service" },
];

/** What the fake website scan "finds" in step 2. */
export const SCANNED_SERVICES = [
  { name: "Sunday Morning First Service", day: "Sunday", startTime: "09:00", endTime: "10:15" },
  { name: "Sunday Morning Second Service", day: "Sunday", startTime: "11:00", endTime: "12:15" },
];

export const AVAILABLE_NEEDS = [
  { emoji: "💬", label: "Follow up with every first-time guest" },
  { emoji: "📋", label: "Know who needs a call this week" },
  { emoji: "🚨", label: "Get alerted when someone needs a pastor" },
  { emoji: "⛪", label: "Prepare for Sunday" },
];

export const COMING_SOON_NEEDS = [
  { emoji: "🤝", label: "Coordinate volunteers" },
  { emoji: "📅", label: "Schedule coffee & meetings" },
  { emoji: "🎁", label: "Send welcome gifts" },
  { emoji: "🎥", label: "Personal video welcome" },
];

export const SUBSPLASH_OPTIONS: { value: Exclude<SubsplashMethod, "none">; label: string; desc: string }[] = [
  { value: "webhook", label: "Webhook", desc: "Direct integration" },
  { value: "zapier", label: "Zapier", desc: "Connect through Zapier" },
  { value: "qrcard", label: "1Stayz connection card & QR", desc: "Posts to Subsplash and 1Stayz" },
];

export const EMAIL_OPTIONS: { value: Exclude<EmailProvider, "none">; label: string }[] = [
  { value: "gmail", label: "Gmail" },
  { value: "outlook", label: "Outlook" },
  { value: "1stayz", label: "1Stayz email" },
];

export const MORE_INTEGRATIONS = [
  { label: "Planning Center", desc: "Service planning" },
  { label: "Google Calendar", desc: "Staff scheduling" },
  { label: "Mailchimp", desc: "Email campaigns" },
];

export const ACCEPTED_DOCUMENT_TYPES = [".pdf", ".docx", ".txt", ".md"];

export const DOCTRINAL_TOPICS = [
  "Baptism",
  "Communion",
  "Salvation",
  "Spiritual gifts",
  "End times",
  "Marriage",
  "Women in leadership",
  "Church governance",
  "Membership",
];

export const ESCALATION_TOPICS = [
  "Crisis or self-harm",
  "Medical or grief",
  "Counseling requests",
  "Marriage & family conflict",
  "Money or benevolence",
  "Complaints",
  "Wants to meet a pastor",
  "Theology questions not covered above",
  "Anyone under 18",
];

export const LOCKED_RULES = [
  "One question per message",
  "Short texts (max 2 SMS)",
  "Always says it's an assistant",
  "Honors STOP instantly",
];

export const TONE_OPTIONS = ["Warm", "Casual", "Formal", "Joyful", "Pastoral"];

export const MESSAGE_VARIABLES = ["{first_name}", "{church_name}", "{kids_ministry}"];

export const STOP_PHRASE = "Reply STOP to opt out";

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: "warm",
    name: "Warm welcome",
    body: "Hi {first_name}! Thanks so much for joining us at {church_name} this morning. I'm the team's digital assistant. What would you like to know about the church or our {kids_ministry}? You can keep texting me here anytime. Reply STOP to opt out.",
  },
  {
    id: "short",
    name: "Short & simple",
    body: "Hi {first_name}! So glad you visited {church_name} today. I'm here if you have any questions — just reply to this text. Reply STOP to opt out.",
  },
  {
    id: "family",
    name: "Family-focused",
    body: "Hi {first_name}! It was great having your family at {church_name} this morning. I'd love to help you find your way around — anything you'd like to know about kids' programs or small groups? Just text me back. Reply STOP to opt out.",
  },
];

export const CONSENT_WORDING =
  "By sharing your mobile number, you agree to receive text messages from {church_name}, sent by 1Stayz on the church's behalf, about your visit and next steps. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
