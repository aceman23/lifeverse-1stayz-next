import type { Metadata } from "next";
import { listInbox, getThread } from "@/lib/inbox/server";
import ConversationsPage from "@/views/ConversationsPage";

export const metadata: Metadata = { title: "Conversations · 1Stayz" };

export default async function Page({ searchParams }: PageProps<"/conversations">) {
  const params = await searchParams;
  const threadId = typeof params.thread === "string" ? params.thread : null;
  const filter = typeof params.filter === "string" ? params.filter : null;
  const [result, thread] = await Promise.all([listInbox(), threadId ? getThread(threadId) : Promise.resolve(null)]);

  if (result.kind === "no-church") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink-2">
        Finish setting up your church to see conversations here.
      </div>
    );
  }
  return <ConversationsPage inbox={result.inbox} thread={thread} threadId={threadId} initialFilter={filter} />;
}
