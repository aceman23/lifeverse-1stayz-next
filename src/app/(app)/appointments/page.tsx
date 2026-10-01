import type { Metadata } from "next";
import AppointmentsPage from "@/views/AppointmentsPage";

export const metadata: Metadata = { title: "Appointments · 1Stayz" };

export default function Page() {
  return <AppointmentsPage />;
}
