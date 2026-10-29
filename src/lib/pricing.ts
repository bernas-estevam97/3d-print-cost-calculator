// Pure cost/price module (main doc 5.3 - 5.4). Used by the live calculator panel
// and by the server when saving, so both always agree. No I/O, no imports from db.
//
// Conventions:
// - grams and print time are per piece; material, electricity and amortization scale with quantity.
// - labor, warehouse items, packaging, delivery, consumables and services are per order.
// - profit = revenue - totalCost (tips included in revenue); netProfit also subtracts tax,
//   marketplace fee and acquiring. This is what fixture 2 (main doc 5.3.1) and 5.6 require.
// - "Mandatory deductions" toggled on are added on top of the price in auto/markup mode
//   and deducted in netProfit; toggled off they are ignored entirely.

export type PriceMode = "auto" | "markup" | "price" | "profit";
export type Complexity = "none" | "simple" | "medium" | "complex";
export type RoundingMode = "none" | "nearest_1" | "up_1" | "nearest_5" | "up_5" | "up_10";

export type MarkupBase = {
  material: boolean;
  labor: boolean;
  warehouse: boolean;
  packagingDelivery: boolean;
  electricity: boolean;
  amortization: boolean;
  consumables: boolean;
};

export type PricingSettings = {
  electricityEnabled: boolean;
  electricityTariff: number;
  operatorRate: number;
  modelingRate: number;
  paintingRate: number;
  markupBase: MarkupBase;
  deductTaxes: boolean;
  deductMarketplace: boolean;
  deductAcquiring: boolean;
  acquiringPct: number;
  complexitySimplePct: number;
  complexityMediumPct: number;
  complexityComplexPct: number;
  defectAllowancePct: number;
  roundingMode: RoundingMode;
};

export const defaultPricingSettings: PricingSettings = {
  electricityEnabled: true,
  electricityTariff: 0.17,
  operatorRate: 0,
  modelingRate: 0,
  paintingRate: 0,
  markupBase: {
    material: true,
    labor: true,
    warehouse: true,
    packagingDelivery: true,
    electricity: true,
    amortization: true,
    consumables: true,
  },
  deductTaxes: true,
  deductMarketplace: true,
  deductAcquiring: false,
  acquiringPct: 0,
  complexitySimplePct: 0,
  complexityMediumPct: 0,
  complexityComplexPct: 0,
  defectAllowancePct: 0,
  roundingMode: "none",
};

export type MaterialLine = { name: string; grams: number; pricePerKg: number; color?: string; filamentId?: string | null };
export type Machine = { powerW: number; price: number; lifetimeH: number };
export type Service = { name: string; cost: number; mode: "fixed" | "markup"; price: number };

export type PricingInput = {
  quantity: number;
  materials: MaterialLine[];
  printTimeH: number;
  printer: Machine | null;
  dryer: Machine | null;
  laborHours: { operator: number; modeling: number; painting: number };
  warehouseItems: { unitCost: number; qty: number }[];
  consumables: number;
  postProcessing: number;
  printFileCost: number;
  packaging: number;
  delivery: number;
  services: Service[];
  priceMode: PriceMode;
  markupPct: number;
  targetPrice: number;
  targetProfit: number;
  complexity: Complexity;
  marketingPct: number;
  discountPct: number;
  discountAmount: number;
  taxRatePct: number | null;
  marketplace: { commissionPct: number; fixedFee: number } | null;
  tips: number;
  settings: PricingSettings;
};

export type PricingWarning = "noPrinter" | "emptyMarkupBase";

export type PricingResult = {
  materialLines: (MaterialLine & { gramsEffective: number; cost: number })[];
  gramsTotal: number;
  costMaterial: number;
  costElectricity: number;
  costPrinter: number;
  costDryer: number;
  costLabor: number;
  costWarehouse: number;
  costConsumables: number;
  costPostprocessing: number;
  costOther: number;
  costPackaging: number;
  costDelivery: number;
  costServices: number;
  totalCost: number;
  markupBase: number;
  recommendedPrice: number;
  discountTotal: number;
  salePrice: number;
  taxAmount: number;
  marketplaceFee: number;
  acquiringFee: number;
  revenue: number;
  profit: number;
  netProfit: number;
  marginPct: number;
  pctOfCost: number;
  warnings: PricingWarning[];
};

const n = (x: number | null | undefined) => (Number.isFinite(x) ? (x as number) : 0);

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function applyRounding(price: number, mode: RoundingMode): number {
  const eps = 1e-9; // keep 3.0000000001 from rounding up to 4
  switch (mode) {
    case "nearest_1": return Math.round(price);
    case "up_1": return Math.ceil(price - eps);
    case "nearest_5": return Math.round(price / 5) * 5;
    case "up_5": return Math.ceil(price / 5 - eps) * 5;
    case "up_10": return Math.ceil(price / 10 - eps) * 10;
    default: return price;
  }
}

function complexityPct(c: Complexity, s: PricingSettings) {
  if (c === "simple") return s.complexitySimplePct;
  if (c === "medium") return s.complexityMediumPct;
  if (c === "complex") return s.complexityComplexPct;
  return 0;
}

export function compute(input: PricingInput): PricingResult {
  const s = input.settings;
  const q = Math.max(0, n(input.quantity));
  const t = Math.max(0, n(input.printTimeH)) * q;
  const defect = 1 + n(s.defectAllowancePct) / 100;
  const warnings: PricingWarning[] = [];

  const materialLines = input.materials.map((m) => {
    const gramsEffective = n(m.grams) * defect * q;
    return { ...m, gramsEffective, cost: (gramsEffective * n(m.pricePerKg)) / 1000 };
  });
  const gramsTotal = input.materials.reduce((a, m) => a + n(m.grams), 0) * q;
  const costMaterial = materialLines.reduce((a, l) => a + l.cost, 0);

  const kwh = (m: Machine | null) => (m && s.electricityEnabled ? (n(m.powerW) / 1000) * t * n(s.electricityTariff) : 0);
  const amort = (m: Machine | null) => (m && n(m.lifetimeH) > 0 ? (n(m.price) / m.lifetimeH) * t : 0);

  const printerElectricity = kwh(input.printer);
  const dryerElectricity = kwh(input.dryer);
  const costElectricity = printerElectricity + dryerElectricity;
  const costPrinter = amort(input.printer);
  const costDryer = amort(input.dryer);
  if (!input.printer) warnings.push("noPrinter");

  const h = input.laborHours;
  const costLabor = n(h.operator) * n(s.operatorRate) + n(h.modeling) * n(s.modelingRate) + n(h.painting) * n(s.paintingRate);
  const costWarehouse = input.warehouseItems.reduce((a, i) => a + n(i.unitCost) * n(i.qty), 0);
  const costConsumables = n(input.consumables);
  const costPostprocessing = n(input.postProcessing);
  const costOther = n(input.printFileCost);
  const costPackaging = n(input.packaging);
  const costDelivery = n(input.delivery);
  const costServices = input.services.reduce((a, sv) => a + n(sv.cost), 0);
  const servicesPrice = input.services.reduce(
    (a, sv) => a + (sv.mode === "markup" ? n(sv.cost) * (1 + n(sv.price) / 100) : n(sv.price)),
    0,
  );

  const nonServiceCost =
    costMaterial + costElectricity + costPrinter + costDryer + costLabor + costWarehouse +
    costConsumables + costPostprocessing + costOther + costPackaging + costDelivery;
  const totalCost = nonServiceCost + costServices;

  const mb = s.markupBase;
  const markupBase =
    (mb.material ? costMaterial : 0) +
    (mb.labor ? costLabor : 0) +
    (mb.warehouse ? costWarehouse : 0) +
    (mb.packagingDelivery ? costPackaging + costDelivery : 0) +
    (mb.electricity ? costElectricity : 0) +
    (mb.amortization ? costPrinter + costDryer : 0) +
    (mb.consumables ? costConsumables + costPostprocessing + costOther : 0);
  if (markupBase <= 0 && (input.priceMode === "auto" || input.priceMode === "markup")) warnings.push("emptyMarkupBase");

  const taxPct = s.deductTaxes ? n(input.taxRatePct) : 0;
  const mp = s.deductMarketplace ? input.marketplace : null;
  const acqPct = s.deductAcquiring ? n(s.acquiringPct) : 0;

  let recommendedPrice = nonServiceCost + (markupBase * n(input.markupPct)) / 100;
  recommendedPrice *= 1 + complexityPct(input.complexity, s) / 100;
  recommendedPrice *= 1 + n(input.marketingPct) / 100;
  recommendedPrice += servicesPrice;

  let salePrice: number;
  let discountTotal = 0;
  if (input.priceMode === "price") {
    salePrice = n(input.targetPrice);
  } else if (input.priceMode === "profit") {
    salePrice = totalCost + n(input.targetProfit);
  } else {
    const gross = recommendedPrice * (1 + (taxPct + n(mp?.commissionPct) + acqPct) / 100) + n(mp?.fixedFee);
    const discounted = gross * (1 - n(input.discountPct) / 100) - n(input.discountAmount);
    discountTotal = gross - discounted;
    salePrice = Math.max(0, discounted);
  }
  salePrice = applyRounding(salePrice, s.roundingMode);

  const taxAmount = (salePrice * taxPct) / 100;
  const marketplaceFee = mp ? (salePrice * n(mp.commissionPct)) / 100 + n(mp.fixedFee) : 0;
  const acquiringFee = (salePrice * acqPct) / 100;
  const revenue = salePrice + n(input.tips);
  const profit = revenue - totalCost;
  const netProfit = profit - taxAmount - marketplaceFee - acquiringFee;

  return {
    materialLines,
    gramsTotal,
    costMaterial,
    costElectricity,
    costPrinter,
    costDryer,
    costLabor,
    costWarehouse,
    costConsumables,
    costPostprocessing,
    costOther,
    costPackaging,
    costDelivery,
    costServices,
    totalCost,
    markupBase,
    recommendedPrice,
    discountTotal,
    salePrice,
    taxAmount,
    marketplaceFee,
    acquiringFee,
    revenue,
    profit,
    netProfit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    pctOfCost: totalCost > 0 ? (profit / totalCost) * 100 : 0,
    warnings,
  };
}
