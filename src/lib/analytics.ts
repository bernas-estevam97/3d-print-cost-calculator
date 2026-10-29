// Analytics and dashboard figures, main doc 5.11 and 5.12. Server only.
// Definitions (chosen so the seeded data reproduces main doc section 11):
// - Revenue / profit / net profit count PAID orders, by sale date (cash actually earned).
// - Personal-use and cancelled orders never count as sales.
import { db, parseJson } from "./db";
import { filamentsWithStock, printerStats, enrichPrinter } from "./derive";
import { IN_PROGRESS, STATUSES, STEPPER } from "./status";

const DAY = 86_400_000;
export const ORDER_CAP = 5000;

type O = Awaited<ReturnType<typeof loadOrders>>["orders"][number];

async function loadOrders(workshopId: string) {
  const orders = await db.order.findMany({
    where: { workshopId },
    include: { materials: true, client: { select: { id: true, name: true, category: { select: { name: true } } } }, printer: true },
    orderBy: { saleDate: "desc" },
    take: ORDER_CAP + 1,
  });
  return { orders: orders.slice(0, ORDER_CAP), capped: orders.length > ORDER_CAP };
}

const isSale = (o: O) => !o.personalUse && o.status !== "cancelled";
const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const lastMonths = (n: number, now = new Date()) =>
  Array.from({ length: n }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)));
const weekStart = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
};
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function money(orders: O[]) {
  const paid = orders.filter((o) => isSale(o) && o.paid);
  const revenue = sum(paid, (o) => o.revenue);
  const profit = sum(paid, (o) => o.profit);
  const netProfit = sum(paid, (o) => o.netProfit);
  return { revenue, profit, netProfit, margin: revenue > 0 ? (netProfit / revenue) * 100 : 0, count: paid.length };
}

export async function analytics(workshopId: string, from: Date, to: Date) {
  const { orders, capped } = await loadOrders(workshopId);
  const now = new Date();
  const period = orders.filter((o) => inRange(o.saleDate, from, to));
  const sales = period.filter(isSale);

  // ---------- overview ----------
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = orders.filter((o) => inRange(o.saleDate, today0, new Date(today0.getTime() + DAY)));
  const urgent = orders.filter((o) => o.dueDate && o.dueDate.getTime() - now.getTime() <= 72 * 3600_000 && !["done", "cancelled", "closed"].includes(o.status));
  const byModel = new Map<string, { name: string; orders: number; profit: number; hours: number }>();
  for (const o of sales) {
    const k = o.modelId ?? o.name.toLowerCase();
    const m = byModel.get(k) ?? { name: o.name, orders: 0, profit: 0, hours: 0 };
    m.orders++;
    m.profit += o.profit;
    m.hours += (o.printTimeMin * o.quantity) / 60;
    byModel.set(k, m);
  }
  const models = [...byModel.values()].map((m) => ({ ...m, profitPerHour: m.hours > 0 ? m.profit / m.hours : null }));
  const dynamics = lastMonths(12).map((k) => {
    const mo = money(orders.filter((o) => monthKey(o.saleDate) === k));
    return { month: k, revenue: mo.revenue, profit: mo.netProfit };
  });

  // ---------- finance ----------
  const paid = sales.filter((o) => o.paid);
  const unpaid = orders.filter((o) => isSale(o) && !o.paid);
  const costParts: [string, (o: O) => number][] = [
    ["Material", (o) => o.costMaterial], ["Electricity", (o) => o.costElectricity], ["Printer amortization", (o) => o.costPrinter],
    ["Consumables", (o) => o.costConsumables], ["Dryer amortization", (o) => o.costDryer], ["Packaging", (o) => o.costPackaging],
    ["Post-processing", (o) => o.costPostprocessing], ["Labor", (o) => o.costLabor], ["Delivery", (o) => o.costDelivery],
    ["Warehouse items", (o) => o.costWarehouse], ["Other and services", (o) => o.costOther],
  ];
  const totalCost = sum(sales, (o) => o.totalCost);
  const costStructure = costParts
    .map(([name, f]) => ({ name, value: sum(sales, f) }))
    .filter((c) => c.value > 0)
    .map((c) => ({ ...c, pct: totalCost > 0 ? (c.value / totalCost) * 100 : 0 }));
  const profitTrend = lastMonths(6).map((k) => ({ month: k, profit: money(orders.filter((o) => monthKey(o.saleDate) === k)).netProfit }));
  const byCategory = new Map<string, { revenue: number; paid: number; unpaid: number; cost: number; tax: number; marketplace: number; gross: number; net: number }>();
  for (const o of sales) {
    const k = o.client?.category?.name ?? "No category";
    const c = byCategory.get(k) ?? { revenue: 0, paid: 0, unpaid: 0, cost: 0, tax: 0, marketplace: 0, gross: 0, net: 0 };
    c.revenue += o.revenue;
    if (o.paid) c.paid += o.revenue;
    else c.unpaid += o.revenue;
    c.cost += o.totalCost;
    c.tax += o.taxAmount;
    c.marketplace += o.marketplaceFee;
    c.gross += o.profit;
    c.net += o.netProfit;
    byCategory.set(k, c);
  }

  // ---------- production ----------
  // order flow: days spent in each stepper status, from consecutive status dates
  const flow = STEPPER.slice(0, -1).map((st, i) => {
    const days: number[] = [];
    for (const o of orders) {
      const d = parseJson<Record<string, string>>(o.statusDates, {});
      const next = STEPPER.slice(i + 1).find((n) => d[n]);
      if (d[st] && next) days.push((new Date(d[next]).getTime() - new Date(d[st]).getTime()) / DAY);
    }
    return { status: STATUSES.find((s) => s.key === st)!.label, medianDays: median(days) };
  });
  const thisWeek = weekStart(now);
  const completedPerWeek = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(thisWeek.getTime() - (11 - i) * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const n = orders.filter((o) => {
      const done = parseJson<Record<string, string>>(o.statusDates, {}).done;
      return done && inRange(new Date(done), start, end);
    }).length;
    return { week: `${start.getDate()}.${start.getMonth() + 1}`, count: n };
  });
  const printed = orders.filter((o) => o.materialDeducted && !o.personalUse);
  const printMin = (since: Date) => sum(printed.filter((o) => o.saleDate >= since), (o) => o.printTimeMin * o.quantity);
  const materialG = sum(period.filter((o) => o.materialDeducted), (o) => sum(o.materials, (m) => m.grams));
  const energy = lastMonths(12).map((k) => {
    const mo = orders.filter((o) => monthKey(o.saleDate) === k);
    return { month: k, electricity: sum(mo, (o) => o.costElectricity), labor: sum(mo, (o) => o.costLabor) };
  });
  const matTotals = new Map<string, number>();
  const colorTotals = new Map<string, number>();
  for (const o of period.filter((x) => x.materialDeducted)) {
    for (const m of o.materials) {
      matTotals.set(m.name, (matTotals.get(m.name) ?? 0) + m.grams);
      if (m.color) colorTotals.set(m.color.toLowerCase(), (colorTotals.get(m.color.toLowerCase()) ?? 0) + m.grams);
    }
  }
  const top = (m: Map<string, number>, n = 8) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, grams]) => ({ name, grams }));
  const [printers, stats] = await Promise.all([db.printer.findMany({ where: { workshopId } }), printerStats(workshopId)]);
  const printerRows = printers.map((p) => {
    const e = enrichPrinter(p, stats);
    const mine = sales.filter((o) => o.printerId === p.id);
    return {
      name: p.internalName || p.model, paybackPct: e.paybackPct, earned: e.earned, price: p.price,
      cost: sum(mine, (o) => o.costElectricity + o.costPrinter), electricity: sum(mine, (o) => o.costElectricity), amortization: sum(mine, (o) => o.costPrinter),
    };
  });

  // ---------- customers ----------
  const filaments = await filamentsWithStock(workshopId);
  const goods = await db.finishedGood.findMany({ where: { workshopId } });
  const channels = new Map<string, { orders: number; revenue: number }>();
  const clients = new Map<string, { name: string; orders: number; total: number }>();
  for (const o of sales) {
    const ch = channels.get(o.source) ?? { orders: 0, revenue: 0 };
    ch.orders++;
    ch.revenue += o.revenue;
    channels.set(o.source, ch);
    if (o.client) {
      const c = clients.get(o.client.id) ?? { name: o.client.name, orders: 0, total: 0 };
      c.orders++;
      c.total += o.revenue;
      clients.set(o.client.id, c);
    }
  }
  const funnel = STATUSES.map((s) => {
    const xs = period.filter((o) => o.status === s.key && !o.personalUse);
    return { key: s.key, status: s.label, count: xs.length, amount: sum(xs, (o) => o.salePrice) };
  });

  return {
    capped,
    orderCount: period.filter((o) => !o.personalUse).length,
    overview: {
      today: {
        profit: money(today).netProfit,
        printMin: sum(today.filter((o) => !o.personalUse), (o) => o.printTimeMin * o.quantity),
        urgent: urgent.length,
      },
      ...money(period),
      dynamics,
      topModels: [...models].sort((a, b) => b.profit - a.profit).slice(0, 5),
      lossModels: models.filter((m) => m.profit < 0).sort((a, b) => a.profit - b.profit),
    },
    finance: {
      paidSales: { count: paid.length, amount: sum(paid, (o) => o.revenue) },
      totalCost,
      receivable: sum(unpaid, (o) => o.revenue - (o.advanceReceivedOn ? o.advanceReceived : 0)),
      costStructure,
      profitTrend,
      recent: period.slice(0, 6).map((o) => ({ id: o.id, name: o.name, date: o.saleDate, price: o.salePrice, profit: o.profit, paid: o.paid })),
      byCategory: [...byCategory.entries()].map(([name, v]) => ({ name, ...v })),
    },
    production: {
      flow,
      completedPerWeek,
      printTime: { week: printMin(new Date(now.getTime() - 7 * DAY)), month: printMin(new Date(now.getTime() - 30 * DAY)), year: printMin(new Date(now.getTime() - 365 * DAY)) },
      materialG,
      energy,
      topMaterials: top(matTotals),
      topColors: top(colorTotals),
      printers: printerRows,
    },
    customers: {
      tiedFilament: sum(filaments, (f) => (Math.max(0, f.stockG) / f.spoolWeightG) * f.spoolPrice),
      tiedFinished: sum(goods, (g) => g.quantity * g.unitCost),
      channels: [...channels.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.revenue - a.revenue),
      topClients: [...clients.values()].sort((a, b) => b.total - a.total).slice(0, 8),
      funnel,
    },
  };
}

export async function dashboard(workshopId: string, range: "week" | "month") {
  const { orders } = await loadOrders(workshopId);
  const now = new Date();
  const days = range === "week" ? 7 : 30;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const start = new Date(end.getTime() - days * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);
  const cur = money(orders.filter((o) => inRange(o.saleDate, start, end)));
  const prev = money(orders.filter((o) => inRange(o.saleDate, prevStart, start)));
  const change = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

  // mini bars: last 7 days (week) or last 12 weeks (month)
  const buckets = range === "week"
    ? Array.from({ length: 7 }, (_, i) => ({ start: new Date(end.getTime() - (7 - i) * DAY), len: DAY }))
    : Array.from({ length: 12 }, (_, i) => ({ start: new Date(end.getTime() - (12 - i) * 7 * DAY), len: 7 * DAY }));
  const series = buckets.map((b) => {
    const xs = orders.filter((o) => inRange(o.saleDate, b.start, new Date(b.start.getTime() + b.len)));
    const mo = money(xs);
    return { revenue: mo.revenue, profit: mo.profit, inProgress: xs.filter((o) => IN_PROGRESS.includes(o.status as never)).length };
  });

  const last30 = orders.filter((o) => o.saleDate >= new Date(now.getTime() - 30 * DAY) && !o.personalUse);
  const weekday = Array.from({ length: 7 }, (_, i) => ({ day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], orders: 0, clients: 0 }));
  const clientRows = await db.client.findMany({ where: { workshopId }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  for (const o of last30) weekday[(o.saleDate.getDay() + 6) % 7].orders++;
  for (const c of clientRows.filter((c) => c.createdAt >= new Date(now.getTime() - 30 * DAY))) weekday[(c.createdAt.getDay() + 6) % 7].clients++;

  const matTotals = new Map<string, { grams: number; color: string }>();
  for (const o of last30.filter((x) => x.materialDeducted)) {
    for (const m of o.materials) {
      const t = matTotals.get(m.name) ?? { grams: 0, color: m.color };
      t.grams += m.grams;
      matTotals.set(m.name, t);
    }
  }
  const filaments = await filamentsWithStock(workshopId);
  const events = [
    ...orders.slice(0, 5).map((o) => ({ kind: "order", text: `New order ${o.name}`, date: o.saleDate, href: `/en/orders/${o.id}` })),
    ...clientRows.slice(0, 5).map((c) => ({ kind: "client", text: `New client ${c.name}`, date: c.createdAt, href: `/en/clients/${c.id}` })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  const todos = await db.calendarEvent.findMany({ where: { workshopId, type: "todo", done: false }, orderBy: { date: "asc" }, take: 5 });

  return {
    inProgress: orders.filter((o) => IN_PROGRESS.includes(o.status as never) && !o.personalUse).length,
    revenue: { value: cur.revenue, change: change(cur.revenue, prev.revenue) },
    profit: { value: cur.profit, change: change(cur.profit, prev.profit) },
    clients: clientRows.length,
    series,
    activePrinters: orders.filter((o) => o.status === "printing" && o.printer).map((o) => ({ printer: o.printer!.internalName || o.printer!.model, order: o.name, id: o.id })),
    funnel: STATUSES.slice(0, 8).map((s) => ({ status: s.label, key: s.key, count: last30.filter((o) => o.status === s.key).length })),
    topMaterials: { total: sum([...matTotals.values()], (m) => m.grams), items: [...matTotals.entries()].sort((a, b) => b[1].grams - a[1].grams).slice(0, 5).map(([name, v]) => ({ name, ...v })) },
    weekday,
    events,
    todos,
    restock: filaments.filter((f) => f.lastsDays != null && f.lastsDays <= 14).sort((a, b) => a.lastsDays! - b.lastsDays!).map((f) => ({ id: f.id, name: f.name, lastsDays: f.lastsDays, color: f.colors[0] })),
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof analytics>>;
