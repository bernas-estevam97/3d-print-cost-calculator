"use client";
// Order detail, main doc 6.3.
import {
  ArrowLeft, Check, Copy, Download, Eye, FileText, Link2, Plus, QrCode, RefreshCw, Repeat, Trash2, Truck,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Button, Card, ColorDot, Dialog, Field, Input, Kpi, ListSkeleton, NumberInput, Select, StatusBadge, Switch, cn,
} from "@/components/ui";
import { api, useApi, useCurrency, useMutate } from "@/lib/client";
import { parseJson } from "@/lib/json";
import { dateDot, dateShort, duration, money, pct } from "@/lib/format";
import { printQr } from "@/lib/qr";
import { STATUSES, STEPPER } from "@/lib/status";
import { printerName, type Order } from "@/lib/types";

type Detail = Order & { documents: { id: string; type: string; number: string }[]; dryer: { name: string } | null };

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const currency = useCurrency();
  const m = (x: number) => money(x, currency);
  const { data: o, isLoading } = useApi<Detail>(`/api/orders/${id}`);
  const { data: cfg } = useApi<{ publicBaseUrl: string; shareLinksEnabled: boolean }>("/api/app-config");
  const [qr, setQr] = useState("");
  const [svc, setSvc] = useState<{ name: string; cost: number; mode: "fixed" | "markup"; price: number } | null>(null);
  const [tracking, setTracking] = useState<string | null>(null);

  useEffect(() => {
    if (o) QRCode.toDataURL(o.number, { margin: 1, width: 240 }).then(setQr);
  }, [o]);

  const patch = useMutate<Partial<Order>>((p) => api(`/api/orders/${id}`, { method: "PATCH", json: p }));
  const setStatus = useMutate<string>((status) => api(`/api/orders/${id}/status`, { method: "PATCH", json: { status } }), "Status updated");
  const recalc = useMutate<void>(() => api(`/api/orders/${id}/recalculate`, { method: "POST" }), "Recalculated with current prices");
  const repeat = useMutate<void, { id: string }>(() => api(`/api/orders/${id}/repeat`, { method: "POST" }), "Order repeated");
  const remove = useMutate<void>(() => api(`/api/orders/${id}`, { method: "DELETE" }), "Order deleted");
  const addService = useMutate<NonNullable<typeof svc>>((s) => api(`/api/orders/${id}/services`, { method: "POST", json: s }), "Service added");

  if (isLoading || !o) return <ListSkeleton rows={6} />;
  const dates = parseJson<Record<string, string>>(o.statusDates, {});
  const stepIdx = STEPPER.indexOf(o.status as (typeof STEPPER)[number]);
  const offStepper = stepIdx < 0;
  const grams = o.materials.reduce((a, x) => a + x.grams, 0);
  const shareUrl = cfg ? `${cfg.publicBaseUrl}/public/order/${o.clientLinkToken}` : "";
  const docLink = (type: string) => `/en/documents?create=${type}&order=${o.id}`;

  const costLines: [string, number][] = ([
    ["Material", o.costMaterial], ["Electricity", o.costElectricity], ["Printer", o.costPrinter], ["Dryer", o.costDryer],
    ["Labor", o.costLabor], ["Warehouse items", o.costWarehouse], ["Consumables", o.costConsumables],
    ["Post-processing", o.costPostprocessing], ["Packaging", o.costPackaging], ["Delivery", o.costDelivery], ["Other and services", o.costOther],
  ] as [string, number][]).filter(([, v]) => v > 0.0049);

  return (
    <div className="max-w-6xl">
      <Link href="/en/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Back to list</Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{o.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={o.status} /> {dateDot(o.saleDate)} · #{o.number}
            {o.personalUse && <span>· personal use</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={docLink("quote")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm hover:bg-card-2"><Eye className="size-4" /> Preview</Link>
          {o.slicerFileUrl && <a href={o.slicerFileUrl} download className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm hover:bg-card-2"><Download className="size-4" /> Slicer file</a>}
          <Button onClick={() => recalc.mutate()} loading={recalc.isPending}><RefreshCw className="size-4" /> Recalculate</Button>
          <Button onClick={() => repeat.mutate(undefined, { onSuccess: (n) => router.push(`/en/orders/${n.id}`) })}><Repeat className="size-4" /> Repeat order</Button>
          <Button size="icon" aria-label="Print QR" onClick={() => printQr(o.number, o.name)}><QrCode className="size-4" /></Button>
          <Button size="icon" variant="ghost" aria-label="Delete order" onClick={() => confirm(`Delete order "${o.name}"? Stock used by it is returned.`) && remove.mutate(undefined, { onSuccess: () => router.push("/en/orders") })}>
            <Trash2 className="size-5 text-red-500" />
          </Button>
        </div>
      </div>

      {/* stepper */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <ol className="flex min-w-0 flex-1 items-start overflow-x-auto pb-1">
            {STEPPER.map((key, i) => {
              const done = !offStepper && i <= stepIdx;
              const st = STATUSES.find((s) => s.key === key)!;
              return (
                <li key={key} className="flex min-w-20 flex-1 flex-col items-center gap-1 text-center">
                  <div className="flex w-full items-center">
                    <span className={cn("h-0.5 flex-1", i === 0 ? "opacity-0" : done ? "bg-accent" : "bg-border")} />
                    <button
                      type="button"
                      onClick={() => setStatus.mutate(key)}
                      aria-label={`Set status ${st.label}`}
                      className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs", done ? "border-accent bg-accent text-accent-fg" : "border-border text-muted")}
                    >
                      {done ? <Check className="size-4" /> : i + 1}
                    </button>
                    <span className={cn("h-0.5 flex-1", i === STEPPER.length - 1 ? "opacity-0" : !offStepper && i < stepIdx ? "bg-accent" : "bg-border")} />
                  </div>
                  <span className={cn("text-xs", done ? "text-fg" : "text-muted")}>{st.label}</span>
                  <span className="text-[11px] text-muted">{dates[key] ? dateShort(dates[key]) : "—"}</span>
                </li>
              );
            })}
          </ol>
          <Select className="w-44" aria-label="Status" value={o.status} onChange={(e) => setStatus.mutate(e.target.value)}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Revenue" value={m(o.revenue)} sub={o.tips > 0 ? `incl. ${m(o.tips)} tips` : undefined} />
        <Kpi label="Profit" value={<span className={o.profit >= 0 ? "text-green-500" : "text-red-500"}>{m(o.profit)}</span>} />
        <Kpi label="Net profit" value={m(o.netProfit)} sub={`Margin ${pct(o.marginPct)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card title="Model breakdown">
            <div className="font-medium">{o.name}</div>
            <div className="text-sm text-muted">{o.quantity} pcs · {Math.round(grams * 100) / 100} g</div>
            <div className="text-sm text-muted">Material {m(o.costMaterial)} · Equipment {m(o.costElectricity + o.costPrinter + o.costDryer)}</div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-muted">Revenue</dt><dd>{m(o.revenue)}</dd></div>
              <div><dt className="text-xs text-muted">Cost</dt><dd>{m(o.totalCost)}</dd></div>
              <div><dt className="text-xs text-muted">Profit/pc</dt><dd>{m(o.profit / Math.max(1, o.quantity))}</dd></div>
            </dl>
          </Card>

          <Card title="Material & equipment">
            <div className="space-y-1.5 text-sm">
              {o.materials.length === 0 && <p className="text-muted">No material</p>}
              {o.materials.map((x) => (
                <div key={x.id} className="flex items-center gap-2"><ColorDot color={x.color} /><span className="flex-1 truncate">{x.name}</span><span className="tabular-nums">{Math.round(x.grams * 100) / 100} g</span></div>
              ))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
              <dt className="text-muted">Usage</dt><dd className="text-right">{Math.round(grams * 100) / 100} g {o.materialDeducted ? "· taken from stock" : ""}</dd>
              <dt className="text-muted">Printer</dt><dd className="text-right">{printerName(o.printer)}</dd>
              {o.dryer && <><dt className="text-muted">Dryer</dt><dd className="text-right">{o.dryer.name}</dd></>}
              <dt className="text-muted">Print time</dt><dd className="text-right">{duration(o.printTimeMin * o.quantity)}</dd>
              <dt className="text-muted">Quantity</dt><dd className="text-right">{o.quantity}</dd>
              <dt className="text-muted">Assembly quantity</dt>
              <dd className="flex justify-end"><NumberInput className="h-9 w-20 text-right" value={o.assemblyQuantity} onChange={() => {}} onBlur={(e) => patch.mutate({ assemblyQuantity: parseFloat(e.target.value) || 1 })} /></dd>
            </dl>
          </Card>

          <Card title="Cost breakdown">
            <div className="space-y-1 text-sm">
              {costLines.map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{m(v)}</span></div>)}
              {o.services.map((s) => <div key={s.id} className="flex justify-between pl-2 text-xs text-muted"><span>{s.name}</span><span>{m(s.cost)} → {m(s.mode === "markup" ? s.cost * (1 + s.price / 100) : s.price)}</span></div>)}
              <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Total cost</span><span>{m(o.totalCost)}</span></div>
              <Button size="sm" className="my-2" onClick={() => setSvc({ name: "", cost: 0, mode: "fixed", price: 0 })}><Plus className="size-4" /> Add service to order</Button>
              {o.discountAmount > 0.005 && <div className="flex justify-between text-muted"><span>Discount</span><span>−{m(o.discountAmount)}</span></div>}
              <div className="flex justify-between font-semibold"><span>Sale price</span><span className="text-accent">{m(o.salePrice)}</span></div>
              {o.taxAmount > 0 && <div className="flex justify-between text-muted"><span>Tax</span><span>{m(o.taxAmount)}</span></div>}
              {o.marketplaceFee > 0 && <div className="flex justify-between text-muted"><span>Marketplace fee</span><span>{m(o.marketplaceFee)}</span></div>}
              {o.acquiringFee > 0 && <div className="flex justify-between text-muted"><span>Acquiring</span><span>{m(o.acquiringFee)}</span></div>}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span>Tips</span>
                <NumberInput className="h-9 w-28 text-right" value={o.tips} onChange={() => {}} onBlur={(e) => {
                  const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                  if (v !== o.tips) patch.mutate({ tips: v });
                }} />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Client">
            {o.client ? <Link href={`/en/clients/${o.client.id}`} className="font-medium text-accent hover:underline">{o.client.name}</Link> : <span className="text-muted">No client</span>}
            <div className="mt-2 divide-y divide-border">
              <Switch label="Paid" checked={o.paid} onChange={(v) => patch.mutate({ paid: v })} />
              <Switch label="Advance received" checked={o.advanceReceivedOn} onChange={(v) => patch.mutate({ advanceReceivedOn: v })} />
              <Switch label="Tips received" checked={o.tipsReceived} onChange={(v) => patch.mutate({ tipsReceived: v })} />
            </div>
            <Field label="Tracking number" className="mt-2">
              <div className="flex gap-2">
                <Input value={tracking ?? o.trackingNumber} onChange={(e) => setTracking(e.target.value)} placeholder="—" />
                <Button aria-label="Save tracking number" disabled={tracking === null || tracking === o.trackingNumber} onClick={() => patch.mutate({ trackingNumber: tracking! }, { onSuccess: () => setTracking(null) })}><Truck className="size-4" /></Button>
              </div>
            </Field>
            <div className="mt-3 border-t border-border pt-3">
              <Button
                className="w-full"
                disabled={!cfg?.shareLinksEnabled}
                title={cfg?.shareLinksEnabled ? undefined : "Needs a public URL"}
                onClick={() => navigator.clipboard.writeText(shareUrl).then(() => toast.success("Client link copied"))}
              >
                <Link2 className="size-4" /> Link for client
              </Button>
              {!cfg?.shareLinksEnabled && <p className="mt-1 text-xs text-muted">Needs a public URL. Set PUBLIC_BASE_URL (see the local build guide, Cloudflare Tunnel).</p>}
            </div>
          </Card>

          <Card title="Order QR code">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt={`QR code for order ${o.number}`} className="size-28 rounded-lg bg-white p-1" />}
              <div className="text-sm">
                <div className="font-mono text-lg">{o.number}</div>
                <p className="text-muted">Search this code on the orders screen to find this order.</p>
                <Button size="sm" className="mt-2" onClick={() => navigator.clipboard.writeText(o.number).then(() => toast.success("Copied"))}><Copy className="size-4" /> Copy</Button>
              </div>
            </div>
          </Card>

          <Card title="Documents">
            <div className="flex flex-wrap gap-2">
              <Link href={docLink("quote")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-card-2"><FileText className="size-4" /> Quote</Link>
              <Link href={docLink("invoice")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-card-2"><FileText className="size-4" /> Invoice</Link>
              <Link href={docLink("delivery_note")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-card-2"><FileText className="size-4" /> Delivery note</Link>
            </div>
            {o.documents.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {o.documents.map((d) => <li key={d.id}><a className="text-accent hover:underline" href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noreferrer">{d.number}</a></li>)}
              </ul>
            )}
          </Card>

          {o.notes && <Card title="Notes"><p className="text-sm whitespace-pre-wrap">{o.notes}</p></Card>}
        </div>
      </div>

      <Dialog open={!!svc} onClose={() => setSvc(null)} title="Add service to order" footer={
        <Button variant="primary" disabled={!svc?.name.trim()} loading={addService.isPending} onClick={() => addService.mutate(svc!, { onSuccess: () => setSvc(null) })}>Add</Button>
      }>
        {svc && (
          <>
            <Field label="Service name"><Input autoFocus value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Cost"><NumberInput value={svc.cost} onChange={(v) => setSvc({ ...svc, cost: v })} /></Field>
              <Field label="Price mode">
                <Select value={svc.mode} onChange={(e) => setSvc({ ...svc, mode: e.target.value as "fixed" | "markup" })}><option value="fixed">Fixed</option><option value="markup">Markup %</option></Select>
              </Field>
              <Field label={svc.mode === "fixed" ? "Sale price" : "Markup %"}><NumberInput value={svc.price} onChange={(v) => setSvc({ ...svc, price: v })} /></Field>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
