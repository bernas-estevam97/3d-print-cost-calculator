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
  if (good) warehouseItems.push({ unitCost: good.unitCost, qty: c.quantity });

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
