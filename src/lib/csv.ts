// Tiny client-side CSV export helper — everything on the report screens is
// already in the browser (it came from one fetch of the filtered dataset),
// so exporting doesn't need a round trip to the server.

// Excel/Sheets/LibreOffice treat a cell starting with one of these
// characters as a formula when the file is opened. Values here can
// originate from a campaign/ad/account name set by anyone with edit access
// to the underlying Meta ad account — not necessarily someone trusted with
// this dashboard — so a leading apostrophe forces the cell to render as
// plain text instead of executing (standard CSV-injection mitigation).
const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

function toCsvCell(value: string): string {
  const safeValue = FORMULA_TRIGGER_RE.test(value) ? `'${value}` : value;
  if (/[",\n;]/.test(safeValue)) return `"${safeValue.replace(/"/g, '""')}"`;
  return safeValue;
}

/** Pure row-to-CSV-text serialization — shared with the server-side export route (report-data.ts consumers) so a server-generated CSV and a client-generated one are byte-for-byte the same format. No BOM here; downloadCsv adds it for the browser-download case. */
export function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map(toCsvCell).join(";")).join("\n");
}

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rowsToCsv(rows);
  // Leading BOM so Excel opens the accented pt-BR text as UTF-8 instead of guessing Latin-1.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
