import type { Metadata } from "next";
import { Church } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { getChurchSettings } from "@/lib/church/server";
import SettingsPage from "@/views/SettingsPage";

export const metadata: Metadata = { title: "Settings · 1Stayz" };

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  // Throws if Supabase can't be read; error.tsx shows a retry.
  const result = await getChurchSettings();

  if (result.kind === "no-church") {
    return (
      <div className="rounded-xl border border-line bg-surface shadow-card">
        <EmptyState
          icon={Church}
          title="No church found for this account"
          body="Sign in with the email you used to set up your church, or ask your church's admin to invite you."
        />
      </div>
    );
  }

  const { section } = await searchParams;
  return <SettingsPage settings={result.settings} initialSection={section} />;
}
