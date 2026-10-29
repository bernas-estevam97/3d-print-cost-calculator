import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { calcSchema, computeCalc } from "@/lib/calc";
import { db } from "@/lib/db";
import { loadRefs } from "@/lib/orders";

/** "Save to warehouse": create or top up a finished good (main doc 5.8). */
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
  if (existing) {
    // weighted average so the shelf value stays right
    const qty = existing.quantity + q;
    return db.finishedGood.update({
      where: { id: existing.id },
      data: {
        quantity: qty,
        unitCost: (existing.unitCost * existing.quantity + unitCost * q) / qty,
        unitPrice,
      },
    });
  }
  return db.finishedGood.create({
    data: { workshopId: ws, shelfId: shelf.id, modelId: calc.modelId, name, quantity: q, unitCost, unitPrice },
  });
});
