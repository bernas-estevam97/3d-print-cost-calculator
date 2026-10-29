import { z } from "zod";
import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { remove } from "@/lib/storage";

const s = z.string().trim();
const schema = z
  .object({
    companyName: s, taxId: s, address: s, phone: s, email: s, signer: s, signerTitle: s,
    bankName: s, bic: s, bankAccount: s, logoUrl: z.string().nullable(), signatureUrl: z.string().nullable(),
  })
  .partial();

export const GET = route(async (_req, _ctx, auth) =>
  db.companyDetails.upsert({ where: { workshopId: auth.workshopId }, update: {}, create: { workshopId: auth.workshopId } }),
);

export const PUT = route(async (req, _ctx, auth) => {
  const d = schema.parse(await req.json());
  const cur = await db.companyDetails.findUnique({ where: { workshopId: auth.workshopId } });
  if (cur && d.logoUrl !== undefined && d.logoUrl !== cur.logoUrl) await remove(auth.workshopId, cur.logoUrl);
  if (cur && d.signatureUrl !== undefined && d.signatureUrl !== cur.signatureUrl) await remove(auth.workshopId, cur.signatureUrl);
  return db.companyDetails.upsert({ where: { workshopId: auth.workshopId }, update: d, create: { ...d, workshopId: auth.workshopId } });
});
