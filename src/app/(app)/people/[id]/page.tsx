import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPersonConversation } from "@/lib/inbox/server";
import { getPerson } from "@/lib/people/server";
import PersonPage from "@/views/PersonPage";

// Guest names stay out of the tab title: it ends up in browser history and screen shares.
export const metadata: Metadata = { title: "Guest · 1Stayz" };

export default async function Page({ params }: PageProps<"/people/[id]">) {
  const result = await getPerson((await params).id);
  if (result.kind === "not-found") notFound();
  const conversation = await getPersonConversation(result.person.id, result.person.demo);
  return <PersonPage key={result.person.id} person={result.person} conversation={conversation} />;
}
