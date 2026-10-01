import type { Metadata } from "next";
import PeoplePage from "@/views/PeoplePage";

export const metadata: Metadata = { title: "People · 1Stayz" };

export default function Page() {
  return <PeoplePage />;
}
