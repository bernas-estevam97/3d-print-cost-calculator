import { route } from "@/lib/api";
import { recalculate } from "@/lib/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx, auth) =>
  recalculate(auth.workshopId, (await ctx.params).id),
);
