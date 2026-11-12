import type { Metadata } from "next";
import { Church } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { getAssistant } from "@/lib/assistant/server";
import { isDemoRequest } from "@/lib/church/server";
import AiTrainingPage from "@/views/AiTrainingPage";
import ChurchAssistantPage from "@/views/ChurchAssistantPage";

export const metadata: Metadata = { title: "Train Your AI · 1Stayz" };

export default async function Page() {
  // The demo workspace keeps its sample page.
  if (await isDemoRequest()) return <AiTrainingPage />;

  const result = await getAssistant();
  if (result.kind === "no-church") {
    return (
      <div className="rounded-xl border border-line bg-surface shadow-card">
        <EmptyState icon={Church} title="Finish setting up your church" body="Your assistant's guardrails show here once your pastor approves them." />
      </div>
    );
  }
  return <ChurchAssistantPage data={result.assistant} />;
}
