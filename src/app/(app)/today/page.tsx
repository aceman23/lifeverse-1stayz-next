import type { Metadata } from "next";
import TodayPage from "@/views/TodayPage";

export const metadata: Metadata = { title: "Today · 1Stayz" };

export default function Page() {
  return <TodayPage />;
}
