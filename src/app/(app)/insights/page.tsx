import type { Metadata } from "next";
import InsightsPage from "@/views/InsightsPage";

export const metadata: Metadata = { title: "Insights · 1Stayz" };

export default function Page() {
  return <InsightsPage />;
}
