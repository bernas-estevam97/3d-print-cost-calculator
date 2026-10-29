"use client";
// Export / Import CSV buttons shared by Clients, Orders and the Stocks shelves.
import { Download, Upload } from "lucide-react";
import { useMutate } from "@/lib/client";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { Button } from "./ui";

export function CsvTools({ name, label, toCsv, onImport, columns }: {
  /** file name prefix, e.g. "clients" */
  name: string;
  /** what one row is, for the toast: "clients" */
  label: string;
  toCsv: () => string;
  /** creates the rows, returns how many were imported */
  onImport: (rows: Record<string, string>[]) => Promise<number>;
  /** shown as a tooltip on Import */
  columns: string[];
}) {
  const imp = useMutate<File, number>(async (f) => onImport(parseCsv(await f.text())), (n) => `${n} ${label} imported`);
  return (
    <>
      <Button onClick={() => downloadCsv(name, toCsv())}><Download className="size-4" /> Export</Button>
      <label
        title={`CSV columns: ${columns.join(", ")}`}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-card-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
      >
        <Upload className="size-4" /> {imp.isPending ? "Importing..." : "Import"}
        <input type="file" accept=".csv,text/csv" className="sr-only" disabled={imp.isPending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) imp.mutate(f); e.target.value = ""; }} />
      </label>
    </>
  );
}
