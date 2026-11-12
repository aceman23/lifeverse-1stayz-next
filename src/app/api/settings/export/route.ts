import { NextResponse, type NextRequest } from "next/server";
import { conversationsCsv, EXPORT_FORMATS, exportFileName, isChurchExport, peopleCsv, type ExportFormat } from "@/lib/church/export";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// DB-06: Settings > Data. The signed-in owner downloads their own church's data:
//   GET /api/settings/export?format=json            everything, as one JSON file
//   GET /api/settings/export?format=people          people, as a spreadsheet (CSV)
//   GET /api/settings/export?format=conversations   every message, as a spreadsheet (CSV)
// Runs as the user: the database checks they're the owner, leaves secrets out, and records the
// download in the audit log. Nothing is cached; logs carry codes only.

export async function GET(request: NextRequest) {
  const format = (request.nextUrl.searchParams.get("format") ?? "json") as ExportFormat;
  const noStore = { "Cache-Control": "no-store, private" };
  if (!EXPORT_FORMATS.includes(format)) {
    return NextResponse.json({ error: "Unknown format." }, { status: 400, headers: noStore });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download your church's data." }, { status: 401, headers: noStore });

  const { data, error } = await supabase.rpc("export_church_data");
  if (error) {
    const owner = error.code === "42501";
    log("settings.export_refused", { code: error.code ?? "unknown" });
    return NextResponse.json(
      { error: owner ? "Only the church owner can download the church's data." : "Couldn't prepare the download. Try again." },
      { status: owner ? 403 : 500, headers: noStore },
    );
  }
  if (!isChurchExport(data)) return NextResponse.json({ error: "Couldn't prepare the download." }, { status: 500, headers: noStore });

  const body = format === "json" ? JSON.stringify(data, null, 2) : `﻿${format === "people" ? peopleCsv(data) : conversationsCsv(data)}`;
  log("settings.exported", { church_id: data.church_id, format });
  return new NextResponse(body, {
    status: 200,
    headers: {
      ...noStore,
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(data, format)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
