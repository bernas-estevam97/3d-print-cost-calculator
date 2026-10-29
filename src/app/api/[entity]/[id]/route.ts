import { notFound, route } from "@/lib/api";
import { deleteFiles, entity } from "@/lib/entities";

type Ctx = { params: Promise<{ entity: string; id: string }> };

async function load(ctx: Ctx, workshopId: string) {
  const { entity: name, id } = await ctx.params;
  const e = entity(name);
  if (!e) throw notFound();
  // authorize by workshopId in the query itself (main doc section 9)
  const row = await e.delegate.findFirst({ where: { id, workshopId }, include: e.include });
  if (!row) throw notFound();
  return { e, row, id };
}

export const GET = route<Ctx>(async (_req, ctx, auth) => {
  const { e, row } = await load(ctx, auth.workshopId);
  return e.enrich ? (await e.enrich([row], auth.workshopId))[0] : row;
});

export const PATCH = route<Ctx>(async (req, ctx, auth) => {
  const { e, row, id } = await load(ctx, auth.workshopId);
  const body = (await req.json()) as Record<string, unknown>;
  const parsed = e.schema.partial().parse(body) as Record<string, unknown>;
  // zod 4 fills defaults even for omitted optional keys; only write what was sent
  const sent = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in body));
  const data = e.toData ? await e.toData(sent, auth.workshopId, id) : sent;
  for (const f of e.files ?? []) if (f in sent && sent[f] !== row[f]) await deleteFiles({ ...e, files: [f] }, auth.workshopId, row);
  const updated = await e.delegate.update({ where: { id }, data, include: e.include });
  return e.enrich ? (await e.enrich([updated], auth.workshopId))[0] : updated;
});

export const DELETE = route<Ctx>(async (_req, ctx, auth) => {
  const { e, row, id } = await load(ctx, auth.workshopId);
  await e.delegate.delete({ where: { id } });
  await deleteFiles(e, auth.workshopId, row);
  return { ok: true };
});
