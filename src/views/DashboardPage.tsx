import Link from "next/link";
import { ArrowRight, CalendarCheck, MessageSquare, ShieldAlert, Sparkles, UserPlus, Workflow } from "lucide-react";
import { daysAgo } from "@/data/clock";
import { CONVERSATIONS } from "@/data/conversations";
import { PEOPLE, PIPELINE, countByStage, fullName, getPerson } from "@/data/people";
import { APPOINTMENTS } from "@/data/appointments";
import { cn } from "@/lib/cn";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import StatusBadge, { STAGE_BADGE } from "@/components/ui/StatusBadge";

// Recommendations come from the agent's nightly review. Static for the mock.
const RECOMMENDATIONS = [
  {
    id: "r1",
    personId: "p-nguyen",
    title: "Ask a college leader to text Tyler",
    body: "Three automated texts without a reply. Students respond 2× more often to a peer than to the church number.",
    cta: "Assign to a leader",
    href: "/people/p-nguyen",
    impact: "High",
  },
  {
    id: "r2",
    personId: "p-whitfield",
    title: "Invite the Whitfields to Fall Fest",
    body: "Young family, engaged, and Ava loved Grace Kids. Family events lift second visits by 18% in your pilot.",
    cta: "Draft invite",
    href: "/conversations?thread=c-whitfield",
    impact: "Medium",
  },
  {
    id: "r3",
    personId: "p-kowalski",
    title: "Move Beth & Sam to Integrated",
    body: "They start on the hospitality team Sunday. Marking them integrated ends their follow-up sequence.",
    cta: "Review profile",
    href: "/people/p-kowalski",
    impact: "Low",
  },
];

export default function DashboardPage() {
  const stages = countByStage();
  const lastSunday = daysAgo(4, 0);
  const newGuests = PEOPLE.filter((p) => p.firstVisitAt >= lastSunday).length;
  const inConversation = CONVERSATIONS.filter((c) => c.status === "active" || c.status === "taken_over").length;
  const returningSoon = APPOINTMENTS.length + stages.returned;
  const needsAttention = PEOPLE.filter((p) => p.needsAttention).length;
  const maxStage = Math.max(...Object.values(stages), 1);
  const attention = PEOPLE.filter((p) => p.needsAttention);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New Guests" value={newGuests} icon={UserPlus} hint="since last Sunday" delta={{ text: "+3", up: true, good: true }} />
        <StatCard
          label="In Conversation"
          value={inConversation}
          icon={MessageSquare}
          accent="info"
          hint="active threads"
          delta={{ text: "+2", up: true, good: true }}
          delay={60}
        />
        <StatCard label="Returning Soon" value={returningSoon} icon={CalendarCheck} accent="warning" hint="booked or expected Sunday" delay={120} />
        <StatCard
          label="Needs Attention"
          value={needsAttention}
          icon={ShieldAlert}
          accent="danger"
          hint="escalated or quiet"
          delta={{ text: "+1", up: true, good: false }}
          delay={180}
        />
      </div>

      <Card
        title="Visitor pipeline"
        icon={Workflow}
        description="Where every current guest is in their journey"
        action={
          <Link href="/people" className="inline-flex items-center gap-1 text-xs font-medium text-teal-text hover:underline">
            All people <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
        delay={120}
      >
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {PIPELINE.map(({ stage, label, hint }, i) => {
            const count = stages[stage];
            const tone = STAGE_BADGE[stage].tone;
            return (
              <li
                key={stage}
                className="animate-slide-up relative flex flex-col rounded-lg border border-line bg-bg/60 p-3"
                style={{ animationDelay: `${160 + i * 40}ms` }}
              >
                <span className="text-[11px] font-medium text-ink-2">{label}</span>
                <span className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink tabular-nums">{count}</span>
                <span className="mt-2 h-1 overflow-hidden rounded-full bg-line/60">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : tone === "info" ? "bg-info" : "bg-teal",
                    )}
                    style={{ width: `${(count / maxStage) * 100}%` }}
                  />
                </span>
                <span className="mt-2 text-[11px] leading-snug text-ink-3">{hint}</span>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card
          title="AI recommendations"
          icon={Sparkles}
          description="What the assistant would do next, ranked by likely impact"
          delay={180}
          flush
        >
          <ul className="divide-y divide-line">
            {RECOMMENDATIONS.map((r) => {
              const person = getPerson(r.personId)!;
              return (
                <li key={r.id} className="flex gap-3 px-5 py-4">
                  <Avatar name={fullName(person)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink">{r.title}</p>
                      <StatusBadge tone={r.impact === "High" ? "teal" : "neutral"} dot={false}>
                        {r.impact} impact
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{r.body}</p>
                    <Link
                      href={r.href}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-text hover:underline"
                    >
                      {r.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Needs attention" icon={ShieldAlert} delay={240} flush>
          <ul className="divide-y divide-line">
            {attention.map((p) => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-bg">
                  <Avatar name={fullName(p)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{fullName(p)}</span>
                    <span className="block truncate text-xs text-ink-2">{p.facts[0]}</span>
                  </span>
                  <StatusBadge tone={STAGE_BADGE[p.stage].tone}>{STAGE_BADGE[p.stage].label}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
