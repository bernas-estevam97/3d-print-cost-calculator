import { route } from "@/lib/api";
import { db } from "@/lib/db";

// SQLite LIKE is case-sensitive outside ASCII ("Dragão", "Avó"), so match in JS,
// lowercased and accent-folded. Fine for a single workshop's data.
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const GET = route(async (req, _ctx, auth) => {
  const q = fold(new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return [];
  const where = { workshopId: auth.workshopId };
  const [orders, clients, filaments] = await Promise.all([
    db.order.findMany({ where, select: { id: true, name: true, number: true, client: { select: { name: true } } }, orderBy: { saleDate: "desc" } }),
    db.client.findMany({ where, select: { id: true, name: true, phone: true, email: true } }),
    db.filament.findMany({ where, select: { id: true, name: true, brand: true, type: true } }),
  ]);
  const hit = (...xs: (string | null | undefined)[]) => xs.some((x) => x && fold(x).includes(q));
  return [
    ...orders.filter((o) => hit(o.name, o.number, o.client?.name)).slice(0, 8)
      .map((o) => ({ type: "Orders", label: o.name, sub: `#${o.number}${o.client ? ` · ${o.client.name}` : ""}`, href: `/en/orders/${o.id}` })),
    ...clients.filter((c) => hit(c.name, c.phone, c.email)).slice(0, 8)
      .map((c) => ({ type: "Clients", label: c.name, sub: c.phone || c.email, href: `/en/clients/${c.id}` })),
    ...filaments.filter((f) => hit(f.name, f.brand, f.type)).slice(0, 8)
      .map((f) => ({ type: "Filaments", label: f.name, sub: `${f.brand} · ${f.type}`, href: `/en/filaments?q=${encodeURIComponent(f.name)}` })),
  ];
});
