// Registry for the plain CRUD entities served by /api/[entity] and /api/[entity]/[id].
// Orders, settings, documents and anything with business rules have their own routes.
import { z } from "zod";
import { db, parseJson } from "./db";
import {
  clientLevel, clientStats, enrichFilament, enrichPrinter, filamentUsage, printerStats,
} from "./derive";
import { remove } from "./storage";

type Row = Record<string, unknown> & { id: string };
type Delegate = {
  findMany(a: object): Promise<Row[]>;
  findFirst(a: object): Promise<Row | null>;
  create(a: object): Promise<Row>;
  update(a: object): Promise<Row>;
  delete(a: object): Promise<Row>;
};

type Entity = {
  model: string;
  schema: z.ZodObject;
  orderBy?: object;
  include?: object;
  /** turn validated input into Prisma data (nested writes etc.) */
  toData?: (d: Record<string, unknown>, workshopId: string, id?: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** add derived fields to list/detail output */
  enrich?: (rows: Row[], workshopId: string) => Promise<Row[]>;
  /** side effects after create (write-offs, stock purchases) */
  afterCreate?: (row: Row, workshopId: string) => Promise<void>;
  /** side effects after update, with the row as it was before */
  afterUpdate?: (before: Row, after: Row, workshopId: string) => Promise<void>;
  files?: string[];
  /** names must be unique per workshop, ignoring case */
  uniqueName?: boolean;
};

const str = z.string().trim();
const optStr = str.optional().default("");
const money = z.coerce.number().min(0).default(0);
const nullableNum = z.coerce.number().nullable().optional();
const nullableId = z.string().nullable().optional();
const jsonArray = z.array(z.string()).default([]).transform((a) => JSON.stringify(a));

/**
 * Money spent on stock: every increase of a filament's spools or a shelf item's quantity is a purchase
 * at the price paid then. Orders and write-offs take stock without coming through here, so nothing is
 * counted twice, and later price changes never rewrite past purchases.
 */
async function recordPurchase(workshopId: string, kind: "filament" | "item", row: Row, quantity: number, unitPrice: number) {
  if (!(quantity > 0) || !(unitPrice > 0)) return;
  await db.stockPurchase.create({
    data: { workshopId, kind, refId: row.id, name: row.name as string, quantity, unitPrice, total: quantity * unitPrice },
  });
}

export const ENTITIES: Record<string, Entity> = {
  "printer-groups": { model: "printerGroup", schema: z.object({ name: str.min(1) }), orderBy: { name: "asc" } },
  printers: {
    model: "printer",
    files: ["photoUrl"],
    orderBy: { createdAt: "asc" },
    include: { group: true },
    schema: z.object({
      manufacturer: optStr,
      model: str.min(1, "Model is required"),
      internalName: optStr,
      powerW: z.coerce.number().min(0).default(200),
      price: money,
      lifetimeH: z.coerce.number().positive().default(5000),
      initialHours: money,
      hoursManual: money,
      note: optStr,
      photoUrl: z.string().nullable().optional(),
      favourite: z.boolean().default(false),
      groupId: nullableId,
      maintenanceIntervalHours: nullableNum,
      maintenanceIntervalDays: z.coerce.number().int().nullable().optional(),
      lastMaintenanceAt: z.coerce.date().nullable().optional(),
      lastMaintenanceHours: money,
    }),
    enrich: async (rows, ws) => {
      const stats = await printerStats(ws);
      return rows.map((r) => enrichPrinter(r as never, stats) as unknown as Row);
    },
  },
  dryers: {
    model: "dryer",
    orderBy: { createdAt: "asc" },
    schema: z.object({
      name: str.min(1),
      powerW: z.coerce.number().min(0).default(50),
      price: money,
      lifetimeH: z.coerce.number().positive().default(5000),
      hoursUsed: money,
    }),
  },
  filaments: {
    model: "filament",
    files: ["photoUrl"],
    orderBy: { name: "asc" },
    schema: z.object({
      name: str.transform((s) => s || "PLA Basic").default("PLA Basic"),
      brand: optStr,
      type: str.default("PLA"),
      modifier: z.string().nullable().optional(),
      purchaseLink: z.string().nullable().optional(),
      spoolPrice: money,
      spoolWeightG: z.coerce.number().positive().default(1000),
      spoolCount: z.coerce.number().min(0).default(1),
      usedFromSpoolG: money,
      colors: jsonArray,
      photoUrl: z.string().nullable().optional(),
      lowStockThresholdG: nullableNum,
      notes: optStr,
      acquiredAt: z.coerce.date().nullable().optional(),
    }),
    afterCreate: (r, ws) => recordPurchase(ws, "filament", r, r.spoolCount as number, r.spoolPrice as number),
    afterUpdate: (b, a, ws) => recordPurchase(ws, "filament", a, (a.spoolCount as number) - (b.spoolCount as number), a.spoolPrice as number),
    enrich: async (rows, ws) => {
      const usage = await filamentUsage(ws);
      return rows.map((r) => enrichFilament(r as never, usage) as unknown as Row);
    },
  },
  "client-categories": { model: "clientCategory", schema: z.object({ name: str.min(1) }), orderBy: { name: "asc" } },
  clients: {
    model: "client",
    files: ["photoUrl"],
    orderBy: { name: "asc" },
    include: { category: true },
    schema: z.object({
      name: str.min(1, "Name is required"),
      phone: optStr,
      email: optStr,
      address: optStr,
      source: optStr,
      discountPct: z.coerce.number().min(0).max(100).default(0),
      categoryId: nullableId,
      photoUrl: z.string().nullable().optional(),
      telegram: optStr,
      contactPerson: optStr,
      signer: optStr,
      companyName: optStr,
      taxId: optStr,
      note: optStr,
    }),
    enrich: async (rows, ws) => {
      const stats = await clientStats(ws);
      return rows.map((r) => {
        const s = stats.get(r.id) ?? { ordersCount: 0, completedAmount: 0 };
        return { ...r, ...s, level: clientLevel(s.ordersCount) };
      });
    },
  },
  "model-groups": { model: "modelGroup", schema: z.object({ name: str.min(1) }), orderBy: { name: "asc" }, uniqueName: true },
  models: {
    model: "model",
    files: ["photoUrl", "fileUrl"],
    orderBy: { name: "asc" },
    include: { group: true, filaments: { include: { filament: true } }, accessories: { include: { shelfItem: true } } },
    schema: z.object({
      name: str.min(1, "Name is required"),
      photoUrl: z.string().nullable().optional(),
      fileUrl: z.string().nullable().optional(),
      sourceLink: optStr,
      groupId: nullableId,
      printTimeMin: money,
      extraCosts: money,
      pricePerPiece: nullableNum,
      complexity: z.enum(["none", "simple", "medium", "complex"]).default("none"),
      sellAsProduct: z.boolean().default(false),
      productDescription: optStr,
      filaments: z
        .array(z.object({ filamentId: z.string().nullable(), grams: z.coerce.number().min(0) }))
        .max(16)
        .default([]),
      // stock shelf items used per piece (keychain rings, magnets…)
      accessories: z
        .array(z.object({ shelfItemId: z.string(), qty: z.coerce.number().positive() }))
        .max(32)
        .default([]),
    }),
    toData: async (d, ws, id) => {
      const { filaments, accessories, ...rest } = d as {
        filaments?: { filamentId: string | null; grams: number }[];
        accessories?: { shelfItemId: string; qty: number }[];
      };
      const data: Record<string, unknown> = rest;
      if (filaments) data.filaments = { ...(id ? { deleteMany: {} } : {}), create: filaments };
      if (accessories) {
        // only this workshop's items
        const own = new Set((await db.shelfItem.findMany({ where: { workshopId: ws, id: { in: accessories.map((a) => a.shelfItemId) } }, select: { id: true } })).map((x) => x.id));
        data.accessories = { ...(id ? { deleteMany: {} } : {}), create: accessories.filter((a) => own.has(a.shelfItemId)) };
      }
      return data;
    },
    enrich: async (rows) =>
      rows.map((r) => ({
        ...r,
        materialPerPieceG: ((r.filaments as { grams: number }[]) ?? []).reduce((a, f) => a + f.grams, 0),
      })),
  },
  shelves: {
    model: "warehouseShelf",
    files: ["photoUrl"],
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    include: { items: true, goods: { include: { model: { select: { photoUrl: true } } } } },
    schema: z.object({
      name: str.min(1),
      icon: optStr,
      link: optStr,
      kind: z.enum(["custom", "finished", "rings", "filaments"]).default("custom"),
      hidden: z.boolean().default(false),
      photoUrl: z.string().nullable().optional(),
    }),
  },
  "shelf-items": {
    model: "shelfItem",
    orderBy: { name: "asc" },
    include: { shelf: true },
    schema: z.object({
      shelfId: z.string(), name: str.min(1), quantity: money, unitCost: money, pricePaid: money, notes: optStr,
      acquiredAt: z.coerce.date().nullable().optional(),
    }),
    afterCreate: (r, ws) => recordPurchase(ws, "item", r, r.quantity as number, r.pricePaid as number),
    afterUpdate: (b, a, ws) => recordPurchase(ws, "item", a, (a.quantity as number) - (b.quantity as number), a.pricePaid as number),
  },
  "finished-goods": {
    model: "finishedGood",
    files: ["photoUrl"],
    orderBy: { name: "asc" },
    include: { model: true },
    schema: z.object({
      shelfId: z.string(),
      modelId: nullableId,
      name: str.min(1),
      quantity: money,
      unitCost: money,
      unitPrice: money,
      photoUrl: z.string().nullable().optional(),
      description: optStr,
    }),
  },
  "write-offs": {
    model: "writeOff",
    orderBy: { createdAt: "desc" },
    schema: z.object({
      kind: z.enum(["filament", "finished", "other"]),
      refId: z.string(),
      name: optStr,
      quantity: z.coerce.number().positive(),
      reason: optStr,
    }),
    afterCreate: async (w) => {
      if (w.kind === "finished") {
        await db.finishedGood.update({ where: { id: w.refId as string }, data: { quantity: { decrement: w.quantity as number } } });
      } else if (w.kind === "filament") {
        await db.filament.update({ where: { id: w.refId as string }, data: { usedFromSpoolG: { increment: w.quantity as number } } });
      }
    },
  },
  "tax-regimes": {
    model: "taxRegime",
    orderBy: { createdAt: "asc" },
    schema: z.object({ name: str.min(1), ratePct: z.coerce.number().min(0).max(100) }),
  },
  "marketplace-fees": {
    model: "marketplaceFee",
    orderBy: { createdAt: "asc" },
    schema: z.object({ name: str.min(1), commissionPct: z.coerce.number().min(0).max(100), fixedFee: money }),
  },
  "loyalty-tiers": {
    model: "loyaltyTier",
    orderBy: { minOrders: "asc" },
    schema: z.object({ minOrders: z.coerce.number().int().min(1), discountPct: z.coerce.number().min(0).max(100) }),
  },
  "catalog-items": {
    model: "catalogItem",
    orderBy: { name: "asc" },
    schema: z.object({ kind: z.enum(["brand", "materialType", "modifier"]), name: str.min(1) }),
  },
  templates: {
    model: "calcTemplate",
    orderBy: { createdAt: "asc" },
    schema: z.object({ name: str.min(1), input: z.unknown().transform((v) => JSON.stringify(v)) }),
    enrich: async (rows) => rows.map((r) => ({ ...r, input: parseJson(r.input as string, {}) })),
  },
  drafts: {
    model: "calcDraft",
    orderBy: { updatedAt: "desc" },
    schema: z.object({ name: optStr, input: z.unknown().transform((v) => JSON.stringify(v)) }),
    enrich: async (rows) => rows.map((r) => ({ ...r, input: parseJson(r.input as string, {}) })),
  },
};

export function entity(name: string) {
  const e = ENTITIES[name];
  return e ? { ...e, delegate: (db as unknown as Record<string, Delegate>)[e.model] } : null;
}

export async function listEntity(name: string, workshopId: string, where: object = {}) {
  const e = entity(name)!;
  const rows = await e.delegate.findMany({ where: { workshopId, ...where }, orderBy: e.orderBy, include: e.include });
  return e.enrich ? e.enrich(rows, workshopId) : rows;
}

export async function deleteFiles(e: Entity, workshopId: string, row: Row) {
  for (const f of e.files ?? []) await remove(workshopId, row[f] as string | null);
}

export const MAX_DRAFTS = 5;
export const MAX_TEMPLATES = 15;
