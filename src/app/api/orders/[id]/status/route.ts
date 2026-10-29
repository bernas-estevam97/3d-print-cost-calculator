import { z } from "zod";
import { route } from "@/lib/api";
import { setStatus } from "@/lib/orders";
import { STATUS_KEYS } from "@/lib/status";

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const { status } = z.object({ status: z.enum(STATUS_KEYS) }).parse(await req.json());
  return setStatus(auth.workshopId, id, status);
});
