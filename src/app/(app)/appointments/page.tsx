import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import ComingSoonPage from "@/components/ComingSoonPage";
import { isDemoRequest } from "@/lib/church/server";
import AppointmentsPage from "@/views/AppointmentsPage";

export const metadata: Metadata = { title: "Appointments · 1Stayz" };

// The sample page is for the demo workspace only; a real church never sees invented guests.
export default async function Page() {
  if (await isDemoRequest()) return <AppointmentsPage />;
  return (
    <ComingSoonPage
      icon={CalendarDays}
      title="Coffee chats and meeting invites"
      body="Let guests pick a time to meet a pastor or a host, with reminders for both sides. Not part of the pilot; for now, arrange a meeting by replying in the guest's conversation."
      meanwhile={[
        { href: "/conversations", label: "Conversations", detail: "Offer a time in the guest's thread" },
        { href: "/today", label: "Today", detail: "See who asked to talk to someone" },
      ]}
    />
  );
}
