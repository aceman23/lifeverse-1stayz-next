import type { Metadata } from "next";
import { Church } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { listPeople } from "@/lib/people/server";
import { parsePeopleQuery } from "@/lib/people/types";
import PeoplePage from "@/views/PeoplePage";

export const metadata: Metadata = { title: "Guests · 1Stayz" };

export default async function Page({ searchParams }: PageProps<"/people">) {
  const query = parsePeopleQuery(await searchParams);
  // Throws if Supabase can't be read; error.tsx shows a retry.
  const result = await listPeople(query);

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

  return <PeoplePage list={result.list} query={query} />;
}
