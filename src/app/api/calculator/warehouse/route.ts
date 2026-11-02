import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { calcSchema, computeCalc } from "@/lib/calc";
import { db } from "@/lib/db";
import { loadRefs, moveShelfItems } from "@/lib/orders";

/**
 * "Save to warehouse": create or top up a finished good (main doc 5.8).
 * Producing it uses its filament and stock items (accessories) now, so selling it later
 * from Finished models takes only the finished good and never deducts them twice.
 */
export const POST = route(async (req, _ctx, auth) => {
  const { calc } = z.object({ calc: calcSchema }).parse(await req.json());
  calc.includeLabor = true;
  const ws = auth.workshopId;
  const shelf = await db.warehouseShelf.findFirst({ where: { workshopId: ws, kind: "finished" } });
  if (!shelf) throw new HttpError(400, "No Finished models shelf");
  const { result } = computeCalc(calc, await loadRefs(ws));
  const q = Math.max(1, calc.quantity);
  const unitCost = result.totalCost / q;
  const unitPrice = result.salePrice / q;
  const name = calc.name.trim() || "Untitled model";
  const existing = await db.finishedGood.findFirst({
    where: { workshopId: ws, shelfId: shelf.id, ...(calc.modelId ? { modelId: calc.modelId } : { name }) },
  });
  return db.$transaction(async (tx) => {
    for (const l of result.materialLines) {
      if (l.filamentId) await tx.filament.updateMany({ where: { id: l.filamentId, workshopId: ws }, data: { usedFromSpoolG: { increment: l.gramsEffective } } });
    }
    await moveShelfItems(tx, calc, -1);
    if (existing) {
      // weighted average so the shelf value stays right
      const qty = existing.quantity + q;
      return tx.finishedGood.update({
        where: { id: existing.id },
        data: {
          quantity: qty,
          unitCost: (existing.unitCost * existing.quantity + unitCost * q) / qty,
          unitPrice,
        },
      });
    }
    return tx.finishedGood.create({
      data: { workshopId: ws, shelfId: shelf.id, modelId: calc.modelId, name, quantity: q, unitCost, unitPrice },
    });
  });
});
