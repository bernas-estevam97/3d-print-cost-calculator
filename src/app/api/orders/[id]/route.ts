import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { db } from "@/lib/db";
import { calcSchema } from "@/lib/calc";
import { deleteOrder, updateOrder, withPhotos } from "@/lib/orders";
import { payment, tipOf } from "@/lib/payment";
import { orderInclude } from "../route";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const order = await db.order.findFirst({
    where: { id, workshopId: auth.workshopId },
    include: { ...orderInclude, documents: true, dryer: true },
  });
  if (!order) throw notFound();
  return (await withPhotos(auth.workshopId, [order]))[0];
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
  const next = { ...order, ...d, tags: order.tags };
  if (d.tips !== undefined || d.tipsReceived !== undefined) {
    // the tip is part of revenue while it is switched on (main doc 5.6); amounts replace, never add up
    const revenue = order.salePrice + tipOf(next);
    const profit = revenue - order.totalCost;
    Object.assign(data, {
      revenue,
      profit,
      netProfit: profit - order.taxAmount - order.marketplaceFee - order.acquiringFee,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    });
  }
  // an advance that covers everything due makes the order paid
  if (!next.paid && next.advanceReceivedOn && payment(next).status === "paid") data.paid = true;
  return db.order.update({ where: { id }, data, include: orderInclude });
});

export const DELETE = route<Ctx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  await deleteOrder(auth.workshopId, id);
  return { ok: true };
});

/** Save an order edited in the calculator. */
export const PUT = route<Ctx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const { calc } = z.object({ calc: calcSchema }).parse(await req.json());
  calc.includeLabor = true;
  return updateOrder(auth.workshopId, id, calc);
});
