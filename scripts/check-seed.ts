// Prints the seeded numbers that main doc sections 11 and 12 use as acceptance checks.
import { db } from "../src/lib/db";
import { enrichPrinter, filamentsWithStock, printerStats } from "../src/lib/derive";

(async () => {
  const u = await db.user.findUniqueOrThrow({ where: { email: "demo@workshop.local" } });
  const ws = u.workshopId;
  const f = await filamentsWithStock(ws);
  const kg = f.reduce((a, x) => a + x.stockG, 0) / 1000;
  const worth = f.reduce((a, x) => a + (Math.max(0, x.stockG) / x.spoolWeightG) * x.spoolPrice, 0);
  console.log("stock kg", kg.toFixed(2), "spools", f.reduce((a, x) => a + x.spoolCount, 0), "worth", worth.toFixed(2));
  for (const x of f) console.log(" ", x.name.padEnd(36), x.stockG.toFixed(1), x.pricePerKg.toFixed(2), "lasts", x.lastsDays);
  const p = (await db.printer.findMany({ where: { workshopId: ws } }))[0];
  const e = enrichPrinter(p, await printerStats(ws));
  console.log("printer hours", e.hoursUsed.toFixed(2), "auto", e.hoursAuto.toFixed(2), "payback", e.paybackPct.toFixed(1), "due", e.maintenanceDue);
  const ch = await db.order.findFirstOrThrow({ where: { workshopId: ws, name: "Charmander na janela" } });
  console.log("charmander", {
    mat: ch.costMaterial.toFixed(2), el: ch.costElectricity.toFixed(2), pr: ch.costPrinter.toFixed(2),
    total: ch.totalCost.toFixed(2), rev: ch.revenue, profit: ch.profit.toFixed(2), margin: ch.marginPct.toFixed(1),
  });
})().finally(() => db.$disconnect());
