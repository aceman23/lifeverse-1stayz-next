import type { Metadata } from "next";
import { Church } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { isDemoRequest } from "@/lib/church/server";
import { getDashboard } from "@/lib/dashboard/server";
import ChurchDashboardPage from "@/views/ChurchDashboardPage";
import DashboardPage from "@/views/DashboardPage";

export const metadata: Metadata = { title: "Progress · 1Stayz" };

export default async function Page() {
  // The demo workspace keeps its sample dashboard.
  if (await isDemoRequest()) return <DashboardPage />;

  const result = await getDashboard();
  if (result.kind === "no-church") {
    return (
      <div className="rounded-xl border border-line bg-surface shadow-card">
        <EmptyState icon={Church} title="Finish setting up your church" body="Your dashboard fills in as soon as your church is set up." />
      </div>
    );
  }
  return <ChurchDashboardPage data={result.dashboard} />;
}
