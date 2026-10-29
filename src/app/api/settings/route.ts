import { z } from "zod";
import { route } from "@/lib/api";
import { db } from "@/lib/db";

const b = z.boolean();
const n = z.coerce.number().min(0);
const schema = z
  .object({
    printTechnology: z.enum(["FDM", "SLA", "BOTH"]),
    electricityEnabled: b,
    electricityMode: z.enum(["single", "day_night"]),
    electricityTariff: n,
    operatorRate: n,
    modelingRate: n,
    paintingRate: n,
    defaultMarkupPct: n,
    mbMaterial: b, mbLabor: b, mbWarehouse: b, mbPackagingDelivery: b, mbElectricity: b, mbAmortization: b, mbConsumables: b,
    deductTaxes: b, deductMarketplace: b, deductAcquiring: b,
    acquiringPct: n,
    complexitySimplePct: n, complexityMediumPct: n, complexityComplexPct: n,
    defectAllowancePct: n,
    roundingMode: z.enum(["none", "nearest_1", "up_1", "nearest_5", "up_5", "up_10"]),
    currency: z.string().min(3).max(3),
    theme: z.enum(["light", "dark", "system"]),
    accent: z.enum(["orange", "blue", "red", "slate", "green", "purple"]),
    defaultTaxRegimeId: z.string().nullable(),
  })
  .partial();

export const GET = route(async (_req, _ctx, auth) => db.settings.findUniqueOrThrow({ where: { workshopId: auth.workshopId } }));

export const PUT = route(async (req, _ctx, auth) =>
  db.settings.update({ where: { workshopId: auth.workshopId }, data: schema.parse(await req.json()) }),
);
