"use client";
import { ArrowLeft, QrCode, Star, Trash2, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PrinterFields, type Printer } from "@/components/printer-form";
import { Badge, Bar, Button, Card, Field, Input, ListSkeleton, NumberInput, Segmented, StatusBadge, deleteWithUndo } from "@/components/ui";
import { useApi, useCurrency, useList, useQueryState, useRemove, useSave } from "@/lib/client";
import { dateDot, dateInput, duration, money } from "@/lib/format";
import { printQr } from "@/lib/qr";
import type { Order } from "@/lib/types";

const EDITABLE = ["manufacturer", "model", "internalName", "technology", "powerW", "price", "lifetimeH", "initialHours", "hoursManual", "note", "photoUrl", "groupId"] as const;

export default function PrinterDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const currency = useCurrency();
  const { data: p, isLoading } = useApi<Printer>(`/api/printers/${id}`);
  const { data: groups = [] } = useList<{ id: string; name: string }>("printer-groups");
  const { data: orders = [] } = useList<Order>("orders");
  const save = useSave<Printer>("printers");
  const remove = useRemove("printers");
  const [tab, setTab] = useQueryState("tab", "parameters");
  const [form, setForm] = useState<Partial<Printer> | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- edit a copy of the loaded printer
  useEffect(() => { if (p) setForm(p); }, [p]);

  if (isLoading || !p || !form) return <ListSkeleton />;
  const prints = orders.filter((o) => o.printerId === p.id);
  const byMonth = new Map<string, number>();
  for (const o of prints) {
    const k = o.saleDate.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + (o.printTimeMin * o.quantity) / 60);
  }
  const maxMonth = Math.max(1, ...byMonth.values());

  return (
    <div className="max-w-4xl">
      <Link href="/en/printers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Back to list
      </Link>
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <div className="size-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-card-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.photoUrl && <img src={p.photoUrl} alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{p.internalName || p.model}</h1>
          <div className="flex items-center gap-2 text-sm text-muted">
            {p.manufacturer} {p.model} <Badge className="bg-accent/15 text-accent">{p.technology}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="icon" aria-label="Favourite" onClick={() => save.mutate({ id: p.id, favourite: !p.favourite })}>
            <Star className={`size-5 ${p.favourite ? "fill-accent text-accent" : ""}`} />
          </Button>
          <Button size="icon" aria-label="Print QR" onClick={() => printQr(p.id.slice(0, 8).toUpperCase(), p.internalName || p.model)}>
            <QrCode className="size-5" />
          </Button>
          <Button size="icon" aria-label="Delete printer" onClick={() => deleteWithUndo(p.model, () => remove.mutate(p.id, { onSuccess: () => router.push("/en/printers") }))}>
            <Trash2 className="size-5 text-red-500" />
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-2">
            <span>Used: {p.hoursUsed.toFixed(2)} h</span>
            <span className="text-muted">{p.lifetimeH.toLocaleString("en-US")} h lifetime</span>
          </div>
          <Bar pct={(p.hoursUsed / p.lifetimeH) * 100} />
          <div className="text-muted">Printing hour ~{money(p.hourCost, currency)} · Last 30 days: {money(p.last30Earned, currency)}</div>
          <div>Payback: {Math.round(p.paybackPct)}% ({money(p.earned, currency)} / {money(p.price, currency)})</div>
          <Bar pct={p.paybackPct} className="bg-green-500" />
        </div>
      </Card>

      <div className="mb-4 overflow-x-auto">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "parameters", label: "Parameters" },
            { value: "maintenance", label: "Maintenance" },
            { value: "prints", label: `Prints (${prints.length})` },
            { value: "usage", label: "Usage history" },
          ]}
        />
      </div>

      {tab === "parameters" && (
        <Card>
          <PrinterFields value={form} onChange={setForm} groups={groups} showPreset={false} showHours />
          <div className="mt-4 flex justify-end">
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ id: p.id, ...Object.fromEntries(EDITABLE.map((k) => [k, form[k]])) })}>
              Save
            </Button>
          </div>
        </Card>
      )}

      {tab === "maintenance" && (
        <Card>
          {p.maintenanceDue && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
              <Wrench className="size-4" /> Maintenance needed
            </div>
          )}
          <p className="mb-3 text-sm text-muted">Due when either interval is reached, whichever comes first.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Every (print hours)">
              <NumberInput value={form.maintenanceIntervalHours ?? 0} onChange={(v) => setForm({ ...form, maintenanceIntervalHours: v || null })} />
            </Field>
            <Field label="Every (days)">
              <NumberInput value={form.maintenanceIntervalDays ?? 0} onChange={(v) => setForm({ ...form, maintenanceIntervalDays: Math.round(v) || null })} />
            </Field>
            <Field label="Last done">
              <Input type="date" value={dateInput(form.lastMaintenanceAt)} onChange={(e) => setForm({ ...form, lastMaintenanceAt: e.target.value || null })} />
            </Field>
            <Field label="Hours at last service">
              <NumberInput value={form.lastMaintenanceHours} onChange={(v) => setForm({ ...form, lastMaintenanceHours: v })} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button onClick={() => save.mutate({ id: p.id, lastMaintenanceAt: new Date().toISOString(), lastMaintenanceHours: p.hoursUsed })}>
              <Wrench className="size-4" /> Mark done
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                save.mutate({
                  id: p.id,
                  maintenanceIntervalHours: form.maintenanceIntervalHours,
                  maintenanceIntervalDays: form.maintenanceIntervalDays,
                  lastMaintenanceAt: form.lastMaintenanceAt,
                  lastMaintenanceHours: form.lastMaintenanceHours,
                })
              }
            >
              Save
            </Button>
          </div>
        </Card>
      )}

      {tab === "prints" && (
        <Card bodyClass="p-0">
          {prints.length === 0 && <p className="p-4 text-sm text-muted">No orders printed on this printer yet.</p>}
          {prints.map((o) => (
            <Link key={o.id} href={`/en/orders/${o.id}`} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-card-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{o.name}</div>
                <div className="text-xs text-muted">{dateDot(o.saleDate)} · {duration(o.printTimeMin * o.quantity)}</div>
              </div>
              <StatusBadge status={o.status} />
            </Link>
          ))}
        </Card>
      )}

      {tab === "usage" && (
        <Card title="Hours by month">
          {byMonth.size === 0 && <p className="text-sm text-muted">No data</p>}
          <div className="space-y-2">
            {[...byMonth.entries()].sort().reverse().map(([m, h]) => (
              <div key={m} className="grid grid-cols-[80px_1fr_70px] items-center gap-3 text-sm">
                <span className="text-muted">{m}</span>
                <Bar pct={(h / maxMonth) * 100} />
                <span className="text-right tabular-nums">{h.toFixed(1)} h</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
