import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { listEntity } from "@/lib/entities";
import { loadRefs } from "@/lib/orders";

/** Everything the calculator form needs, in one request. */
export const GET = route(async (_req, _ctx, auth) => {
  const ws = auth.workshopId;
  const [refs, clients, models, loyaltyTiers, settings] = await Promise.all([
    loadRefs(ws),
    listEntity("clients", ws),
    listEntity("models", ws),
    db.loyaltyTier.findMany({ where: { workshopId: ws }, orderBy: { minOrders: "asc" } }),
    db.settings.findUniqueOrThrow({ where: { workshopId: ws } }),
  ]);
  return { ...refs, clients, models, loyaltyTiers, rawSettings: settings };
});
