import { describe, expect, it } from "vitest";
import { compute, defaultPricingSettings, round2, type PricingInput } from "./pricing";

const base = (over: Partial<PricingInput>): PricingInput => ({
  quantity: 1,
  materials: [],
  printTimeH: 0,
  printer: null,
  dryer: null,
  laborHours: { operator: 0, modeling: 0, painting: 0 },
  warehouseItems: [],
  consumables: 0,
  postProcessing: 0,
  printFileCost: 0,
  packaging: 0,
  delivery: 0,
  services: [],
  priceMode: "auto",
  markupPct: 30,
  targetPrice: 0,
  targetProfit: 0,
  complexity: "none",
  marketingPct: 0,
  discountPct: 0,
  discountAmount: 0,
  taxRatePct: null,
  marketplace: null,
  tips: 0,
  settings: {
    ...defaultPricingSettings,
    markupBase: {
      material: true,
      labor: false,
      warehouse: false,
      packagingDelivery: false,
      electricity: false,
      amortization: false,
      consumables: false,
    },
  },
  ...over,
});

describe("main doc 5.3.1 fixtures", () => {
  it('draft "Penny Wise": material only, 30% markup', () => {
    const r = compute(
      base({
        materials: [
          { name: "Gray", grams: 28, pricePerKg: 13.43 },
          { name: "Jade White", grams: 19, pricePerKg: 13.43 },
          { name: "Cocoa Brown", grams: 18, pricePerKg: 13.43 },
          { name: "Preto Lab Professional", grams: 7, pricePerKg: 15 },
        ],
      }),
    );
    expect(r.materialLines.map((l) => round2(l.cost))).toEqual([0.38, 0.26, 0.24, 0.11]);
    expect(round2(r.costMaterial)).toBe(0.98);
    expect(round2(r.salePrice)).toBe(1.27);
    expect(round2(r.profit)).toBe(0.29);
    expect(r.marginPct.toFixed(1)).toBe("23.1");
  });

  it('order "Charmander na janela": 11 h 40 min on a 200 W printer', () => {
    const r = compute(
      base({
        materials: [
          { name: "PLA Basic", grams: 145, pricePerKg: 13.43 },
          { name: "Preto Lab Professional", grams: 12, pricePerKg: 15 },
        ],
        printTimeH: 11 + 40 / 60,
        printer: { powerW: 200, price: 150, lifetimeH: 10000 },
        settings: { ...defaultPricingSettings, electricityTariff: 0.17 },
        priceMode: "price",
        targetPrice: 14,
        tips: 2,
      }),
    );
    expect(r.gramsTotal).toBe(157);
    expect(round2(r.costElectricity)).toBe(0.4);
    expect(round2(r.costPrinter)).toBe(0.18);
    expect(round2(r.costMaterial)).toBe(2.13);
    expect(round2(r.totalCost)).toBe(2.7);
    expect(round2(r.salePrice)).toBe(14);
    expect(round2(r.revenue)).toBe(16);
    expect(round2(r.profit)).toBe(13.3);
    expect(r.marginPct.toFixed(1)).toBe("83.1");
  });
});

describe("rules", () => {
  const mat = [{ name: "PLA", grams: 100, pricePerKg: 20 }]; // 2.00

  it("no printer: zero electricity and amortization, plus a warning", () => {
    const r = compute(base({ materials: mat, printTimeH: 5 }));
    expect(r.costElectricity).toBe(0);
    expect(r.costPrinter).toBe(0);
    expect(r.warnings).toContain("noPrinter");
  });

  it("electricity disabled zeroes electricity only", () => {
    const r = compute(
      base({
        printTimeH: 10,
        printer: { powerW: 1000, price: 100, lifetimeH: 100 },
        settings: { ...defaultPricingSettings, electricityEnabled: false },
      }),
    );
    expect(r.costElectricity).toBe(0);
    expect(r.costPrinter).toBe(10);
  });

  it("defect allowance inflates grams", () => {
    const r = compute(
      base({ materials: mat, settings: { ...defaultPricingSettings, defectAllowancePct: 10 } }),
    );
    expect(round2(r.costMaterial)).toBe(2.2);
  });

  it("quantity scales material and time costs, not packaging", () => {
    const r = compute(base({ materials: mat, quantity: 3, packaging: 1 }));
    expect(round2(r.costMaterial)).toBe(6);
    expect(r.costPackaging).toBe(1);
  });

  it("items outside the markup base are passed through at cost", () => {
    // material 2 marked up 30% -> 2.6, packaging 1 at cost
    const r = compute(base({ materials: mat, packaging: 1 }));
    expect(round2(r.salePrice)).toBe(3.6);
  });

  it("complexity and marketing multiply the recommended price", () => {
    const r = compute(
      base({
        materials: mat,
        complexity: "simple",
        marketingPct: 10,
        settings: {
          ...defaultPricingSettings,
          markupBase: { ...defaultPricingSettings.markupBase },
          complexitySimplePct: 50,
        },
      }),
    );
    expect(round2(r.salePrice)).toBe(round2(2.6 * 1.5 * 1.1));
  });

  it("discount applies after the price", () => {
    const r = compute(base({ materials: mat, discountPct: 50, discountAmount: 0.3 }));
    expect(round2(r.salePrice)).toBe(1);
  });

  it("profit mode derives the price", () => {
    const r = compute(base({ materials: mat, priceMode: "profit", targetProfit: 5 }));
    expect(r.salePrice).toBe(7);
    expect(r.profit).toBe(5);
  });

  it("taxes are added on top in auto mode and deducted from net profit", () => {
    const r = compute(base({ materials: mat, taxRatePct: 10 }));
    expect(round2(r.salePrice)).toBe(2.86);
    expect(round2(r.taxAmount)).toBe(0.29);
    expect(round2(r.netProfit)).toBe(round2(r.profit - r.taxAmount));
  });

  it("taxes toggled off are neither added nor deducted", () => {
    const r = compute(
      base({
        materials: mat,
        taxRatePct: 10,
        settings: { ...defaultPricingSettings, markupBase: base({}).settings.markupBase, deductTaxes: false },
      }),
    );
    expect(round2(r.salePrice)).toBe(2.6);
    expect(r.taxAmount).toBe(0);
  });

  it("marketplace fee is percent plus fixed", () => {
    const r = compute(
      base({ materials: mat, priceMode: "price", targetPrice: 10, marketplace: { commissionPct: 10, fixedFee: 0.5 } }),
    );
    expect(r.marketplaceFee).toBe(1.5);
    expect(r.netProfit).toBe(10 - 2 - 1.5);
  });

  it.each([
    ["nearest_1", 2.6, 3],
    ["up_1", 2.1, 3],
    ["nearest_5", 7.4, 5],
    ["up_5", 5.01, 10],
    ["up_10", 11, 20],
    ["up_1", 3, 3],
  ] as const)("rounding %s: %d -> %d", (mode, price, expected) => {
    const r = compute(
      base({
        priceMode: "price",
        targetPrice: price,
        settings: { ...defaultPricingSettings, roundingMode: mode },
      }),
    );
    expect(r.salePrice).toBe(expected);
  });

  it("services add cost and their own sale price", () => {
    const r = compute(
      base({
        materials: mat,
        services: [
          { name: "Painting", cost: 2, mode: "fixed", price: 5 },
          { name: "Design", cost: 10, mode: "markup", price: 50 },
        ],
      }),
    );
    expect(r.costServices).toBe(12);
    expect(round2(r.totalCost)).toBe(14);
    expect(round2(r.salePrice)).toBe(round2(2.6 + 5 + 15));
  });

  it("empty markup base warns", () => {
    const r = compute(base({ packaging: 1 }));
    expect(r.warnings).toContain("emptyMarkupBase");
  });

  it("labor uses settings rates", () => {
    const r = compute(
      base({
        laborHours: { operator: 2, modeling: 1, painting: 0 },
        settings: { ...defaultPricingSettings, operatorRate: 10, modelingRate: 20 },
      }),
    );
    expect(r.costLabor).toBe(40);
  });
});
