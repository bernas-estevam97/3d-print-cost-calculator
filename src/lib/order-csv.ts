// Order CSV format, shared by the export (browser) and the import route (server).
// Plain order fields keep their database names; client and printer go by name;
// materials and services are JSON lists inside one cell each.
import { toCsv } from "./csv";
import type { Order } from "./types";

export const ORDER_FIELDS = [
  "number", "name", "status", "saleDate", "dueDate", "paid", "advanceReceived", "advanceReceivedOn", "tips", "tipsReceived",
  "trackingNumber", "notes", "source", "personalUse", "quantity", "assemblyQuantity", "printTimeMin",
  "costMaterial", "costElectricity", "costPrinter", "costDryer", "costLabor", "costConsumables", "costPostprocessing",
  "costPackaging", "costDelivery", "costWarehouse", "costOther", "totalCost", "discountPct", "discountAmount", "taxAmount",
  "marketplaceFee", "acquiringFee", "salePrice", "revenue", "profit", "netProfit", "marginPct",
] as const;

export const ORDER_COLUMNS = [...ORDER_FIELDS, "client", "printer", "tags", "materials", "services"];

export const ordersCsv = (rows: Order[]) =>
  toCsv(ORDER_COLUMNS, rows.map((o) => [
    ...ORDER_FIELDS.map((k) => o[k]),
    o.client?.name,
    o.printer ? o.printer.internalName || o.printer.model : "",
    o.tags,
    JSON.stringify(o.materials.map(({ name, color, grams, pricePerKg }) => ({ name, color, grams, pricePerKg }))),
    JSON.stringify(o.services.map(({ name, cost, mode, price }) => ({ name, cost, mode, price }))),
  ]));
