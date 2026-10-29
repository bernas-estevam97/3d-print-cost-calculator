import { notFound, route } from "@/lib/api";
import { db } from "@/lib/db";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const { count } = await db.document.deleteMany({ where: { id, workshopId: auth.workshopId } });
  if (!count) throw notFound();
  return { ok: true };
});
