import { z } from "zod";
import { route } from "@/lib/api";
import { emptyCalc } from "@/lib/calc";
import { createOrder } from "@/lib/orders";

/** "Sell a service": an order without materials (main doc 6.2). */
export const POST = route(async (req, _ctx, auth) => {
  const d = z
    .object({ name: z.string().trim().min(1), price: z.coerce.number().min(0), cost: z.coerce.number().min(0).default(0), clientId: z.string().nullable().optional() })
    .parse(await req.json());
  const calc = {
    ...emptyCalc(),
    name: d.name,
    clientId: d.clientId ?? null,
    services: [{ name: d.name, cost: d.cost, mode: "fixed" as const, price: d.price }],
    priceMode: "price" as const,
    targetPrice: d.price,
    status: "confirmed" as const,
  };
  return createOrder(auth.workshopId, calc, { source: "service" });
});
