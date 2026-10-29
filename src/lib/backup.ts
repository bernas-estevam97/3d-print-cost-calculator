// Full JSON backup / restore and settings-only export (main doc 6.14).
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient;
type AnyDelegate = { findMany(a: object): Promise<object[]>; createMany(a: object): Promise<unknown>; deleteMany(a: object): Promise<unknown> };

// dependency order: parents first
const WS_TABLES = [
  "settings", "companyDetails", "taxRegime", "marketplaceFee", "loyaltyTier", "catalogItem", "printerGroup", "printer", "dryer",
  "filament", "clientCategory", "client", "modelGroup", "model", "warehouseShelf", "shelfItem", "finishedGood", "order",
  "writeOff", "calendarEvent", "document", "calcTemplate", "calcDraft",
] as const;
const CHILD_TABLES = { modelFilament: "model", orderMaterial: "order", orderService: "order" } as const;
const SETTINGS_TABLES = ["settings", "taxRegime", "marketplaceFee", "loyaltyTier", "catalogItem"] as const;

const d = (c: Tx | typeof db, t: string) => (c as unknown as Record<string, AnyDelegate>)[t];

export const BACKUP_VERSION = 1;

export async function exportData(workshopId: string, scope: "full" | "settings") {
  const tables = scope === "settings" ? SETTINGS_TABLES : WS_TABLES;
  const out: Record<string, object[]> = {};
  for (const t of tables) out[t] = await d(db, t).findMany({ where: { workshopId } });
  if (scope === "full") {
    for (const [t, parent] of Object.entries(CHILD_TABLES)) out[t] = await d(db, t).findMany({ where: { [parent]: { workshopId } } });
  }
  return { app: "3d-print-pricing", version: BACKUP_VERSION, scope, exportedAt: new Date().toISOString(), data: out };
}

type Backup = Awaited<ReturnType<typeof exportData>>;

/** Replaces the tables present in the file. Full backups replace everything; settings files only settings. */
export async function importData(workshopId: string, file: Backup) {
  if (file?.app !== "3d-print-pricing" || !file.data) throw new Error("Not a 3D Print Pricing backup file");
  const tables = (file.scope === "full" ? WS_TABLES : SETTINGS_TABLES).filter((t) => file.data[t]);
  const rewrite = (rows: object[]) => rows.map((r) => ({ ...r, workshopId }));
  await db.$transaction(
    async (tx) => {
      // children are removed by cascade when their parents go
      for (const t of [...tables].reverse()) await d(tx, t).deleteMany({ where: { workshopId } });
      for (const t of tables) {
        const rows = rewrite(file.data[t]);
        if (rows.length) await d(tx, t).createMany({ data: rows });
      }
      if (file.scope === "full") {
        for (const t of Object.keys(CHILD_TABLES)) if (file.data[t]?.length) await d(tx, t).createMany({ data: file.data[t] });
      }
    },
    { timeout: 60_000 },
  );
  return { tables: tables.length };
}
