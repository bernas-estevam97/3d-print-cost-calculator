// CSV export/import for the list pages. The header row holds field names, so a file exported
// here imports back unchanged (and another app can read the same structure).
export type Cell = string | number | boolean | null | undefined;

const esc = (v: Cell) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** BOM first so Excel opens UTF-8 (accents, €) correctly. */
export const toCsv = (head: string[], rows: Cell[][]) =>
  "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");

/** Minimal CSV parser: commas or semicolons (Excel in many locales), double-quoted fields, newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  text = text.replace(/^﻿/, "").replace(/\r/g, "");
  const first = text.slice(0, text.indexOf("\n") >>> 0);
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === sep && !q) { row.push(cur); cur = ""; }
    else if (c === "\n" && !q) { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  row.push(cur);
  rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries((head ?? []).map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export function downloadCsv(name: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Number from a CSV cell; accepts a decimal comma. Empty or invalid gives the default. */
export const num = (s: string | undefined, d = 0) => {
  const n = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : d;
};
export const bool = (s: string | undefined) => /^(true|yes|1)$/i.test(s ?? "");
