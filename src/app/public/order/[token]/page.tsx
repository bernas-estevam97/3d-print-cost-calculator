"use client";
// Read-only client view of an order (main doc 6.3). Reachable only once the app has a public URL.
import { Check } from "lucide-react";
import { useParams } from "next/navigation";
import { cn } from "@/components/ui";
import { useApi } from "@/lib/client";
import { dateDot, dateShort, money } from "@/lib/format";
import { parseJson } from "@/lib/json";
import { STATUSES, STEPPER, statusOf } from "@/lib/status";

type PublicOrder = {
  number: string; name: string; status: string; statusDates: string; quantity: number; salePrice: number; dueDate: string | null;
  saleDate: string; trackingNumber: string; paid: boolean; workshop: { name: string; settings: { currency: string } | null };
};

export default function PublicOrder() {
  const { token } = useParams<{ token: string }>();
  const { data: o, error } = useApi<PublicOrder>(`/api/public/order/${token}`);
  if (error) return <div className="flex min-h-dvh items-center justify-center p-4 text-muted">This link is not valid.</div>;
  if (!o) return <div className="flex min-h-dvh items-center justify-center p-4 text-muted">Loading…</div>;
  const dates = parseJson<Record<string, string>>(o.statusDates, {});
  const idx = STEPPER.indexOf(o.status as (typeof STEPPER)[number]);
  const currency = o.workshop.settings?.currency ?? "EUR";
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 py-10">
      <div className="text-sm text-muted">{o.workshop.name}</div>
      <h1 className="text-2xl font-bold">{o.name}</h1>
      <div className="text-sm text-muted">Order #{o.number} · {dateDot(o.saleDate)}</div>
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 font-medium">Status: {statusOf(o.status).label}</div>
        <ol className="space-y-2">
          {STEPPER.map((k, i) => {
            const done = idx >= 0 && i <= idx;
            return (
              <li key={k} className="flex items-center gap-3 text-sm">
                <span className={cn("flex size-6 items-center justify-center rounded-full border-2", done ? "border-accent bg-accent text-accent-fg" : "border-border")}>
                  {done && <Check className="size-3.5" />}
                </span>
                <span className={done ? "" : "text-muted"}>{STATUSES.find((s) => s.key === k)!.label}</span>
                <span className="ml-auto text-xs text-muted">{dates[k] ? dateShort(dates[k]) : "—"}</span>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="space-y-1 rounded-2xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between"><span>Quantity</span><span>{o.quantity}</span></div>
        <div className="flex justify-between font-semibold"><span>Price</span><span>{money(o.salePrice, currency)}</span></div>
        <div className="flex justify-between"><span>Payment</span><span>{o.paid ? "Paid" : "Not paid yet"}</span></div>
        {o.dueDate && <div className="flex justify-between"><span>Due</span><span>{dateDot(o.dueDate)}</span></div>}
        {o.trackingNumber && <div className="flex justify-between"><span>Tracking</span><span className="font-mono">{o.trackingNumber}</span></div>}
      </section>
    </main>
  );
}
