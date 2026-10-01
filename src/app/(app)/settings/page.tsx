import type { Metadata } from "next";
import SettingsPage from "@/views/SettingsPage";

export const metadata: Metadata = { title: "Settings · 1Stayz" };

export default function Page() {
  return <SettingsPage />;
}
