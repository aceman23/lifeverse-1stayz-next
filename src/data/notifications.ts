import { daysAgo, hoursAgo } from "./clock";
import type { Notification } from "./types";

export const NOTIFICATIONS: Notification[] = [
  { id: "n1", kind: "escalation", title: "Hannah Brooks needs care", body: "Escalated to Mark Ochoa · Grief & loss", at: hoursAgo(1), read: false, href: "/people/p-brooks" },
  { id: "n2", kind: "reply", title: "Marcus Whitfield replied", body: "“Is there a moms' group that meets during the week?”", at: hoursAgo(2), read: false, href: "/conversations?thread=c-whitfield" },
  { id: "n3", kind: "booking", title: "Coffee confirmed", body: "The Okafors · Sat 9:00 AM with Pastor Ray", at: daysAgo(1, 13), read: true, href: "/appointments" },
  { id: "n4", kind: "system", title: "Document failed to index", body: "Benevolence process (scanned).pdf", at: daysAgo(2, 14), read: true, href: "/ai-training" },
];
