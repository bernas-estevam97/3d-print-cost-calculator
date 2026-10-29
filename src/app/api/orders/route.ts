import { z } from "zod";
import { route } from "@/lib/api";
import { calcSchema } from "@/lib/calc";
import { db } from "@/lib/db";
import { createOrder } from "@/lib/orders";

export const orderInclude = {
  client: { select: { id: true, name: true } },
  printer: { select: { id: true, model: true, internalName: true } },
  materials: true,
  services: true,
} as const;

export const GET = route(async (_req, _ctx, auth) => {
  // ponytail: capped at 5000 orders (main doc section 9); paginate if a workshop ever gets there
  return db.order.findMany({
    where: { workshopId: auth.workshopId },
    include: orderInclude,
    orderBy: { saleDate: "desc" },
    take: 5000,
  });
});

/** Save order from the calculator. personalUse = "Write off for personal use" (main doc 5.8). */
export const POST = route(async (req, _ctx, auth) => {
  const body = z.object({ calc: calcSchema, personalUse: z.boolean().optional() }).parse(await req.json());
  const calc = body.calc;
  // "Include labor" only applies to the personal-use write-off
  if (!body.personalUse) calc.includeLabor = true;
  if (body.personalUse) {
    // written off at cost: no markup, no deductions
    Object.assign(calc, { priceMode: "price", targetPrice: 0, tips: 0, clientId: null, status: "done" });
  }
  const order = await createOrder(auth.workshopId, calc, { personalUse: body.personalUse });
  if (body.personalUse) {
    await db.order.update({
      where: { id: order.id },
      data: { salePrice: order.totalCost, revenue: order.totalCost, profit: 0, netProfit: 0, marginPct: 0 },
    });
  }
  return order;
});
