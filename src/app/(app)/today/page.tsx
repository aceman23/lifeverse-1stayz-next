import type { Metadata } from "next";
import { getToday } from "@/lib/inbox/server";
import TodayPage from "@/views/TodayPage";

export const metadata: Metadata = { title: "Today · 1Stayz" };

export default async function Page() {
  const result = await getToday();
  if (result.kind === "no-church") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink-2">
        Finish setting up your church to see your Today list.
      </div>
    );
  }
  return <TodayPage data={result.today} />;
}
