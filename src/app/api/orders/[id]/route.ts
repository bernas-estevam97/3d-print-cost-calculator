import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { db } from "@/lib/db";
import { deleteOrder } from "@/lib/orders";
import { orderInclude } from "../route";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const order = await db.order.findFirst({
    where: { id, workshopId: auth.workshopId },
    include: { ...orderInclude, documents: true, dryer: true },
  });
  if (!order) throw notFound();
  return order;
});

const patch = z
  .object({
    name: z.string().trim().min(1),
    paid: z.boolean(),
    advanceReceived: z.coerce.number().min(0),
    advanceReceivedOn: z.boolean(),
    tips: z.coerce.number().min(0),
    tipsReceived: z.boolean(),
    trackingNumber: z.string(),
    notes: z.string(),
    dueDate: z.coerce.date().nullable(),
    clientId: z.string().nullable(),
    printerId: z.string().nullable(),
    assemblyQuantity: z.coerce.number().min(0),
    tags: z.array(z.string()).transform((t) => JSON.stringify(t)),
  })
  .partial();

export const PATCH = route<Ctx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const order = await db.order.findFirst({ where: { id, workshopId: auth.workshopId } });
  if (!order) throw notFound();
  const d = patch.parse(await req.json());
  const data: Record<string, unknown> = { ...d };
  if (d.tips !== undefined) {
    // tips are part of revenue (main doc 5.6)
    const revenue = order.salePrice + d.tips;
    const profit = revenue - order.totalCost;
    Object.assign(data, {
      revenue,
      profit,
      netProfit: profit - order.taxAmount - order.marketplaceFee - order.acquiringFee,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    });
  }
  return db.order.update({ where: { id }, data, include: orderInclude });
});

export const DELETE = route<Ctx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  await deleteOrder(auth.workshopId, id);
  return { ok: true };
});
