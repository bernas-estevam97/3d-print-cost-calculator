// Derived values computed from orders (main doc 5.7, 5.9, 5.10). Server only.
import { db, parseJson } from "./db";
import { CONSUMING } from "./status";

const DAY = 86_400_000;

/** Grams deducted from each filament by orders, and grams used in the last 30/90 days. */
export async function filamentUsage(workshopId: string) {
  const rows = await db.orderMaterial.findMany({
    where: { filamentId: { not: null }, order: { workshopId, materialDeducted: true } },
    select: { filamentId: true, grams: true, order: { select: { saleDate: true, statusDates: true } } },
  });
  const now = Date.now();
  const usage = new Map<string, { consumed: number; last30: number; last90: number }>();
  for (const r of rows) {
    const u = usage.get(r.filamentId!) ?? { consumed: 0, last30: 0, last90: 0 };
    // when it was printed; fall back to the sale date for orders without status history
    const printed = parseJson<Record<string, string>>(r.order.statusDates, {}).printing;
    const age = now - new Date(printed ?? r.order.saleDate).getTime();
    u.consumed += r.grams;
    if (age <= 30 * DAY) u.last30 += r.grams;
    if (age <= 90 * DAY) u.last90 += r.grams;
    usage.set(r.filamentId!, u);
  }
  return usage;
}

type FilamentLike = { id: string; spoolCount: number; spoolWeightG: number; usedFromSpoolG: number; spoolPrice: number; colors: string };

export function enrichFilament<F extends FilamentLike>(f: F, usage: Map<string, { consumed: number; last30: number; last90: number }>) {
  const u = usage.get(f.id) ?? { consumed: 0, last30: 0, last90: 0 };
  const stockG = f.spoolCount * f.spoolWeightG - f.usedFromSpoolG - u.consumed;
  const avgDaily = u.last30 > 0 ? u.last30 / 30 : u.last90 / 90;
  return {
    ...f,
    colors: parseJson<string[]>(f.colors, []),
    pricePerKg: f.spoolWeightG > 0 ? (f.spoolPrice / f.spoolWeightG) * 1000 : 0,
    stockG,
    lastsDays: avgDaily > 0 ? Math.max(0, Math.floor(stockG / avgDaily)) : null,
  };
}

export async function filamentsWithStock(workshopId: string) {
  const [list, usage] = await Promise.all([
    db.filament.findMany({ where: { workshopId }, orderBy: { name: "asc" } }),
    filamentUsage(workshopId),
  ]);
  return list.map((f) => enrichFilament(f, usage));
}

/** Printer hours (auto from orders + manual + initial), payback and maintenance status. */
export async function printerStats(workshopId: string) {
  const orders = await db.order.findMany({
    where: { workshopId, printerId: { not: null }, status: { in: CONSUMING } },
    select: { printerId: true, printTimeMin: true, quantity: true, netProfit: true, saleDate: true },
  });
  const now = Date.now();
  const stats = new Map<string, { autoH: number; earned: number; last30Earned: number }>();
  for (const o of orders) {
    const s = stats.get(o.printerId!) ?? { autoH: 0, earned: 0, last30Earned: 0 };
    s.autoH += (o.printTimeMin * o.quantity) / 60;
    // payback counts money actually kept: net of tax and fees
    s.earned += o.netProfit;
    if (now - o.saleDate.getTime() <= 30 * DAY) s.last30Earned += o.netProfit;
    stats.set(o.printerId!, s);
  }
  return stats;
}

type PrinterLike = {
  id: string; price: number; lifetimeH: number; hoursManual: number; initialHours: number;
  maintenanceIntervalHours: number | null; maintenanceIntervalDays: number | null;
  lastMaintenanceAt: Date | null; lastMaintenanceHours: number; createdAt: Date;
};

export function enrichPrinter<P extends PrinterLike>(p: P, stats: Map<string, { autoH: number; earned: number; last30Earned: number }>) {
  const s = stats.get(p.id) ?? { autoH: 0, earned: 0, last30Earned: 0 };
  const hoursUsed = s.autoH + p.hoursManual + p.initialHours;
  const sinceH = hoursUsed - p.lastMaintenanceHours;
  const since = p.lastMaintenanceAt ?? p.createdAt;
  const maintenanceDue =
    (p.maintenanceIntervalHours != null && p.maintenanceIntervalHours > 0 && sinceH >= p.maintenanceIntervalHours) ||
    (p.maintenanceIntervalDays != null && p.maintenanceIntervalDays > 0 && Date.now() - since.getTime() >= p.maintenanceIntervalDays * DAY);
  return {
    ...p,
    hoursAuto: s.autoH,
    hoursUsed,
    earned: s.earned,
    last30Earned: s.last30Earned,
    paybackPct: p.price > 0 ? (s.earned / p.price) * 100 : 0,
    hourCost: p.lifetimeH > 0 ? p.price / p.lifetimeH : 0,
    maintenanceDue,
  };
}

/** Client level labels, main doc 5.7 [DECISION]. */
export function clientLevel(ordersCount: number) {
  if (ordersCount >= 15) return "Pro";
  if (ordersCount >= 5) return "Regular";
  return "Beginner";
}

export async function clientStats(workshopId: string) {
  const orders = await db.order.findMany({
    where: { workshopId, clientId: { not: null }, personalUse: false, status: { not: "cancelled" } },
    select: { clientId: true, status: true, salePrice: true },
  });
  const m = new Map<string, { ordersCount: number; completedAmount: number }>();
  for (const o of orders) {
    const s = m.get(o.clientId!) ?? { ordersCount: 0, completedAmount: 0 };
    s.ordersCount++;
    if (o.status === "done") s.completedAmount += o.salePrice;
    m.set(o.clientId!, s);
  }
  return m;
}
