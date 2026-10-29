// Demo workshop, main doc section 11. DEVELOPMENT ONLY: creates a login with a published password.
// Never run it on an install other people can reach. Run: npm run seed:demo
process.loadEnvFile();

import bcrypt from "bcryptjs";
import { createWorkshop } from "../src/lib/bootstrap";
import { emptyCalc, type CalcInput } from "../src/lib/calc";
import { db } from "../src/lib/db";
import { createOrder } from "../src/lib/orders";
import type { StatusKey } from "../src/lib/status";

const EMAIL = "demo@workshop.local";

// name, brand, price, stock g, hex
const FILAMENTS: [string, string, number, number, string][] = [
  ["PLA Basic Bambu Green · 10501", "Bambu Lab", 13.43, 1000, "#00ae42"],
  ["PLA Basic Beige · 10201", "Bambu Lab", 11.41, 1000, "#f7e6de"],
  ["PLA Basic Cocoa Brown · 10802", "Bambu Lab", 13.43, 982, "#6f5034"],
  ["PLA Basic Cyan · 10603", "Bambu Lab", 13.43, 1000, "#0086d6"],
  ["PLA Basic Gray · 10103", "Bambu Lab", 13.43, 968, "#8e9089"],
  ["PLA Basic Jade White · 10100", "Bambu Lab", 13.43, 950, "#ffffff"],
  ["PLA Basic Pink · 10203", "Bambu Lab", 11.41, 1000, "#f55a74"],
  ["PLA Basic Pumpkin Orange · 10301", "Bambu Lab", 13.43, 901, "#ff9016"],
  ["PLA Basic Sunflower Yellow · 10402", "Bambu Lab", 13.43, 954, "#fec600"],
  ["Preto Lab Professional", "lab professional", 15, 141, "#111111"],
  ["Vermelho China", "china", 15, 830, "#c12e1f"],
];

const CLIENTS: [string, string][] = [
  ["Angela Gama Gym", ""], ["Avó Carma", "967-690-757"], ["Diogo Matos", ""], ["Joana Rodrigues", ""],
  ["Lara Ribas Gym", ""], ["Mariana VS Gym", ""], ["Soraia Almeida Gym", ""],
];

// name, grams, minutes, price per piece, filament key
const MODELS: [string, number, number, number | null, string][] = [
  ["Altere 20kg Verm E Preto", 9.2, 70, 3, "Preto"],
  ["Anilha Personalizada (Colada)", 5.67, 37, 3, "Preto"],
  ["Anilha Personalizada Em Amarelo", 5.7, 37, null, "Sunflower"],
  ["Barra Com Anilhas Removiveis", 8.29, 56, 3, "Gray"],
  ["Cao Branco", 8, 55, null, "Jade White"],
  ["Dragão", 175, 607, null, "Vermelho"],
  ["ketlebell 24kg red", 5.2, 59, 3, "Vermelho"],
  ["Kettlebell 24kg Grey", 5.2, 59, null, "Gray"],
  ["Penny Wise", 72, 300, null, "Gray"],
  ["Porta chaves", 6, 44, 3, "Preto"],
];

type SeedOrder = {
  name: string; date: string; status: StatusKey; paid: boolean; client: string; price: number; tips?: number;
  minutes: number; mats: [string, number][];
};

// Material split chosen so filament stock lands on the observed values above.
const ORDERS: SeedOrder[] = [
  { name: "Charmander na janela", date: "2026-10-27", status: "packing", paid: false, client: "Joana Rodrigues", price: 14, tips: 2, minutes: 700,
    mats: [["Pumpkin", 99], ["Sunflower", 40.3], ["Preto", 13.7], ["Jade White", 4]] },
  { name: "Penny Wise", date: "2026-10-26", status: "done", paid: true, client: "Diogo Matos", price: 5, minutes: 300,
    mats: [["Gray", 28], ["Jade White", 19], ["Cocoa", 18], ["Preto", 7]] },
  { name: "Dragão", date: "2026-10-26", status: "done", paid: true, client: "Diogo Matos", price: 13, minutes: 607,
    mats: [["Vermelho", 165.4], ["Preto", 9.6]] },
  { name: "Kettlebell 24kg Grey", date: "2026-10-23", status: "delivery", paid: true, client: "Soraia Almeida Gym", price: 3, minutes: 59,
    mats: [["Gray", 4], ["Preto", 1.2]] },
  { name: "Cao Branco", date: "2026-10-23", status: "delivery", paid: false, client: "Avó Carma", price: 3, minutes: 55,
    mats: [["Jade White", 8]] },
  { name: "Anilha Personalizada Em Amarelo", date: "2026-10-23", status: "done", paid: true, client: "Mariana VS Gym", price: 3, minutes: 37,
    mats: [["Sunflower", 5.7]] },
  { name: "Altere 20kg Verm E Preto", date: "2026-10-17", status: "done", paid: true, client: "Soraia Almeida Gym", price: 3, minutes: 70,
    mats: [["Vermelho", 4.6], ["Preto", 4.6]] },
  { name: "Anilha Personalizada (Colada)", date: "2026-10-16", status: "done", paid: true, client: "Lara Ribas Gym", price: 3, minutes: 37,
    mats: [["Preto", 5.67]] },
  { name: "ketlebell 24kg red", date: "2026-10-16", status: "done", paid: true, client: "Angela Gama Gym", price: 3, minutes: 59,
    mats: [["Preto", 5.2]] },
  { name: "maria Carmo porta chaves", date: "2026-10-09", status: "done", paid: true, client: "Avó Carma", price: 3.5, minutes: 44,
    mats: [["Preto", 6]] },
];

async function main() {
  const old = await db.user.findUnique({ where: { email: EMAIL } });
  if (old) await db.workshop.delete({ where: { id: old.workshopId } });

  const ws = await createWorkshop(db, "Demo Workshop");
  const workshopId = ws.id;
  await db.user.create({
    data: { email: EMAIL, name: "Demo User", passwordHash: await bcrypt.hash("demo1234", 10), workshopId },
  });

  const printer = await db.printer.create({
    data: {
      workshopId, manufacturer: "Bambu Lab", model: "A1 mini", technology: "FDM", powerW: 200, price: 150, lifetimeH: 10000,
      hoursManual: 397.27, maintenanceIntervalHours: 300, maintenanceIntervalDays: 90,
    },
  });

  const fil = new Map<string, string>();
  for (const [name, brand, price, , hex] of FILAMENTS) {
    const f = await db.filament.create({
      data: { workshopId, name, brand, type: "PLA", spoolPrice: price, spoolWeightG: 1000, spoolCount: 1, colors: JSON.stringify([hex]) },
    });
    fil.set(name, f.id);
  }
  const filId = (key: string) => [...fil.entries()].find(([n]) => n.includes(key))![1];

  const clients = new Map<string, string>();
  for (const [name, phone] of CLIENTS) {
    clients.set(name, (await db.client.create({ data: { workshopId, name, phone, source: "Instagram" } })).id);
  }

  const models = new Map<string, string>();
  for (const [name, grams, minutes, price, key] of MODELS) {
    const m = await db.model.create({
      data: {
        workshopId, name, printTimeMin: minutes, pricePerPiece: price, technology: "FDM",
        filaments: { create: [{ filamentId: filId(key), grams }] },
      },
    });
    models.set(name, m.id);
  }

  for (const o of ORDERS) {
    const calc: CalcInput = {
      ...emptyCalc(),
      name: o.name,
      modelId: models.get(o.name) ?? null,
      materials: o.mats.map(([k, grams]) => ({ filamentId: filId(k), grams })),
      printerId: printer.id,
      printH: Math.floor(o.minutes / 60),
      printMin: o.minutes % 60,
      clientId: clients.get(o.client)!,
      // the observed orders carry no tax: net profit 31 on revenue 37 (main doc 11)
      taxRegimeId: null,
      priceMode: "price",
      targetPrice: o.price,
      tips: o.tips ?? 0,
      status: o.status,
      saleDate: o.date,
    };
    const order = await createOrder(workshopId, calc);
    // plausible status history: one day per step up to the current status
    const steps: StatusKey[] = ["negotiation", "confirmed", "printer_assigned", "printing", "packing", "delivery", "done"];
    const dates: Record<string, string> = {};
    const until = steps.indexOf(o.status);
    steps.slice(0, until + 1).forEach((s, i) => {
      dates[s] = new Date(new Date(o.date).getTime() + i * 86_400_000 * 0.5).toISOString();
    });
    await db.order.update({
      where: { id: order.id },
      data: { paid: o.paid, tipsReceived: !!o.tips, statusDates: JSON.stringify(dates), saleDate: new Date(o.date) },
    });
  }

  // top up "used from spool" so stock matches the observed numbers
  const consumed = await db.orderMaterial.groupBy({ by: ["filamentId"], _sum: { grams: true }, where: { order: { workshopId } } });
  for (const [name, , , stock] of FILAMENTS) {
    const used = consumed.find((c) => c.filamentId === fil.get(name))?._sum.grams ?? 0;
    await db.filament.update({ where: { id: fil.get(name)! }, data: { usedFromSpoolG: Math.max(0, 1000 - stock - used) } });
  }

  const shelves = await db.warehouseShelf.findMany({ where: { workshopId } });
  const rings = shelves.find((s) => s.kind === "rings")!;
  const finished = shelves.find((s) => s.kind === "finished")!;
  await db.shelfItem.create({ data: { workshopId, shelfId: rings.id, name: "Keychain ring", quantity: 1, unitCost: 8 } });
  await db.finishedGood.create({
    data: { workshopId, shelfId: finished.id, modelId: models.get("Porta chaves"), name: "Porta chaves", quantity: 6, unitCost: 1, unitPrice: 3 },
  });

  const tpl = (name: string, model: string, grams: number, key: string, minutes: number) => ({
    workshopId, name,
    input: JSON.stringify({
      ...emptyCalc(), name: model, modelId: models.get(model) ?? null, printerId: printer.id,
      materials: [{ filamentId: filId(key), grams }], printH: Math.floor(minutes / 60), printMin: minutes % 60,
    }),
  });
  await db.calcTemplate.createMany({
    data: [
      tpl("altere 20kg", "Altere 20kg Verm E Preto", 9.2, "Preto", 70),
      tpl("Anilha Personalizada (Colada)", "Anilha Personalizada (Colada)", 5.67, "Preto", 37),
      tpl("kettlebell verm e preto", "ketlebell 24kg red", 5.2, "Vermelho", 59),
    ],
  });
  // fixture 1 (main doc 5.3.1) as a draft, so it can be checked in the UI
  await db.calcDraft.create({
    data: {
      workshopId, name: "Penny Wise",
      input: JSON.stringify({
        ...emptyCalc(), name: "Penny Wise",
        materials: [
          { filamentId: filId("Gray"), grams: 28 }, { filamentId: filId("Jade White"), grams: 19 },
          { filamentId: filId("Cocoa"), grams: 18 }, { filamentId: filId("Preto"), grams: 7 },
        ],
      }),
    },
  });

  await db.calendarEvent.create({
    data: { workshopId, title: "Order more black PLA", type: "todo", date: new Date("2026-10-30"), color: "#f97316" },
  });

  console.log(`Seeded. Log in with ${EMAIL} / demo1234`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
