// Calculator form state and its mapping to the pure pricing input.
// Shared by the browser (live panel) and the server (saving), so both compute
// from the same references. No I/O here.
import { z } from "zod";
import { compute, defaultPricingSettings, type PricingInput, type PricingSettings } from "./pricing";
import { STATUS_KEYS } from "./status";

const num = z.coerce.number().catch(0);
const id = z.string().nullable().catch(null);

export const calcSchema = z.object({
  name: z.string().catch(""),
  advanced: z.boolean().catch(false),
  modelSource: z.enum(["catalog", "stock"]).catch("catalog"),
  modelId: id,
  finishedGoodId: id,
  // unit production cost of the finished model, pinned by the server when it is sold
  stockUnitCost: z.coerce.number().nullable().catch(null),
  quantity: z.coerce.number().min(1).catch(1),
  materialMode: z.enum(["stock", "manual"]).catch("stock"),
  materials: z.array(z.object({ filamentId: id, grams: num })).catch([]),
  manual: z.object({ name: z.string().catch(""), grams: num, pricePerKg: num }).catch({ name: "", grams: 0, pricePerKg: 0 }),
  printerId: id,
  dryerId: id,
  printH: num,
  printMin: num,
  labor: z.object({ operator: num, modeling: num, painting: num }).catch({ operator: 0, modeling: 0, painting: 0 }),
  warehouseItems: z.array(z.object({ shelfItemId: z.string(), qty: num })).catch([]),
  packaging: num,
  delivery: num,
  consumables: num,
  postProcessing: num,
  printFileCost: num,
  services: z
    .array(z.object({ name: z.string().catch(""), cost: num, mode: z.enum(["fixed", "markup"]).catch("fixed"), price: num }))
    .catch([]),
  clientId: id,
  discountPct: num,
  discountAmount: num,
  taxRegimeId: id,
  customTaxPct: z.coerce.number().nullable().catch(null),
  marketplaceFeeId: id,
  customMarketplacePct: z.coerce.number().nullable().catch(null),
  priceMode: z.enum(["auto", "markup", "price", "profit"]).catch("auto"),
  markupPct: num,
  targetPrice: num,
  targetProfit: num,
  complexity: z.enum(["none", "simple", "medium", "complex"]).catch("none"),
  marketingPct: num,
  tips: num,
  status: z.enum(STATUS_KEYS).catch("negotiation"),
  saleDate: z.string().catch(""),
  dueDate: z.string().catch(""),
  tags: z.array(z.string()).catch([]),
  notes: z.string().catch(""),
  includeLabor: z.boolean().catch(true),
  slicerFileUrl: z.string().nullable().catch(null),
  // picture the user attached to the order; wins over the model's photo
  photoUrl: z.string().nullable().catch(null),
});

export type CalcInput = z.infer<typeof calcSchema>;

export const emptyCalc = (): CalcInput => calcSchema.parse({});

/** Everything the mapping needs to look up. Browser fills it from API lists, server from the db. */
export type CalcRefs = {
  settings: PricingSettings & { defaultMarkupPct: number };
  filaments: { id: string; name: string; brand?: string; pricePerKg: number; colors: string[]; stockG?: number }[];
  printers: { id: string; model: string; internalName?: string; powerW: number; price: number; lifetimeH: number }[];
  dryers: { id: string; name: string; powerW: number; price: number; lifetimeH: number }[];
  shelfItems: { id: string; name: string; unitCost: number; quantity: number }[];
  finishedGoods: { id: string; name: string; unitCost: number; unitPrice: number; quantity: number }[];
  taxRegimes: { id: string; name: string; ratePct: number }[];
  marketplaceFees: { id: string; name: string; commissionPct: number; fixedFee: number }[];
};

export type MaterialSnapshot = { filamentId: string | null; name: string; color: string; grams: number; pricePerKg: number };

export function toPricingInput(c: CalcInput, refs: CalcRefs): { input: PricingInput; materials: MaterialSnapshot[] } {
  const s = refs.settings ?? { ...defaultPricingSettings, defaultMarkupPct: 30 };
  const stockSale = c.modelSource === "stock" && !!c.finishedGoodId;
  const good = stockSale ? refs.finishedGoods.find((g) => g.id === c.finishedGoodId) : undefined;

  let materials: MaterialSnapshot[] = [];
  if (!stockSale) {
    if (c.materialMode === "manual") {
      if (c.manual.grams > 0) materials = [{ filamentId: null, name: c.manual.name || "Manual material", color: "", grams: c.manual.grams, pricePerKg: c.manual.pricePerKg }];
    } else {
      materials = c.materials
        .filter((m) => m.grams > 0)
        .map((m) => {
          const f = refs.filaments.find((x) => x.id === m.filamentId);
          return { filamentId: f?.id ?? null, name: f?.name ?? "Unknown filament", color: f?.colors[0] ?? "", grams: m.grams, pricePerKg: f?.pricePerKg ?? 0 };
        });
    }
  }

  const machine = (m?: { powerW: number; price: number; lifetimeH: number }) =>
    m ? { powerW: m.powerW, price: m.price, lifetimeH: m.lifetimeH } : null;
  const tax = c.customTaxPct != null ? c.customTaxPct : refs.taxRegimes.find((t) => t.id === c.taxRegimeId)?.ratePct ?? null;
  const mp =
    c.customMarketplacePct != null
      ? { commissionPct: c.customMarketplacePct, fixedFee: 0 }
      : refs.marketplaceFees.find((m) => m.id === c.marketplaceFeeId) ?? null;

  const warehouseItems = c.warehouseItems.map((w) => ({
    unitCost: refs.shelfItems.find((i) => i.id === w.shelfItemId)?.unitCost ?? 0,
    qty: w.qty,
  }));
  if (stockSale) warehouseItems.push({ unitCost: c.stockUnitCost ?? good?.unitCost ?? 0, qty: c.quantity });

  const labor = c.includeLabor ? c.labor : { operator: 0, modeling: 0, painting: 0 };

  return {
    materials,
    input: {
      quantity: stockSale ? 1 : c.quantity, // a stock sale's quantity is carried by the warehouse line
      materials,
      printTimeH: stockSale ? 0 : c.printH + c.printMin / 60,
      printer: stockSale ? null : machine(refs.printers.find((p) => p.id === c.printerId)),
      dryer: stockSale ? null : machine(refs.dryers.find((d) => d.id === c.dryerId)),
      laborHours: labor,
      warehouseItems,
      consumables: c.advanced ? c.consumables : 0,
      postProcessing: c.advanced ? c.postProcessing : 0,
      printFileCost: c.advanced ? c.printFileCost : 0,
      packaging: c.packaging,
      delivery: c.delivery,
      services: c.services.filter((x) => x.name || x.cost || x.price),
      priceMode: c.priceMode,
      markupPct: c.priceMode === "auto" ? s.defaultMarkupPct : c.markupPct,
      targetPrice: c.targetPrice,
      targetProfit: c.targetProfit,
      complexity: c.complexity,
      marketingPct: c.marketingPct,
      discountPct: c.discountPct,
      discountAmount: c.discountAmount,
      taxRatePct: tax,
      marketplace: mp ? { commissionPct: mp.commissionPct, fixedFee: mp.fixedFee } : null,
      tips: c.tips,
      settings: s,
    },
  };
}

type CatalogModel = {
  id: string; name: string; printTimeMin: number; complexity: string; extraCosts: number; pricePerPiece: number | null;
  filaments: { filamentId: string | null; grams: number }[];
  accessories?: { shelfItemId: string; qty: number }[];
};

/** Model accessories for an order of `quantity` pieces. */
export const modelAccessories = (model: CatalogModel, quantity: number) =>
  (model.accessories ?? []).map((a) => ({ shelfItemId: a.shelfItemId, qty: a.qty * quantity }));

/**
 * Calculator input prefilled from a catalog model (main doc 6.8). The Model Catalog prices its
 * models with this too, so both always agree.
 */
export function modelToCalc(model: CatalogModel, base: CalcInput): CalcInput {
  const accessories = modelAccessories(model, base.quantity);
  return {
    ...base,
    modelSource: "catalog",
    modelId: model.id,
    name: model.name,
    materialMode: "stock",
    materials: model.filaments.length ? model.filaments.map((f) => ({ filamentId: f.filamentId, grams: f.grams })) : base.materials,
    printH: Math.floor(model.printTimeMin / 60),
    printMin: Math.round(model.printTimeMin % 60),
    complexity: (model.complexity as CalcInput["complexity"]) ?? "none",
    printFileCost: model.extraCosts || base.printFileCost,
    advanced: base.advanced || model.extraCosts > 0,
    // the model's accessories replace those lines, other stock items stay
    warehouseItems: [...base.warehouseItems.filter((w) => !accessories.some((a) => a.shelfItemId === w.shelfItemId)), ...accessories],
    // a fixed price per piece replaces cost-based pricing (main doc 5.5)
    ...(model.pricePerPiece != null ? { priceMode: "price" as const, targetPrice: model.pricePerPiece * base.quantity } : {}),
  };
}

/**
 * Production cost carried by a sale from Finished models (part of the warehouse cost line).
 * Uses the cost pinned at sale time, so later production or price changes never rewrite it.
 */
export function stockSaleCost(c: Pick<CalcInput, "modelSource" | "finishedGoodId" | "stockUnitCost" | "quantity">, currentUnitCost = 0) {
  if (c.modelSource !== "stock" || !c.finishedGoodId) return 0;
  return (c.stockUnitCost ?? currentUnitCost) * c.quantity;
}

export function computeCalc(c: CalcInput, refs: CalcRefs) {
  const { input, materials } = toPricingInput(c, refs);
  const result = compute(input);
  // a stock sale needs no printer, so drop that warning
  if (c.modelSource === "stock" && c.finishedGoodId) result.warnings = result.warnings.filter((w) => w !== "noPrinter");
  return { input, materials, result };
}

/** Settings row -> pricing settings. */
export function pricingSettings(s: {
  electricityEnabled: boolean; electricityTariff: number; operatorRate: number; modelingRate: number; paintingRate: number;
  defaultMarkupPct: number; mbMaterial: boolean; mbLabor: boolean; mbWarehouse: boolean; mbPackagingDelivery: boolean;
  mbElectricity: boolean; mbAmortization: boolean; mbConsumables: boolean; deductTaxes: boolean; deductMarketplace: boolean;
  deductAcquiring: boolean; acquiringPct: number; complexitySimplePct: number; complexityMediumPct: number;
  complexityComplexPct: number; defectAllowancePct: number; roundingMode: string;
}): PricingSettings & { defaultMarkupPct: number } {
  return {
    electricityEnabled: s.electricityEnabled,
    electricityTariff: s.electricityTariff,
    operatorRate: s.operatorRate,
    modelingRate: s.modelingRate,
    paintingRate: s.paintingRate,
    defaultMarkupPct: s.defaultMarkupPct,
    markupBase: {
      material: s.mbMaterial,
      labor: s.mbLabor,
      warehouse: s.mbWarehouse,
      packagingDelivery: s.mbPackagingDelivery,
      electricity: s.mbElectricity,
      amortization: s.mbAmortization,
      consumables: s.mbConsumables,
    },
    deductTaxes: s.deductTaxes,
    deductMarketplace: s.deductMarketplace,
    deductAcquiring: s.deductAcquiring,
    acquiringPct: s.acquiringPct,
    complexitySimplePct: s.complexitySimplePct,
    complexityMediumPct: s.complexityMediumPct,
    complexityComplexPct: s.complexityComplexPct,
    defectAllowancePct: s.defectAllowancePct,
    roundingMode: s.roundingMode as PricingSettings["roundingMode"],
  };
}
