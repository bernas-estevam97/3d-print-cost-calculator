import { route } from "@/lib/api";
import { repeatOrder } from "@/lib/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx, auth) =>
  repeatOrder(auth.workshopId, (await ctx.params).id),
);
