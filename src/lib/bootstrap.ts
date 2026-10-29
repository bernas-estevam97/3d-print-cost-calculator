// Defaults every new workshop starts with (main doc 4.1 and 6.9).
import type { PrismaClient } from "@/generated/prisma/client";

export const SEED_TAXES: [string, number][] = [
  ["Simplified tax", 6], ["Self-employed", 6], ["Sole proprietor", 20], ["LLC", 20], ["VAT", 5], ["IVA", 23],
];
export const SEED_BRANDS = ["Bambu Lab", "Overture", "eSun", "Polymaker", "Creality", "FlashForge", "ELEGOO", "ERYONE", "Other"];
export const SEED_TYPES = ["PLA", "PETG", "ABS", "ASA", "PET", "PCTG", "TPU", "TPE", "PVA", "HIPS", "Nylon", "PA", "PC", "PP", "PMMA", "PEEK"];
export const SEED_MODIFIERS = [
  "Lite", "Silk", "Silk+", "Matte", "Marble", "Galaxy", "Sparkle", "Translucent", "Fluorescent", "Glow", "Wood", "Metal",
  "Dual Color", "Triple Color", "Quad Color", "Gradient", "CF", "GF", "Aero", "HF", "FR", "95A", "68D",
];

export async function createWorkshop(db: PrismaClient, name: string) {
  const ws = await db.workshop.create({ data: { name } });
  const workshopId = ws.id;
  const taxes = await Promise.all(
    SEED_TAXES.map(([n, ratePct]) => db.taxRegime.create({ data: { workshopId, name: n, ratePct } })),
  );
  await db.settings.create({
    data: { workshopId, defaultTaxRegimeId: taxes.find((t) => t.name === "IVA")!.id },
  });
  await db.companyDetails.create({ data: { workshopId } });
  await db.catalogItem.createMany({
    data: [
      ...SEED_BRANDS.map((n) => ({ workshopId, kind: "brand", name: n })),
      ...SEED_TYPES.map((n) => ({ workshopId, kind: "materialType", name: n })),
      ...SEED_MODIFIERS.map((n) => ({ workshopId, kind: "modifier", name: n })),
    ],
  });
  await db.warehouseShelf.createMany({
    data: [
      { workshopId, name: "Filaments", icon: "spool", kind: "filaments", builtIn: true, sort: 0, link: "/en/filaments" },
      { workshopId, name: "Keychain rings", icon: "key", kind: "rings", builtIn: true, sort: 1 },
      { workshopId, name: "Finished models", icon: "box", kind: "finished", builtIn: true, sort: 3 },
    ],
  });
  return ws;
}
