"use client";
// Dashboard, main doc 5.12.
import { Calculator, ClipboardList, FileText, Printer, TrendingDown, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BarList, MiniBars, MultiSeries } from "@/components/charts";
import { useLocal } from "@/components/data-table";
import { Card, ColorDot, ListSkeleton, Segmented, cn } from "@/components/ui";
import { useApi, useCurrency, useMe } from "@/lib/client";
import { dateDot, money } from "@/lib/format";
import { statusOf } from "@/lib/status";

type Dash = {
  inProgress: number;
  revenue: { value: number; change: number | null };
  profit: { value: number; change: number | null };
  clients: number;
  series: { revenue: number; profit: number; inProgress: number }[];
  activePrinters: { printer: string; order: string; id: string }[];
  funnel: { status: string; key: string; count: number }[];
  topMaterials: { total: number; items: { name: string; grams: number; color: string }[] };
  weekday: { day: string; orders: number; clients: number }[];
  events: { kind: string; text: string; date: string; href: string }[];
  restock: { id: string; name: string; lastsDays: number; color: string }[];
};

function Change({ v }: { v: number | null }) {
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium", up ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-red-500/15 text-red-500")}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}{Math.round(v)}%
    </span>
  );
}

function Tile({ label, icon: Icon, value, change, data, dataKey }: { label: string; icon: typeof Users; value: React.ReactNode; change?: number | null; data?: object[]; dataKey?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1.5"><Icon className="size-4" /> {label}</span>
        {change !== undefined && <Change v={change} />}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {data && dataKey && <div className="mt-2"><MiniBars data={data} dataKey={dataKey} label={label} /></div>}
    </div>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default function DashboardPage() {
  const [range, setRange] = useLocal<"week" | "month">("dashboard:range", "week");
  const { data: d, isLoading } = useApi<Dash>(`/api/dashboard?range=${range}`);
  const me = useMe().data;
  const currency = useCurrency();
  const m = (x: number) => money(x, currency, true);
  const [docMenu, setDocMenu] = useState(false);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{greeting()}, {me?.name.split(" ")[0] ?? ""}!</h1>
          <p className="text-sm text-muted">Here&apos;s what&apos;s happening in your business today</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <button type="button" onClick={() => setDocMenu(!docMenu)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm hover:bg-card-2">
              <FileText className="size-4" /> Document
            </button>
            {docMenu && (
              <div className="absolute top-12 right-0 z-20 w-52 rounded-xl border border-border bg-card p-1 shadow-xl">
                {[["quote", "Commercial proposal"], ["invoice", "Invoice"], ["receipt", "Payment receipt"], ["delivery_note", "Delivery note"]].map(([k, l]) => (
                  <Link key={k} href={`/en/documents?create=${k}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-card-2">{l}</Link>
                ))}
              </div>
            )}
          </div>
          <Link href="/en/calculator" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:brightness-110">
            <Calculator className="size-4" /> New calculation
          </Link>
        </div>
      </div>

      <div className="mb-3 flex justify-end">
        <Segmented value={range} onChange={setRange} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
      </div>
      {isLoading || !d ? <ListSkeleton rows={6} /> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="In progress" icon={ClipboardList} value={d.inProgress} data={d.series} dataKey="inProgress" />
            <Tile label="Revenue" icon={TrendingUp} value={m(d.revenue.value)} change={d.revenue.change} data={d.series} dataKey="revenue" />
            <Tile label="Profit" icon={TrendingUp} value={m(d.profit.value)} change={d.profit.change} data={d.series} dataKey="profit" />
            <Tile label="Clients" icon={Users} value={d.clients} />
          </div>

          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Analytics</h2>
            <span className="text-xs text-muted">30 days</span>
          </div>
          <div className="mb-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <Card title="Active printers">
              {d.activePrinters.length === 0 ? <p className="text-sm text-muted">No printers running right now</p> : (
                <ul className="space-y-2 text-sm">
                  {d.activePrinters.map((a) => (
                    <li key={a.id}><Link href={`/en/orders/${a.id}`} className="flex items-center gap-2 hover:text-accent"><Printer className="size-4 text-purple-500" /><span className="font-medium">{a.printer}</span><span className="truncate text-muted">{a.order}</span></Link></li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Order funnel">
              <ul className="space-y-1.5">
                {d.funnel.map((f) => {
                  const max = Math.max(1, ...d.funnel.map((x) => x.count));
                  return (
                    <li key={f.key} className="grid grid-cols-[110px_1fr_24px] items-center gap-2 text-xs">
                      <span className="truncate">{f.status}</span>
                      <span className="h-2 rounded-full bg-card-2"><span className={cn("block h-full rounded-full", statusOf(f.key).bar)} style={{ width: `${(f.count / max) * 100}%` }} /></span>
                      <span className="text-right tabular-nums">{f.count}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card title={`Top materials · ${Math.round(d.topMaterials.total)} g`}>
              <BarList color items={d.topMaterials.items.map((i) => ({ name: i.name, value: i.grams, color: i.color }))} format={(v) => `${Math.round(v)} g`} />
            </Card>
            <Card title="Orders and clients by weekday">
              <MultiSeries kind="bar" height={170} data={d.weekday} x="day" series={[{ key: "orders", name: "Orders" }, { key: "clients", name: "New clients" }]} />
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Events">
              {d.events.length === 0 ? <p className="text-sm text-muted">Nothing yet</p> : (
                <ul className="space-y-2 text-sm">
                  {d.events.map((e, i) => (
                    <li key={i}><Link href={e.href} className="flex justify-between gap-2 hover:text-accent"><span className="truncate">{e.text}</span><span className="shrink-0 text-xs text-muted">{dateDot(e.date)}</span></Link></li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Restock this week">
              {d.restock.length === 0 ? <p className="text-sm text-muted">Nothing to restock</p> : (
                <ul className="space-y-2 text-sm">
                  {d.restock.map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <ColorDot color={f.color} /><span className="flex-1 truncate">{f.name}</span>
                      <span className={cn("text-xs", f.lastsDays <= 7 ? "text-red-500" : "text-amber-500")}>Lasts ~{f.lastsDays} d</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
