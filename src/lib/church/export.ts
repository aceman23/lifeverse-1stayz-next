import { toCsv } from "@/lib/csv";

// DB-06: the owner's download (Settings > Data). The database builds the export
// (export_church_data(): every table of the church, no secrets, audited); this turns it into
// the files the owner gets: the whole thing as JSON, or two spreadsheets (people and
// conversations) that open in Excel or Google Sheets.

export interface ChurchExport {
  format: "1stayz.church-export";
  version: number;
  church_id: string;
  exported_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export type ExportFormat = "json" | "people" | "conversations";
export const EXPORT_FORMATS: readonly ExportFormat[] = ["json", "people", "conversations"];

export function isChurchExport(v: unknown): v is ChurchExport {
  const d = v as ChurchExport | null;
  return !!d && d.format === "1stayz.church-export" && typeof d.church_id === "string" && typeof d.tables === "object" && d.tables !== null;
}

const rowsOf = (doc: ChurchExport, table: string) => doc.tables[table] ?? [];
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const byTime = (key: string) => (a: Record<string, unknown>, b: Record<string, unknown>) => str(a[key]).localeCompare(str(b[key]));

/** "Grace Community Church" -> "grace-community-church" (for file names). */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "church"
  );
}

export function exportFileName(doc: ChurchExport, format: ExportFormat): string {
  const name = str(rowsOf(doc, "churches")[0]?.name);
  const date = str(doc.exported_at).slice(0, 10);
  const what = format === "json" ? "all-data" : format;
  return `1stayz-${slugify(name)}-${what}-${date}.${format === "json" ? "json" : "csv"}`;
}

/** One row per person, with their latest consent per channel. */
export function peopleCsv(doc: ChurchExport): string {
  const consent = new Map<string, Record<string, unknown>>();
  for (const c of [...rowsOf(doc, "church_consents")].sort(byTime("event_at"))) consent.set(`${c.person_id}:${c.channel}`, c);
  const header = ["Person ID", "First name", "Last name", "Phone", "Email", "Stage", "Visits", "Text consent", "Email consent", "Do not contact", "Added"];
  const rows = [...rowsOf(doc, "church_people")].sort(byTime("created_at")).map((p) => [
    str(p.id),
    str(p.first_name),
    str(p.last_name),
    str(p.phone),
    str(p.email),
    str(p.stage),
    typeof p.visit_count === "number" ? p.visit_count : str(p.visit_count),
    str(consent.get(`${p.id}:sms`)?.status),
    str(consent.get(`${p.id}:email`)?.status),
    p.do_not_contact === true ? "yes" : "",
    str(p.created_at),
  ]);
  return toCsv([header, ...rows]);
}

/** Every message, in order, with the guest's name. Internal events (escalations, takeovers) included. */
export function conversationsCsv(doc: ChurchExport): string {
  const people = new Map(rowsOf(doc, "church_people").map((p) => [str(p.id), p]));
  const threads = new Map(rowsOf(doc, "church_threads").map((t) => [str(t.id), t]));
  const header = ["Conversation ID", "Guest", "Time", "Direction", "From", "Channel", "Kind", "Status", "Message"];
  const rows = [...rowsOf(doc, "church_messages")]
    .sort((a, b) => str(a.thread_id).localeCompare(str(b.thread_id)) || str(a.event_at).localeCompare(str(b.event_at)))
    .map((m) => {
      const person = people.get(str(threads.get(str(m.thread_id))?.person_id));
      return [
        str(m.thread_id),
        person ? `${str(person.first_name)} ${str(person.last_name)}`.trim() : "",
        str(m.event_at),
        str(m.direction),
        str(m.sender),
        str(m.channel),
        str(m.event_type ?? "message"),
        str(m.status),
        str(m.body),
      ];
    });
  return toCsv([header, ...rows]);
}
