import { notFound, publicRoute } from "@/lib/api";
import { db } from "@/lib/db";

/** Read-only client view: status and quote, no internal costs (main doc 6.3). */
export const GET = publicRoute<{ params: Promise<{ token: string }> }>(async (_req, ctx) => {
  const { token } = await ctx.params;
  const o = await db.order.findUnique({
    where: { clientLinkToken: token },
    select: {
      number: true, name: true, status: true, statusDates: true, quantity: true, salePrice: true, dueDate: true,
      saleDate: true, trackingNumber: true, paid: true,
      workshop: { select: { name: true, settings: { select: { currency: true } } } },
    },
  });
  if (!o) throw notFound();
  return o;
});
