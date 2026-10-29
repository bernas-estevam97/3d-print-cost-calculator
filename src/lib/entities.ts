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
  /** side effects after create (write-offs) */
  afterCreate?: (row: Row, workshopId: string) => Promise<void>;
  files?: string[];
};

const str = z.string().trim();
const optStr = str.optional().default("");
const money = z.coerce.number().min(0).default(0);
const nullableNum = z.coerce.number().nullable().optional();
const nullableId = z.string().nullable().optional();
const jsonArray = z.array(z.string()).default([]).transform((a) => JSON.stringify(a));

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
    }),
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
  "model-groups": { model: "modelGroup", schema: z.object({ name: str.min(1) }), orderBy: { name: "asc" } },
  models: {
    model: "model",
    files: ["photoUrl", "fileUrl"],
    orderBy: { name: "asc" },
    include: { group: true, filaments: { include: { filament: true } } },
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
    }),
    toData: (d, _ws, id) => {
      const { filaments, ...rest } = d as { filaments?: { filamentId: string | null; grams: number }[] };
      if (!filaments) return rest;
      return { ...rest, filaments: { ...(id ? { deleteMany: {} } : {}), create: filaments } };
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
    include: { items: true, goods: true },
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
    schema: z.object({ shelfId: z.string(), name: str.min(1), quantity: money, unitCost: money }),
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
