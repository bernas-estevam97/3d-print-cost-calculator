"use client";
// Orders list, main doc 6.2.
import { Download, Filter, KanbanSquare, Plus, Search, Trash2, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, useLocal } from "@/components/data-table";
import {
  Button, Checkbox, ColorDot, Dialog, EmptyState, Field, Input, ListSkeleton, NumberInput, PageHeader, PaidBadge, Segmented, Select,
  StatusBadge, Thumb,
} from "@/components/ui";
import { api, useCurrency, useList, useMutate, useQueryState } from "@/lib/client";
import { dateLong, dateUS, duration, money, pct } from "@/lib/format";
import { STATUSES, statusOf } from "@/lib/status";
import type { Client, Order } from "@/lib/types";

const SORTS: Record<string, [string, (a: Order, b: Order) => number]> = {
  newest: ["Newest first", (a, b) => b.saleDate.localeCompare(a.saleDate)],
  oldest: ["Oldest first", (a, b) => a.saleDate.localeCompare(b.saleDate)],
  price: ["Price, high to low", (a, b) => b.salePrice - a.salePrice],
  profit: ["Profit, high to low", (a, b) => b.profit - a.profit],
};

function toCsv(rows: Order[]) {
  const head = ["Number", "Date", "Name", "Status", "Paid", "Client", "Quantity", "Cost", "Price", "Tips", "Revenue", "Profit", "Net profit", "Margin %"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((o) =>
    [o.number, dateUS(o.saleDate), o.name, statusOf(o.status).label, o.paid ? "yes" : "no", o.client?.name ?? "", o.quantity,
      o.totalCost.toFixed(2), o.salePrice.toFixed(2), o.tips.toFixed(2), o.revenue.toFixed(2), o.profit.toFixed(2), o.netProfit.toFixed(2), o.marginPct.toFixed(1)]
      .map(esc).join(","),
  );
  return [head.map(esc).join(","), ...lines].join("\n");
}

export default function OrdersPage() {
  const { data, isLoading } = useList<Order>("orders");
  const { data: clients = [] } = useList<Client>("clients");
  const currency = useCurrency();
  const router = useRouter();
  const m = (x: number) => money(x, currency, true);

  const [q, setQ] = useQueryState("q", "");
  const [status, setStatus] = useQueryState("status", "");
  const [payment, setPayment] = useQueryState("payment", "all");
  const [source, setSource] = useQueryState("source", "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hidePersonal, setHidePersonal] = useLocal("orders:hidePersonal", false);
  const [sort, setSort] = useLocal("orders:sort", "newest");
  const [view, setView] = useLocal<"table" | "cards">("orders:view", "table");
  const [filters, setFilters] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [service, setService] = useState<{ name: string; price: number; cost: number; clientId: string } | null>(null);

  const bulk = useMutate<{ action: "delete" | "status"; status?: string }>(
    (v) => api("/api/orders/bulk", { method: "POST", json: { ids: selected, ...v } }),
    "Done",
  );
  const remove = useMutate<string>((id) => api(`/api/orders/${id}`, { method: "DELETE" }), "Order deleted");
  const sellService = useMutate<NonNullable<typeof service>, { id: string }>(
    (s) => api("/api/orders/service", { method: "POST", json: { ...s, clientId: s.clientId || null } }),
    "Service order created",
  );

  const all = data ?? [];
  const rows = all
    .filter((o) => {
      const text = `${o.name} ${o.number} ${o.client?.name ?? ""}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (status && o.status !== status) return false;
      if (payment === "paid" && !o.paid) return false;
      if (payment === "unpaid" && o.paid) return false;
      if (source && o.source !== source) return false;
      if (hidePersonal && o.personalUse) return false;
      if (from && o.saleDate.slice(0, 10) < from) return false;
      if (to && o.saleDate.slice(0, 10) > to) return false;
      return true;
    })
    .sort(SORTS[sort]?.[1] ?? SORTS.newest[1]);
  const activeFilters = [status, payment !== "all", source, from, to, hidePersonal].filter(Boolean).length;
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        info="Every saved calculation becomes an order. Click one to see its breakdown."
        subtitle={`Orders: ${all.length}`}
        actions={
          <>
            <Button onClick={() => setService({ name: "", price: 0, cost: 0, clientId: "" })}><Wrench className="size-4" /> Sell a service</Button>
            <Link href="/en/calculator" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:brightness-110">
              <Plus className="size-4" /> New order
            </Link>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search by name, number, client" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setFilters(true)}><Filter className="size-4" /> Filters{activeFilters ? ` (${activeFilters})` : ""}</Button>
        <Select className="w-44" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </Select>
        <Segmented value={view} onChange={setView} options={[{ value: "table", label: "Table" }, { value: "cards", label: "Cards" }]} />
        <Link href="/en/production" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm hover:bg-card-2"><KanbanSquare className="size-4" /> Kanban</Link>
        <Button onClick={exportCsv} disabled={!rows.length}><Download className="size-4" /> CSV</Button>
      </div>

      {selected.length > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm shadow">
          <span className="mr-2">{selected.length} selected</span>
          <Select className="h-9 w-48" aria-label="Change status" value="" onChange={(e) => e.target.value && bulk.mutate({ action: "status", status: e.target.value }, { onSuccess: () => setSelected([]) })}>
            <option value="">Change status…</option>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
          <Button size="sm" variant="danger" onClick={() => { const ids = selected; if (confirm(`Delete ${ids.length} orders? Stock used by them is returned.`)) bulk.mutate({ action: "delete" }, { onSuccess: () => setSelected([]) }); }}>
            <Trash2 className="size-4" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      {isLoading ? <ListSkeleton rows={8} /> : (
        <DataTable
          id="orders"
          view={view}
          rows={rows}
          rowKey={(o) => o.id}
          onRowClick={(o) => router.push(`/en/orders/${o.id}`)}
          groupBy={sort === "newest" || sort === "oldest" ? (o) => dateLong(o.saleDate) : undefined}
          rowClass={(o) => (selected.includes(o.id) ? "bg-accent/10" : "")}
          empty={<EmptyState text={all.length ? "No orders match these filters" : "No orders yet"} action={<Link className="text-accent" href="/en/calculator">New calculation</Link>} />}
          card={(o) => (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label="Select order" className="mt-1 size-5 accent-[var(--accent)]" checked={selected.includes(o.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(o.id)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{o.name}</div>
                  <div className="text-xs text-muted">{o.client?.name ?? "No client"} · {duration(o.printTimeMin * o.quantity)}</div>
                </div>
                <div className="text-right"><div className="font-semibold">{m(o.salePrice)}</div><div className="text-xs text-green-500">{m(o.profit)}</div></div>
              </div>
              <div className="flex flex-wrap gap-1.5"><StatusBadge status={o.status} /><PaidBadge paid={o.paid} />{o.personalUse && <span className="text-xs text-muted">personal use</span>}</div>
            </div>
          )}
          columns={[
            { key: "sel", header: "", fixed: true, cell: (o) => (
              <input type="checkbox" aria-label="Select order" className="size-4 accent-[var(--accent)]" checked={selected.includes(o.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(o.id)} />
            ) },
            { key: "model", header: "Model", fixed: true, sort: (o) => o.name, cell: (o) => (
              <div className="flex items-center gap-3">
                <Thumb />
                <div className="min-w-0"><div className="max-w-64 truncate font-medium">{o.name}</div><div className="text-xs text-muted">{duration(o.printTimeMin * o.quantity)}{o.quantity > 1 ? ` · ${o.quantity} pcs` : ""}</div></div>
              </div>
            ) },
            { key: "status", header: "Status", sort: (o) => STATUSES.findIndex((s) => s.key === o.status), cell: (o) => <StatusBadge status={o.status} /> },
            { key: "payment", header: "Payment", sort: (o) => Number(o.paid), cell: (o) => <PaidBadge paid={o.paid} /> },
            { key: "client", header: "Client", sort: (o) => o.client?.name ?? "", cell: (o) => o.client?.name ?? "—" },
            { key: "material", header: "Material", cell: (o) => o.materials[0] ? (
              <span className="flex items-center gap-1.5"><ColorDot color={o.materials[0].color} /><span className="max-w-40 truncate">{o.materials[0].name}</span>{o.materials.length > 1 && <span className="text-xs text-muted">+{o.materials.length - 1}</span>}</span>
            ) : "—" },
            { key: "cost", header: "Cost", sort: (o) => o.totalCost, cell: (o) => m(o.totalCost) },
            { key: "price", header: "Price", sort: (o) => o.salePrice, cell: (o) => m(o.salePrice) },
            { key: "profit", header: "Profit", sort: (o) => o.profit, cell: (o) => <span className={o.profit >= 0 ? "text-green-500" : "text-red-500"}>{m(o.profit)}</span> },
            { key: "margin", header: "Margin", sort: (o) => o.marginPct, cell: (o) => pct(o.marginPct) },
            { key: "del", header: "", fixed: true, cell: (o) => (
              <Button size="icon" variant="ghost" aria-label={`Delete ${o.name}`} className="opacity-60 group-hover:opacity-100" onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete order "${o.name}"? Stock used by it is returned.`)) remove.mutate(o.id);
              }}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
            ) },
          ]}
        />
      )}

      <Dialog open={filters} onClose={() => setFilters(false)} title="Filters" footer={
        <>
          <Button variant="ghost" onClick={() => { setStatus(""); setPayment("all"); setSource(""); setFrom(""); setTo(""); setHidePersonal(false); }}>Reset</Button>
          <Button variant="primary" onClick={() => setFilters(false)}>Show {rows.length} orders</Button>
        </>
      }>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Order source">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All orders</option>
            <option value="direct">Direct</option>
            <option value="stock">From stock</option>
            <option value="service">Services</option>
          </Select>
        </Field>
        <Field label="Payment">
          <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="all">Payment: all</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order date from"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Checkbox label="Hide personal-use" checked={hidePersonal} onChange={setHidePersonal} />
      </Dialog>

      <Dialog open={!!service} onClose={() => setService(null)} title="Sell a service" footer={
        <Button variant="primary" disabled={!service?.name.trim()} loading={sellService.isPending} onClick={() => sellService.mutate(service!, { onSuccess: (o) => router.push(`/en/orders/${o.id}`) })}>Create order</Button>
      }>
        {service && (
          <>
            <Field label="Service name *"><Input autoFocus value={service.name} onChange={(e) => setService({ ...service, name: e.target.value })} placeholder="e.g. 3D modeling" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price"><NumberInput value={service.price} onChange={(v) => setService({ ...service, price: v })} /></Field>
              <Field label="Cost" hint="Optional"><NumberInput value={service.cost} onChange={(v) => setService({ ...service, cost: v })} /></Field>
            </div>
            <Field label="Client">
              <Select value={service.clientId} onChange={(e) => setService({ ...service, clientId: e.target.value })}>
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </>
        )}
      </Dialog>
    </div>
  );
}
