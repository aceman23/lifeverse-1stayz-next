import type { Metadata } from "next";
import { Church } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { isDemoRequest } from "@/lib/church/server";
import { getInsights, INSIGHTS_WEEKS, type InsightsWeeks } from "@/lib/insights/server";
import ChurchInsightsPage from "@/views/ChurchInsightsPage";
import InsightsPage from "@/views/InsightsPage";

export const metadata: Metadata = { title: "Insights · 1Stayz" };

export default async function Page({ searchParams }: PageProps<"/insights">) {
  // The demo workspace keeps its sample insights.
  if (await isDemoRequest()) return <InsightsPage />;

  const { weeks } = await searchParams;
  const range = (INSIGHTS_WEEKS as readonly number[]).includes(Number(weeks)) ? (Number(weeks) as InsightsWeeks) : 8;
  const result = await getInsights(range);
  if (result.kind === "no-church") {
    return (
      <div className="rounded-xl border border-line bg-surface shadow-card">
        <EmptyState icon={Church} title="Finish setting up your church" body="Insights fill in after your first Sunday with 1Stayz." />
      </div>
    );
  }
  return <ChurchInsightsPage data={result.insights} />;
}
