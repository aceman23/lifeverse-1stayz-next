import type { Metadata } from "next";
import BetaForm from "./BetaForm";

export const metadata: Metadata = { title: "Join the pilot · 1Stayz" };

export default function BetaPage() {
  return <BetaForm />;
}
