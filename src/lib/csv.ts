type Cell = string | number | boolean | null | undefined;

function escape(cell: Cell) {
  const s = cell === null || cell === undefined ? "" : String(cell);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Rows of cells → RFC 4180 CSV. The first row is usually the header. */
export function toCsv(rows: Cell[][]) {
  return rows.map((r) => r.map(escape).join(",")).join("\r\n");
}

/** Triggers a client-side download. Call from an event handler. */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const blob = new Blob([`﻿${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
