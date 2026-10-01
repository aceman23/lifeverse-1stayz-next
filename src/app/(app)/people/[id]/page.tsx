import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fullName, getPerson } from "@/data/people";
import PersonPage from "@/views/PersonPage";

export async function generateMetadata({ params }: PageProps<"/people/[id]">): Promise<Metadata> {
  const person = getPerson((await params).id);
  return { title: `${person ? fullName(person) : "Guest"} · 1Stayz` };
}

export default async function Page({ params }: PageProps<"/people/[id]">) {
  const person = getPerson((await params).id);
  if (!person) notFound();
  return <PersonPage person={person} />;
}
