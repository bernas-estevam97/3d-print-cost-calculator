// Order business rules (main doc 5.1, 5.2, 5.6, 5.8). Server only.
import type { Prisma } from "@/generated/prisma/client";
import { HttpError } from "./api";
import { computeCalc, pricingSettings, type CalcInput, type CalcRefs } from "./calc";
import { db, parseJson } from "./db";
import { filamentsWithStock } from "./derive";
import { CONSUMING, type StatusKey } from "./status";

export async function loadRefs(workshopId: string): Promise<CalcRefs> {
  const [settings, filaments, printers, dryers, shelfItems, finishedGoods, taxRegimes, marketplaceFees] = await Promise.all([
    db.settings.findUniqueOrThrow({ where: { workshopId } }),
    filamentsWithStock(workshopId),
    db.printer.findMany({ where: { workshopId } }),
    db.dryer.findMany({ where: { workshopId } }),
    db.shelfItem.findMany({ where: { workshopId } }),
    db.finishedGood.findMany({ where: { workshopId } }),
    db.taxRegime.findMany({ where: { workshopId } }),
    db.marketplaceFee.findMany({ where: { workshopId } }),
  ]);
  return { settings: pricingSettings(settings), filaments, printers, dryers, shelfItems, finishedGoods, taxRegimes, marketplaceFees };
}

const newNumber = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const newToken = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

/** Snapshot of every money field plus the materials, from a calculator input. */
function snapshot(calc: CalcInput, refs: CalcRefs) {
  const { result: r } = computeCalc(calc, refs);
  const fields = {
    name: calc.name.trim() || "Untitled",
    clientId: calc.clientId,
    printerId: calc.modelSource === "stock" ? null : calc.printerId,
    dryerId: calc.modelSource === "stock" ? null : calc.dryerId,
    modelId: calc.modelId,
    printTimeMin: calc.modelSource === "stock" ? 0 : calc.printH * 60 + calc.printMin,
    quantity: calc.quantity,
    costMaterial: r.costMaterial,
    costElectricity: r.costElectricity,
    costPrinter: r.costPrinter,
    costDryer: r.costDryer,
    costLabor: r.costLabor,
    costConsumables: r.costConsumables,
    costPostprocessing: r.costPostprocessing,
    costPackaging: r.costPackaging,
    costDelivery: r.costDelivery,
    costWarehouse: r.costWarehouse,
    costOther: r.costOther + r.costServices,
    totalCost: r.totalCost,
    discountPct: calc.discountPct,
    discountAmount: r.discountTotal,
    taxRegimeId: calc.taxRegimeId,
    taxAmount: r.taxAmount,
    marketplaceFeeId: calc.marketplaceFeeId,
    marketplaceFee: r.marketplaceFee,
    acquiringFee: r.acquiringFee,
    salePrice: r.salePrice,
    tips: calc.tips,
    revenue: r.revenue,
    profit: r.profit,
    netProfit: r.netProfit,
    marginPct: r.marginPct,
    calcInput: JSON.stringify(calc),
    slicerFileUrl: calc.slicerFileUrl,
  };
  // store the grams actually consumed (quantity and defect allowance applied)
  const materials = r.materialLines.map((l) => ({
    filamentId: l.filamentId ?? null,
    name: l.name,
    color: l.color ?? "",
    grams: l.gramsEffective,
    pricePerKg: l.pricePerKg,
  }));
  const services = calc.services
    .filter((s) => s.name || s.cost || s.price)
    .map((s) => ({ name: s.name || "Service", cost: s.cost, mode: s.mode, price: s.price }));
  return { fields, materials, services };
}

/** Shelf items used by the order are taken from the warehouse when it starts printing. */
async function moveShelfItems(tx: Prisma.TransactionClient, calc: CalcInput, sign: 1 | -1) {
  for (const w of calc.warehouseItems) {
    await tx.shelfItem.updateMany({ where: { id: w.shelfItemId }, data: { quantity: { increment: sign * w.qty } } });
  }
}

export async function createOrder(
  workshopId: string,
  calc: CalcInput,
  opts: { personalUse?: boolean; source?: string } = {},
) {
  const refs = await loadRefs(workshopId);
  const { fields, materials, services } = snapshot(calc, refs);
  const status = calc.status as StatusKey;
  const now = new Date().toISOString();
  const deduct = CONSUMING.includes(status);
  const stockSale = calc.modelSource === "stock" && calc.finishedGoodId;

  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        ...fields,
        workshopId,
        number: newNumber(),
        clientLinkToken: newToken(),
        status,
        statusDates: JSON.stringify({ [status]: now, ...(deduct && status !== "printing" ? { printing: now } : {}) }),
        materialDeducted: deduct,
        saleDate: calc.saleDate ? new Date(calc.saleDate) : new Date(),
        dueDate: calc.dueDate ? new Date(calc.dueDate) : null,
        tags: JSON.stringify(calc.tags),
        notes: calc.notes,
        personalUse: !!opts.personalUse,
        source: opts.source ?? (stockSale ? "stock" : "direct"),
        materials: { create: materials },
        services: { create: services },
      },
    });
    if (deduct) await moveShelfItems(tx, calc, -1);
    if (stockSale) {
      await tx.finishedGood.updateMany({
        where: { id: calc.finishedGoodId!, workshopId },
        data: { quantity: { decrement: calc.quantity } },
      });
    }
    return order;
  });
}

/**
 * Status transition with the material rule (main doc 5.2):
 * deduct once when reaching Printing or later; give back only on Cancelled.
 * Stock is derived from materialDeducted, so repeating a transition can never deduct twice.
 */
export async function setStatus(workshopId: string, id: string, status: StatusKey) {
  const order = await db.order.findFirst({ where: { id, workshopId } });
  if (!order) throw new HttpError(404, "Not found");
  const dates = parseJson<Record<string, string>>(order.statusDates, {});
  if (!dates[status]) dates[status] = new Date().toISOString();
  const calc = parseJson<CalcInput | null>(order.calcInput, null);

  let materialDeducted = order.materialDeducted;
  return db.$transaction(async (tx) => {
    if (!materialDeducted && CONSUMING.includes(status)) {
      materialDeducted = true;
      if (!dates.printing) dates.printing = dates[status];
      if (calc) await moveShelfItems(tx, calc, -1);
    } else if (materialDeducted && status === "cancelled") {
      materialDeducted = false;
      if (calc) await moveShelfItems(tx, calc, 1);
    }
    return tx.order.update({
      where: { id },
      data: { status, statusDates: JSON.stringify(dates), materialDeducted },
    });
  });
}

export async function deleteOrder(workshopId: string, id: string) {
  const order = await db.order.findFirst({ where: { id, workshopId } });
  if (!order) throw new HttpError(404, "Not found");
  const calc = parseJson<CalcInput | null>(order.calcInput, null);
  await db.$transaction(async (tx) => {
    // deleting the OrderMaterial rows returns filament automatically; shelf items need a refund
    if (order.materialDeducted && calc) await moveShelfItems(tx, calc, 1);
    await tx.order.delete({ where: { id } });
  });
}

/** Re-run the stored calculation with today's prices (main doc 5.6). */
export async function recalculate(workshopId: string, id: string) {
  const order = await db.order.findFirst({ where: { id, workshopId } });
  if (!order) throw new HttpError(404, "Not found");
  const calc = parseJson<CalcInput | null>(order.calcInput, null);
  if (!calc) throw new HttpError(400, "This order has no stored calculation");
  calc.tips = order.tips;
  const { fields, materials, services } = snapshot(calc, await loadRefs(workshopId));
  return db.order.update({
    where: { id },
    data: {
      ...fields,
      name: order.name,
      clientId: order.clientId,
      materials: { deleteMany: {}, create: materials },
      services: { deleteMany: {}, create: services },
    },
  });
}

/** Copy into a new Negotiation order; payment, tracking, due date and documents are not copied. */
export async function repeatOrder(workshopId: string, id: string) {
  const order = await db.order.findFirst({ where: { id, workshopId } });
  if (!order) throw new HttpError(404, "Not found");
  const calc = parseJson<CalcInput | null>(order.calcInput, null);
  if (!calc) throw new HttpError(400, "This order has no stored calculation");
  return createOrder(workshopId, {
    ...calc,
    name: order.name,
    clientId: order.clientId,
    status: "negotiation",
    saleDate: new Date().toISOString(),
    dueDate: "",
    tips: 0,
  });
}

/**
 * "Add service to order": adds the service's cost and sale price on top of the saved
 * snapshot without re-pricing anything else, and records it in the stored calculation
 * so a later Recalculate keeps it.
 */
export async function addService(workshopId: string, id: string, s: { name: string; cost: number; mode: "fixed" | "markup"; price: number }) {
  const order = await db.order.findFirst({ where: { id, workshopId } });
  if (!order) throw new HttpError(404, "Not found");
  const price = s.mode === "markup" ? s.cost * (1 + s.price / 100) : s.price;
  const calc = parseJson<CalcInput | null>(order.calcInput, null);
  if (calc) {
    calc.services = [...calc.services, s];
    // fixed-price orders: the typed price must grow by the service price too
    if (calc.priceMode === "price") calc.targetPrice += price;
  }
  const salePrice = order.salePrice + price;
  const totalCost = order.totalCost + s.cost;
  const revenue = salePrice + order.tips;
  const profit = revenue - totalCost;
  const ratio = order.salePrice > 0 ? salePrice / order.salePrice : 1;
  // tax and percentage fees scale with the price; fixed fees stay
  const taxAmount = order.taxAmount * ratio;
  const acquiringFee = order.acquiringFee * ratio;
  return db.order.update({
    where: { id },
    data: {
      salePrice, totalCost, revenue, profit, taxAmount, acquiringFee,
      costOther: order.costOther + s.cost,
      netProfit: profit - taxAmount - order.marketplaceFee - acquiringFee,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      calcInput: calc ? JSON.stringify(calc) : order.calcInput,
      services: { create: s },
    },
  });
}
