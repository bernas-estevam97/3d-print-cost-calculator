import { z } from "zod";
import { route } from "@/lib/api";
import { deleteOrder, setStatus } from "@/lib/orders";
import { STATUS_KEYS } from "@/lib/status";

export const POST = route(async (req, _ctx, auth) => {
  const d = z
    .object({ ids: z.array(z.string()).min(1), action: z.enum(["delete", "status"]), status: z.enum(STATUS_KEYS).optional() })
    .parse(await req.json());
  for (const id of d.ids) {
    if (d.action === "delete") await deleteOrder(auth.workshopId, id);
    else if (d.status) await setStatus(auth.workshopId, id, d.status);
  }
  return { ok: true, count: d.ids.length };
});
