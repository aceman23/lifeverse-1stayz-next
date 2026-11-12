import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { conversationsCsv, exportFileName, isChurchExport, peopleCsv, slugify, type ChurchExport } from "./export";

const doc: ChurchExport = {
  format: "1stayz.church-export",
  version: 1,
  church_id: "c1",
  exported_at: "2026-11-09T18:00:00Z",
  tables: {
    churches: [{ id: "c1", name: "Grâce Community Church" }],
    church_people: [
      { id: "p2", first_name: "Bo", last_name: "Lee", phone: null, email: "bo@example.com", stage: "new", visit_count: 1, do_not_contact: true, created_at: "2026-11-02" },
      { id: "p1", first_name: "Sam", last_name: "Guest", phone: "+12175550101", email: null, stage: "contacted", visit_count: 2, do_not_contact: false, created_at: "2026-11-01" },
    ],
    church_consents: [
      { person_id: "p1", channel: "sms", status: "granted", event_at: "2026-11-01T10:00:00Z" },
      { person_id: "p1", channel: "sms", status: "revoked", event_at: "2026-11-03T10:00:00Z" },
      { person_id: "p2", channel: "email", status: "granted", event_at: "2026-11-02T10:00:00Z" },
    ],
    church_threads: [{ id: "t1", person_id: "p1" }],
    church_messages: [
      { thread_id: "t1", event_at: "2026-11-01T12:05:00Z", direction: "inbound", sender: "guest", channel: "sms", event_type: "message", status: "received", body: '=HYPERLINK("x"), "hi"' },
      { thread_id: "t1", event_at: "2026-11-01T12:00:00Z", direction: "outbound", sender: "assistant", channel: "sms", event_type: "message", status: "delivered", body: "Welcome, Sam!" },
    ],
  },
};

describe("church export files (DB-06)", () => {
  it("recognises an export", () => {
    expect(isChurchExport(doc)).toBe(true);
    expect(isChurchExport({ format: "other" })).toBe(false);
    expect(isChurchExport(null)).toBe(false);
  });

  it("names files after the church and the day", () => {
    expect(slugify("Grâce Community Church!")).toBe("grace-community-church");
    expect(slugify("")).toBe("church");
    expect(exportFileName(doc, "json")).toBe("1stayz-grace-community-church-all-data-2026-11-09.json");
    expect(exportFileName(doc, "conversations")).toBe("1stayz-grace-community-church-conversations-2026-11-09.csv");
  });

  it("people: oldest first, latest consent per channel wins", () => {
    const lines = peopleCsv(doc).split("\r\n");
    expect(lines[0]).toBe("Person ID,First name,Last name,Phone,Email,Stage,Visits,Text consent,Email consent,Do not contact,Added");
    expect(lines[1]).toBe("p1,Sam,Guest,'+12175550101,,contacted,2,revoked,,,2026-11-01");
    expect(lines[2]).toBe("p2,Bo,Lee,,bo@example.com,new,1,,granted,yes,2026-11-02");
  });

  it("conversations: in time order, with the guest's name, formulas defused", () => {
    const lines = conversationsCsv(doc).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Welcome, Sam!");
    expect(lines[1].startsWith("t1,Sam Guest,2026-11-01T12:00:00Z,outbound,assistant")).toBe(true);
    expect(lines[2].endsWith(`"'=HYPERLINK(""x""), ""hi"""`)).toBe(true);
  });

  it("toCsv leaves numbers alone and defuses formula text", () => {
    expect(toCsv([[-5, "-5", "@SUM(A1)", "+1", "plain"]])).toBe("-5,'-5,'@SUM(A1),'+1,plain");
  });
});
