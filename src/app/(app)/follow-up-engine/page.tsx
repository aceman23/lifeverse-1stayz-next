import type { Metadata } from "next";
import { Zap } from "lucide-react";
import ComingSoonPage from "@/components/ComingSoonPage";
import { isDemoRequest } from "@/lib/church/server";
import FollowUpEnginePage from "@/views/FollowUpEnginePage";

export const metadata: Metadata = { title: "Sequences · 1Stayz" };

// The sample page is for the demo workspace only; a real church never sees invented guests.
export default async function Page() {
  if (await isDemoRequest()) return <FollowUpEnginePage />;
  return (
    <ComingSoonPage
      icon={Zap}
      title="Automated follow-up sequences"
      body="Multi-step follow-ups over the weeks after a visit (a second text, an invitation, a check-in) that your team designs once and 1Stayz runs. Not part of the pilot; for now 1Stayz sends the first contact and your team follows up from Today."
      meanwhile={[
        { href: "/today", label: "Today", detail: "Guests who replied, need a follow-up or are at risk" },
        { href: "/conversations", label: "Conversations", detail: "Reply to any guest on their thread" },
      ]}
    />
  );
}
