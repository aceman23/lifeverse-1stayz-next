// SMS Terms and Privacy Policy templates, written in the church's name. Carriers require both,
// public and without a login, before they approve a church's text number (10DLC).
//
// VERSIONED: an approval records the version it was shown, and the public pages render that
// version from the approval's snapshot. Never edit a published version's wording; add version 2,
// bump SMS_POLICY_VERSION, and allow it in approve_sms_policy().
//
// These are templates, not legal advice. Churches can have them reviewed before approving.

export const SMS_POLICY_VERSION = 1;

/** The church details a document is written with (stored as the approval snapshot). */
export interface PolicyDetails {
  church_name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
}

export interface PolicySection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface PolicyDoc {
  title: string;
  sections: PolicySection[];
}

export type PolicyKind = "sms-terms" | "privacy";

function contactLines(d: PolicyDetails): string[] {
  return [
    d.church_name,
    d.address,
    d.phone && `Phone: ${d.phone}`,
    d.email && `Email: ${d.email}`,
    d.website && `Website: ${d.website.replace(/^https?:\/\//, "")}`,
  ].filter((line): line is string => Boolean(line));
}

function contactSentence(d: PolicyDetails): string {
  const ways = [d.email && `email ${d.email}`, d.phone && `call ${d.phone}`].filter(Boolean);
  return ways.length ? ways.join(" or ") : "contact the church office";
}

function smsTermsV1(d: PolicyDetails, privacyUrl: string): PolicyDoc {
  const church = d.church_name;
  return {
    title: `${church} Text Messaging Terms`,
    sections: [
      {
        heading: "The program",
        paragraphs: [
          `${church} Guest Follow-up sends text messages to people who visit ${church} and give us their mobile number, for example on a connection card or visitor form, and agree to receive texts.`,
          "We use these messages to welcome you, answer your questions, share information about services and ministries you asked about, and follow up after your visit. Some messages are prepared with help from 1Stayz, a service our team uses to manage guest follow-up. Our staff can read and reply to the conversation.",
        ],
      },
      {
        heading: "How often we text",
        paragraphs: [
          "Message frequency varies. Usually it's up to 4 messages after each visit, plus replies to messages you send us.",
          "Message and data rates may apply.",
        ],
      },
      {
        heading: "Stop or get help",
        paragraphs: [],
        bullets: [
          "Reply STOP to stop receiving texts. We'll send one message confirming you've opted out, then no more texts unless you opt in again by replying START.",
          `Reply HELP for help, or ${contactSentence(d)}.`,
        ],
      },
      {
        heading: "Things to know",
        paragraphs: [],
        bullets: [
          "You don't have to agree to receive texts to attend, give, or take part in anything at the church.",
          "Carriers are not liable for delayed or undelivered messages.",
          "Supported on all major US carriers.",
        ],
      },
      {
        heading: "Your privacy",
        paragraphs: [
          "We do not sell your mobile number. We do not share your mobile number or your consent to receive texts with third parties or affiliates for their marketing or promotional purposes.",
          `Read how we handle your information in our Privacy Policy: ${privacyUrl}`,
        ],
      },
      {
        heading: "Contact us",
        paragraphs: contactLines(d),
      },
    ],
  };
}

function privacyV1(d: PolicyDetails, termsUrl: string): PolicyDoc {
  const church = d.church_name;
  return {
    title: `${church} Privacy Policy`,
    sections: [
      {
        heading: "Who we are",
        paragraphs: [
          `This policy explains how ${church} ("we", "us") handles information about guests and visitors who connect with us, including by text message and email.`,
          `${church} decides how this information is used. We use 1Stayz, a service provided by Lifeverse Holdings Inc., to send and manage follow-up messages on our behalf. 1Stayz handles your information only to provide that service to us, and keeps it separate from other churches' information.`,
        ],
      },
      {
        heading: "What we collect",
        paragraphs: [],
        bullets: [
          "What you tell us when you connect with us, such as on a connection card or visitor form: your name, mobile number, email address, household members, interests, how you heard about us, and any prayer request.",
          "The messages you exchange with us by text or email.",
          "Basic delivery information from our messaging providers, such as whether a message was delivered.",
        ],
      },
      {
        heading: "How we use it",
        paragraphs: [],
        bullets: [
          "To welcome you and follow up after your visit.",
          "To answer your questions and tell you about services, events and ministries you're interested in.",
          "To connect you with a pastor or staff member when you ask for help or prayer.",
          "To keep our follow-up organized and improve how we welcome guests.",
        ],
      },
      {
        heading: "Automated help",
        paragraphs: [
          "Some messages may be prepared with automated assistance, following guidelines approved by our pastors. Questions about faith, pastoral care, or anything sensitive are passed to a person on our team.",
        ],
      },
      {
        heading: "Who we share it with",
        paragraphs: [],
        bullets: [
          "Our pastors, staff and volunteers who need it to follow up with you. Prayer requests and pastoral matters are shared only with those who care for you.",
          "Service providers that help us deliver messages and host our systems, such as 1Stayz and its text messaging and hosting providers. They may use your information only to provide services to us.",
          "When the law requires it, or to protect someone's safety.",
        ],
      },
      {
        heading: "Text messaging",
        paragraphs: [
          "We do not sell your personal information. We do not share your mobile number or your consent to receive texts with third parties or affiliates for their marketing or promotional purposes.",
          `Reply STOP to any text to stop receiving them, or HELP for help. See our Text Messaging Terms: ${termsUrl}`,
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "We keep your information while it helps us stay connected with you, and delete it when it's no longer needed or when you ask us to, unless we must keep it by law.",
        ],
      },
      {
        heading: "Your choices",
        paragraphs: [
          `You can ask to see, correct, or delete the information we hold about you, or to stop hearing from us, at any time. To do so, ${contactSentence(d)}.`,
        ],
      },
      {
        heading: "Children",
        paragraphs: [
          "Our follow-up messages are meant for adults. We don't knowingly collect information from children under 13 except as provided by a parent or guardian, such as a child's name and age on a family's connection card.",
        ],
      },
      {
        heading: "Keeping it safe",
        paragraphs: [
          "We and our service providers use reasonable safeguards, such as access controls and encryption, to protect your information.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: ["If we change this policy, we'll update this page and the effective date below."],
      },
      {
        heading: "Contact us",
        paragraphs: contactLines(d),
      },
    ],
  };
}

const VERSIONS: Record<number, { "sms-terms": typeof smsTermsV1; privacy: typeof privacyV1 }> = {
  1: { "sms-terms": smsTermsV1, privacy: privacyV1 },
};

export interface PolicyUrls {
  terms: string;
  privacy: string;
}

/** The document of `kind`, as written in `version`. Null for an unknown version. */
export function renderPolicy(kind: PolicyKind, version: number, d: PolicyDetails, urls: PolicyUrls): PolicyDoc | null {
  const v = VERSIONS[version];
  if (!v) return null;
  return kind === "sms-terms" ? v["sms-terms"](d, urls.privacy) : v.privacy(d, urls.terms);
}

/** "October 28, 2026" */
export function effectiveDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Plain text, for a church to paste onto its own website. */
export function policyToText(doc: PolicyDoc, effective?: string): string {
  const parts = [doc.title, ...(effective ? [`Effective ${effective}`] : [])];
  for (const s of doc.sections) {
    parts.push("", s.heading, ...s.paragraphs, ...(s.bullets ?? []).map((b) => `• ${b}`));
  }
  return parts.join("\n");
}

/** Where 1Stayz publishes a church's documents, e.g. https://1stayz.com/redemption-hills/sms-terms. */
export function policyUrls(slug: string): PolicyUrls {
  const base = (process.env.NEXT_PUBLIC_POLICY_BASE_URL || "https://1stayz.com").replace(/\/$/, "");
  return { terms: `${base}/${slug}/sms-terms`, privacy: `${base}/${slug}/privacy` };
}

/** Same rule as public.sms_policy_slug_base(); the database adds -2, -3… if it's taken. */
export function slugFromName(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/^-+|-+$/g, "");
  return s || "church";
}
