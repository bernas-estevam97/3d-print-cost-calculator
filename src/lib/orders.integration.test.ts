// Main doc section 10, check 2: filament is deducted once at Printing, returned on Cancelled,
// and repeated transitions never deduct twice. Runs against a throwaway SQLite file.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const FILE = "./prisma/test-integration.db";
process.env.DATABASE_URL = `file:${FILE}`;

type Mods = {
  db: typeof import("./db").db;
  createWorkshop: typeof import("./bootstrap").createWorkshop;
  orders: typeof import("./orders");
  derive: typeof import("./derive");
  calc: typeof import("./calc");
};
let m: Mods;
let ws: string;
let filamentId: string;

const stock = async () => (await m.derive.filamentsWithStock(ws)).find((f) => f.id === filamentId)!.stockG;

beforeAll(async () => {
  rmSync(FILE, { force: true });
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: `file:${FILE}` }, stdio: "ignore" });
  m = {
    db: (await import("./db")).db,
    createWorkshop: (await import("./bootstrap")).createWorkshop,
    orders: await import("./orders"),
    derive: await import("./derive"),
    calc: await import("./calc"),
  };
  ws = (await m.createWorkshop(m.db, "Test")).id;
  filamentId = (await m.db.filament.create({ data: { workshopId: ws, name: "PLA Test", spoolPrice: 20, spoolWeightG: 1000 } })).id;
}, 60_000);

afterAll(async () => {
  await m?.db.$disconnect();
  rmSync(FILE, { force: true });
});

describe("material deduction", () => {
  it("deducts once at Printing, returns on Cancelled, never twice", async () => {
    const printer = await m.db.printer.create({ data: { workshopId: ws, model: "Test", powerW: 200, price: 100, lifetimeH: 1000 } });
    const client = await m.db.client.create({ data: { workshopId: ws, name: "Client" } });
    const order = await m.orders.createOrder(ws, {
      ...m.calc.emptyCalc(),
      name: "Part",
      materials: [{ filamentId, grams: 120 }],
      printerId: printer.id,
      printH: 2,
      clientId: client.id,
      status: "confirmed",
    });
    expect(order.totalCost).toBeGreaterThan(0);
    expect(await stock()).toBe(1000);

    await m.orders.setStatus(ws, order.id, "printing");
    expect(await stock()).toBe(880);
    await m.orders.setStatus(ws, order.id, "printing");
    await m.orders.setStatus(ws, order.id, "packing");
    await m.orders.setStatus(ws, order.id, "printing");
    expect(await stock()).toBe(880);

    await m.orders.setStatus(ws, order.id, "cancelled");
    expect(await stock()).toBe(1000);
    await m.orders.setStatus(ws, order.id, "cancelled");
    expect(await stock()).toBe(1000);

    // back into production deducts again, once
    await m.orders.setStatus(ws, order.id, "printing");
    await m.orders.setStatus(ws, order.id, "done");
    expect(await stock()).toBe(880);

    // deleting returns what was deducted
    await m.orders.deleteOrder(ws, order.id);
    expect(await stock()).toBe(1000);
  });

  it("manual material deducts nothing", async () => {
    const order = await m.orders.createOrder(ws, {
      ...m.calc.emptyCalc(),
      name: "Manual",
      materialMode: "manual",
      manual: { name: "Leftover", grams: 50, pricePerKg: 20 },
      status: "printing",
    });
    expect(order.costMaterial).toBe(1);
    expect(await stock()).toBe(1000);
  });

  it("records the date of each status once", async () => {
    const order = await m.orders.createOrder(ws, { ...m.calc.emptyCalc(), name: "Dates", status: "negotiation" });
    await m.orders.setStatus(ws, order.id, "confirmed");
    const first = JSON.parse((await m.db.order.findUniqueOrThrow({ where: { id: order.id } })).statusDates).confirmed;
    await m.orders.setStatus(ws, order.id, "negotiation");
    await m.orders.setStatus(ws, order.id, "confirmed");
    const again = JSON.parse((await m.db.order.findUniqueOrThrow({ where: { id: order.id } })).statusDates);
    expect(again.confirmed).toBe(first);
    expect(again.negotiation).toBeTruthy();
  });
});
