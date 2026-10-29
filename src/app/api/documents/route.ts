import { z } from "zod";
import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { DOC_TYPES, nextNumber, totals, type DocType } from "@/lib/documents";

export const GET = route(async (_req, _ctx, auth) =>
  db.document.findMany({
    where: { workshopId: auth.workshopId },
    include: { client: { select: { name: true } }, order: { select: { id: true, name: true, number: true } } },
    orderBy: { createdAt: "desc" },
  }),
);

const schema = z.object({
  type: z.enum(Object.keys(DOC_TYPES) as [DocType, ...DocType[]]),
  clientId: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
  date: z.string().min(1),
  notes: z.string().default(""),
  items: z
    .array(z.object({ name: z.string().trim().min(1), qty: z.coerce.number().positive(), price: z.coerce.number().min(0), vatPct: z.coerce.number().min(0).max(100) }))
    .min(1, "Add at least one item"),
});

export const POST = route(async (req, _ctx, auth) => {
  const d = schema.parse(await req.json());
  const ws = auth.workshopId;
  // only link records of this workshop
  const clientId = d.clientId && (await db.client.findFirst({ where: { id: d.clientId, workshopId: ws } })) ? d.clientId : null;
  const orderId = d.orderId && (await db.order.findFirst({ where: { id: d.orderId, workshopId: ws } })) ? d.orderId : null;
  const number = await nextNumber(ws, d.type, new Date(d.date).getFullYear());
  return db.document.create({
    data: {
      workshopId: ws, type: d.type, number, clientId, orderId, amount: totals(d.items).total,
      data: JSON.stringify({ date: d.date, items: d.items, notes: d.notes }),
    },
  });
});
