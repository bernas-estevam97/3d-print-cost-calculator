import { z } from "zod";
import { route } from "@/lib/api";
import { addService } from "@/lib/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx, auth) => {
  const s = z
    .object({ name: z.string().trim().min(1), cost: z.coerce.number().min(0), mode: z.enum(["fixed", "markup"]), price: z.coerce.number().min(0) })
    .parse(await req.json());
  return addService(auth.workshopId, (await ctx.params).id, s);
});
