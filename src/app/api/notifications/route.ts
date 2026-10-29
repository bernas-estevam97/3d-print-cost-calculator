import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { enrichPrinter, filamentsWithStock, printerStats } from "@/lib/derive";

/** In-app notifications only, no email (local guide section 11). Computed on request, no scheduler. */
export const GET = route(async (_req, _ctx, auth) => {
  const ws = auth.workshopId;
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
  const out: { kind: string; text: string; href: string }[] = [];
  if (user.notifyLowFilament) {
    for (const f of await filamentsWithStock(ws)) {
      const low = (f.lowStockThresholdG != null && f.stockG <= f.lowStockThresholdG) || (f.lastsDays != null && f.lastsDays <= 14);
      if (low) out.push({ kind: "filament", text: `Low stock: ${f.name} (${Math.round(f.stockG)} g${f.lastsDays != null ? `, lasts ~${f.lastsDays} d` : ""})`, href: "/en/filaments" });
    }
  }
  if (user.notifyOverdue) {
    const overdue = await db.order.findMany({
      where: { workshopId: ws, dueDate: { lt: new Date() }, status: { notIn: ["done", "cancelled", "closed"] } },
      select: { id: true, name: true },
    });
    for (const o of overdue) out.push({ kind: "order", text: `Overdue: ${o.name}`, href: `/en/orders/${o.id}` });
  }
  const stats = await printerStats(ws);
  for (const p of await db.printer.findMany({ where: { workshopId: ws } })) {
    if (enrichPrinter(p, stats).maintenanceDue) out.push({ kind: "maintenance", text: `Maintenance needed: ${p.internalName || p.model}`, href: `/en/printers/${p.id}` });
  }
  return out;
});
