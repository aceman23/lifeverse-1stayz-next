import type { Metadata } from "next";
import DashboardPage from "@/views/DashboardPage";

export const metadata: Metadata = { title: "Dashboard · 1Stayz" };

export default function Page() {
  return <DashboardPage />;
}
