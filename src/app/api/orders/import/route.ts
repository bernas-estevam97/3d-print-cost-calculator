import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { bool, num } from "@/lib/csv";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { ORDER_FIELDS } from "@/lib/order-csv";
import { STATUS_KEYS } from "@/lib/status";

const TEXT = new Set(["number", "name", "status", "saleDate", "dueDate", "trackingNumber", "notes", "source"]);
const FLAGS = new Set(["paid", "advanceReceivedOn", "tipsReceived", "personalUse"]);
const material = z.object({ name: z.string(), color: z.string().catch(""), grams: z.coerce.number(), pricePerKg: z.coerce.number() });
const service = z.object({ name: z.string(), cost: z.coerce.number().catch(0), mode: z.enum(["fixed", "markup"]).catch("fixed"), price: z.coerce.number().catch(0) });
const date = (s: string) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null);

/**
 * Orders from the CSV the Orders page exports. They arrive as saved snapshots: no calculator input
 * (so they cannot be edited in the calculator) and materials are not linked to filaments, so stock is not touched.
 * Clients are matched by name and created when missing; printers are matched by name.
 */
export const POST = route(async (req, _ctx, auth) => {
  const { rows } = z.object({ rows: z.array(z.record(z.string(), z.string())).max(5000) }).parse(await req.json());
  const ws = auth.workshopId;
  const clients = await db.client.findMany({ where: { workshopId: ws }, select: { id: true, name: true } });
  const printers = await db.printer.findMany({ where: { workshopId: ws }, select: { id: true, model: true, internalName: true } });
  const byName = <T extends { name: string }>(list: T[], name: string) => list.find((x) => x.name.toLowerCase() === name.toLowerCase());

  let n = 0;
  await db.$transaction(async (tx) => {
    for (const [i, r] of rows.entries()) {
      if (!r.name) continue;
      const status = (STATUS_KEYS as readonly string[]).includes(r.status) ? r.status : "negotiation";
      const fields: Record<string, unknown> = {};
      for (const k of ORDER_FIELDS) {
        if (TEXT.has(k)) continue;
        fields[k] = FLAGS.has(k) ? bool(r[k]) : num(r[k], k === "quantity" || k === "assemblyQuantity" ? 1 : 0);
      }
      let client = r.client ? byName(clients, r.client) : undefined;
      if (r.client && !client) clients.push((client = await tx.client.create({ data: { workshopId: ws, name: r.client }, select: { id: true, name: true } })));
      const printer = r.printer ? printers.find((p) => [p.internalName, p.model].some((x) => x && x.toLowerCase() === r.printer.toLowerCase())) : undefined;
      const materials = z.array(material).safeParse(parseJson(r.materials ?? "", []));
      const services = z.array(service).safeParse(parseJson(r.services ?? "", []));
      if (!materials.success || !services.success) throw new HttpError(400, `Row ${i + 2}: materials or services are not valid JSON lists`);
      const saleDate = date(r.saleDate) ?? new Date();
      await tx.order.create({
        data: {
          ...fields,
          workshopId: ws,
          number: r.number || crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
          name: r.name,
          status,
          saleDate,
          dueDate: date(r.dueDate),
          trackingNumber: r.trackingNumber ?? "",
          notes: r.notes ?? "",
          source: r.source || "direct",
          tags: JSON.stringify(parseJson<string[]>(r.tags ?? "", [])),
          statusDates: JSON.stringify({ [status]: saleDate.toISOString() }),
          // counts as placed for analytics; no filament link, so stock does not move
          materialDeducted: status !== "cancelled",
          clientId: client?.id ?? null,
          printerId: printer?.id ?? null,
          materials: { create: materials.data },
          services: { create: services.data },
        },
      });
      n++;
    }
  }, { timeout: 60_000 });
  return { imported: n };
});
