import { HttpError, notFound, route } from "@/lib/api";
import { entity, listEntity, MAX_DRAFTS } from "@/lib/entities";

type Ctx = { params: Promise<{ entity: string }> };

export const GET = route<Ctx>(async (req, ctx, auth) => {
  const { entity: name } = await ctx.params;
  if (!entity(name)) throw notFound();
  return listEntity(name, auth.workshopId);
});

export const POST = route<Ctx>(async (req, ctx, auth) => {
  const { entity: name } = await ctx.params;
  const e = entity(name);
  if (!e) throw notFound();
  const parsed = e.schema.parse(await req.json()) as Record<string, unknown>;
  const data = e.toData ? await e.toData(parsed, auth.workshopId) : parsed;
  if (name === "drafts") {
    // keep only the newest MAX_DRAFTS (main doc 6.1)
    const old = await e.delegate.findMany({ where: { workshopId: auth.workshopId }, orderBy: { updatedAt: "desc" }, skip: MAX_DRAFTS - 1 });
    for (const d of old) await e.delegate.delete({ where: { id: d.id } });
  }
  const row = await e.delegate.create({ data: { ...data, workshopId: auth.workshopId }, include: e.include });
  if (e.afterCreate) await e.afterCreate(row, auth.workshopId).catch(() => {
    throw new HttpError(400, "Referenced item not found");
  });
  return e.enrich ? (await e.enrich([row], auth.workshopId))[0] : row;
});
