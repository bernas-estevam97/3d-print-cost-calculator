"use client";
// Analytics, main doc 5.11 / 6.13. Revenue and profit count paid orders (see lib/analytics.ts).
import { AlertTriangle, ChevronLeft, ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { BarList, Bars, Donut, MultiSeries, shortMonth } from "@/components/charts";
import { Bar, Button, Card, ColorDot, Input, Kpi, ListSkeleton, PageHeader, PaidBadge, Segmented } from "@/components/ui";
import type { AnalyticsData } from "@/lib/analytics";
import { useApi, useCurrency, useQueryState } from "@/lib/client";
import { dateInput, dateUS, duration, money, pct } from "@/lib/format";

type Period = "day" | "week" | "month" | "year";

function bounds(period: Period, anchor: Date) {
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (period === "day") return [a, new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1)];
  if (period === "week") {
    const s = new Date(a);
    s.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7)];
  }
  if (period === "month") return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 1)];
  return [new Date(a.getFullYear(), 0, 1), new Date(a.getFullYear() + 1, 0, 1)];
}

function shift(period: Period, anchor: Date, dir: 1 | -1) {
  const d = new Date(anchor);
  if (period === "day") d.setDate(d.getDate() + dir);
  if (period === "week") d.setDate(d.getDate() + 7 * dir);
  if (period === "month") d.setMonth(d.getMonth() + dir, 1);
  if (period === "year") d.setFullYear(d.getFullYear() + dir);
  return d;
}

function label(period: Period, [from, to]: Date[]) {
  if (period === "day") return from.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  if (period === "week") return `${dateUS(from)} – ${dateUS(new Date(to.getTime() - 1))}`;
  if (period === "month") return from.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return String(from.getFullYear());
}

type A = AnalyticsData;

export default function AnalyticsPage() {
  const currency = useCurrency();
  const m = (x: number) => money(x, currency);
  const mc = (x: number) => money(x, currency, true);
  const [tab, setTab] = useQueryState("tab", "overview");
  const [period, setPeriod] = useQueryState("period", "month");
  const [anchorStr, setAnchor] = useQueryState("date", "");
  const anchor = anchorStr ? new Date(anchorStr) : new Date();
  const range = bounds(period as Period, anchor);
  const { data: d, isLoading } = useApi<A>(`/api/analytics?from=${range[0].toISOString()}&to=${range[1].toISOString()}`);

  const exportCsv = () => {
    if (!d) return;
    const rows = [["Category", "Revenue", "Paid", "Unpaid", "Cost", "Tax", "Marketplace commission", "Gross profit", "Net profit"],
      ...d.finance.byCategory.map((c) => [c.name, c.revenue, c.paid, c.unpaid, c.cost, c.tax, c.marketplace, c.gross, c.net].map((v) => (typeof v === "number" ? v.toFixed(2) : v)))];
    const blob = new Blob([rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `finance-${dateInput(range[0])}.csv`;
    a.click();
  };

  return (
    <div>
      <PageHeader title="Analytics" info="Revenue and profit count paid orders, by sale date" />
      <div className="mb-3 overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "overview", label: "Overview" }, { value: "finance", label: "Finance" },
          { value: "production", label: "Production" }, { value: "customers", label: "Customers and channels" },
        ]} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={period} onChange={setPeriod} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }]} />
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Previous period" onClick={() => setAnchor(dateInput(shift(period as Period, anchor, -1)))}><ChevronLeft className="size-5" /></Button>
          <span className="min-w-36 text-center text-sm font-medium">{label(period as Period, range)}</span>
          <Button size="icon" variant="ghost" aria-label="Next period" onClick={() => setAnchor(dateInput(shift(period as Period, anchor, 1)))}><ChevronRight className="size-5" /></Button>
        </div>
        <Input type="date" aria-label="Pick a date" className="w-40" value={dateInput(anchor)} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
        {d && <span className="text-sm text-muted">{d.orderCount} orders in period</span>}
      </div>
      {d?.capped && <p className="mb-3 flex items-center gap-2 text-sm text-amber-500"><AlertTriangle className="size-4" /> More than 5000 orders: totals may be incomplete</p>}

      {isLoading || !d ? <ListSkeleton rows={6} /> : (
        <>
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
                <div className="rounded-2xl bg-gradient-to-br from-accent to-accent/60 p-5 text-accent-fg">
                  <div className="text-sm opacity-90">Today</div>
                  <div className="text-3xl font-bold tabular-nums">{m(d.overview.today.profit)}</div>
                  <div className="text-sm opacity-90">profit · {duration(d.overview.today.printMin)} printing</div>
                  <div className="mt-2 text-sm">{d.overview.today.urgent ? `${d.overview.today.urgent} orders due within 72 h` : "No urgent orders in the next 72 h"}</div>
                </div>
                <Kpi label="Revenue" value={m(d.overview.revenue)} sub={`${d.overview.count} paid orders`} />
                <Kpi label="Net profit" value={m(d.overview.netProfit)} />
                <Kpi label="Margin" value={pct(d.overview.margin)} />
              </div>
              <Card title="12-month dynamics">
                <MultiSeries data={d.overview.dynamics.map((x) => ({ ...x, month: shortMonth(x.month) }))} x="month" series={[{ key: "revenue", name: "Revenue" }, { key: "profit", name: "Net profit" }]} format={mc} />
              </Card>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Most profitable models">
                  <ModelTable rows={d.overview.topModels} m={m} />
                </Card>
                <Card title="Loss-making models">
                  {d.overview.lossModels.length ? <ModelTable rows={d.overview.lossModels} m={m} /> : <p className="text-sm text-muted">None in this period</p>}
                </Card>
              </div>
            </div>
          )}

          {tab === "finance" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi label="Paid sales" value={m(d.finance.paidSales.amount)} sub={`${d.finance.paidSales.count} orders`} />
                <Kpi label="Total cost" value={m(d.finance.totalCost)} />
                <Kpi label="Accounts receivable" value={m(d.finance.receivable)} sub="Unpaid orders, incl. in progress" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Cost structure"><Donut items={d.finance.costStructure} format={m} /></Card>
                <Card title="Profit trend (6 months)"><Bars data={d.finance.profitTrend.map((x) => ({ ...x, month: shortMonth(x.month) }))} x="month" y="profit" name="Net profit" format={mc} /></Card>
              </div>
              <Card title="Recent orders">
                {d.finance.recent.length === 0 && <p className="text-sm text-muted">No orders in this period</p>}
                <ul className="divide-y divide-border">
                  {d.finance.recent.map((o) => (
                    <li key={o.id}><Link href={`/en/orders/${o.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-accent">
                      <span className="flex-1 truncate">{o.name}</span><span className="text-xs text-muted">{dateUS(o.date)}</span><PaidBadge paid={o.paid} /><span className="w-20 text-right tabular-nums">{m(o.price)}</span>
                    </Link></li>
                  ))}
                </ul>
              </Card>
              <Card title="By category" actions={<Button size="sm" onClick={exportCsv}><Download className="size-4" /> CSV</Button>}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted">{["Category", "Revenue", "Paid", "Unpaid", "Cost", "Tax", "Marketplace", "Gross profit", "Net profit"].map((h) => <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {d.finance.byCategory.map((c) => (
                        <tr key={c.name} className="border-t border-border">
                          <td className="px-2 py-1.5">{c.name}</td>
                          {[c.revenue, c.paid, c.unpaid, c.cost, c.tax, c.marketplace, c.gross, c.net].map((v, i) => <td key={i} className="px-2 py-1.5 tabular-nums">{m(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === "production" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Order flow (median days per status)">
                {d.production.flow.every((f) => f.medianDays == null) ? <p className="text-sm text-muted">No data</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {d.production.flow.map((f) => <li key={f.status} className="flex justify-between"><span>{f.status}</span><span className="tabular-nums">{f.medianDays == null ? "No data" : `${f.medianDays.toFixed(1)} d`}</span></li>)}
                  </ul>
                )}
              </Card>
              <Card title="Orders completed per week"><Bars data={d.production.completedPerWeek} x="week" y="count" name="Completed" height={180} /></Card>
              <Card title="Print time">
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  {(["week", "month", "year"] as const).map((k) => <div key={k}><dt className="text-xs text-muted capitalize">{k}</dt><dd className="font-semibold">{duration(d.production.printTime[k], true)}</dd></div>)}
                </dl>
                <div className="mt-4 text-sm">Material consumption in period: <b>{Math.round(d.production.materialG)} g</b> filament</div>
              </Card>
              <Card title="Electricity and operator costs (12 months)">
                <MultiSeries kind="bar" height={200} data={d.production.energy.map((x) => ({ ...x, month: shortMonth(x.month) }))} x="month" series={[{ key: "electricity", name: "Electricity" }, { key: "labor", name: "Operator" }]} format={m} />
              </Card>
              <Card title="Top materials"><BarList items={d.production.topMaterials.map((x) => ({ name: x.name, value: x.grams }))} format={(v) => `${Math.round(v)} g`} /></Card>
              <Card title="Top colours">
                {d.production.topColors.length === 0 ? <p className="text-sm text-muted">No data</p> : (
                  <ul className="flex flex-wrap gap-3">
                    {d.production.topColors.map((c) => <li key={c.name} className="flex items-center gap-2 text-sm"><ColorDot color={c.name} className="size-6 rounded-md" /><span className="tabular-nums">{Math.round(c.grams)} g</span></li>)}
                  </ul>
                )}
              </Card>
              <Card title="Printer payback">
                {d.production.printers.map((p) => (
                  <div key={p.name} className="mb-3 text-sm">
                    <div className="mb-1 flex justify-between"><span>{p.name}</span><span>{Math.round(p.paybackPct)}% · {m(p.earned)} / {m(p.price)}</span></div>
                    <Bar pct={p.paybackPct} className="bg-green-500" />
                  </div>
                ))}
              </Card>
              <Card title="Costs by printer (period)">
                <ul className="space-y-1.5 text-sm">
                  {d.production.printers.map((p) => <li key={p.name} className="flex justify-between gap-2"><span>{p.name}</span><span className="text-muted">electricity {m(p.electricity)} · amortization {m(p.amortization)}</span></li>)}
                </ul>
              </Card>
            </div>
          )}

          {tab === "customers" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                <Kpi label="Tied up in filament stock" value={m(d.customers.tiedFilament)} />
                <Kpi label="Tied up in finished goods" value={m(d.customers.tiedFinished)} />
              </div>
              <Card title="Sales channels">
                <ul className="space-y-1.5 text-sm">
                  {d.customers.channels.length === 0 && <li className="text-muted">No sales in this period</li>}
                  {d.customers.channels.map((c) => <li key={c.source} className="flex justify-between"><span className="capitalize">{c.source}</span><span>{c.orders} orders · {m(c.revenue)}</span></li>)}
                </ul>
              </Card>
              <Card title="Top clients">
                <BarList items={d.customers.topClients.map((c) => ({ name: `${c.name} (${c.orders})`, value: c.total }))} format={m} />
              </Card>
              <Card title="Order funnel" className="lg:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted"><th className="py-1.5">Status</th><th>Orders</th><th>Amount</th></tr></thead>
                    <tbody>{d.customers.funnel.map((f) => <tr key={f.key} className="border-t border-border"><td className="py-1.5">{f.status}</td><td className="tabular-nums">{f.count}</td><td className="tabular-nums">{m(f.amount)}</td></tr>)}</tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModelTable({ rows, m }: { rows: { name: string; orders: number; profit: number; profitPerHour: number | null }[]; m: (x: number) => string }) {
  if (!rows.length) return <p className="text-sm text-muted">No data</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-muted"><th className="py-1">Model</th><th>Orders</th><th>Profit</th><th>Per hour</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-border">
            <td className="max-w-40 truncate py-1.5">{r.name}</td><td>{r.orders}</td>
            <td className={r.profit >= 0 ? "text-green-500" : "text-red-500"}>{m(r.profit)}</td>
            <td>{r.profitPerHour == null ? "—" : m(r.profitPerHour)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
