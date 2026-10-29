"use client";
// Documents, main doc 6.12: quote, invoice, receipt, delivery note (+ generic contract / completion act).
import { Download, FileCheck, FileSignature, FileText, Plus, Receipt, ScrollText, Trash2, Truck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Dialog, EmptyState, Field, Input, ListSkeleton, NumberInput, PageHeader, PhotoInput, Segmented, Select, Textarea } from "@/components/ui";
import { api, useApi, useCurrency, useList, useMutate, useQueryState } from "@/lib/client";
import { dateInput, dateUS, money } from "@/lib/format";
import type { Client, Order } from "@/lib/types";

type Doc = { id: string; type: string; number: string; amount: number; createdAt: string; clientId: string | null; client: { name: string } | null; order: { id: string; name: string; number: string } | null };
type Item = { name: string; qty: number; price: number; vatPct: number };
type Company = { companyName: string; taxId: string; address: string; phone: string; email: string; signer: string; signerTitle: string; bankName: string; bic: string; bankAccount: string; logoUrl: string | null; signatureUrl: string | null };

const CARDS = [
  { type: "quote", title: "Commercial proposal", sub: "Pricing for work and materials", icon: FileText },
  { type: "contract", title: "Contract", sub: "Template for 3D printing work", icon: FileSignature },
  { type: "receipt", title: "Payment receipt", sub: "Simple receipt without a cash register", icon: Receipt },
  { type: "invoice", title: "Invoice", sub: "Bank details, amount, VAT", icon: ScrollText },
  { type: "delivery_note", title: "Delivery note", sub: "For shipping goods", icon: Truck },
  { type: "completion_act", title: "Certificate of completion", sub: "Closes the deal with a business client", icon: FileCheck },
];
const titleOf = (t: string) => CARDS.find((c) => c.type === t)?.title ?? t;

function CreateDialog({ type, orderId, onClose }: { type: string | null; orderId: string; onClose: () => void }) {
  const { data: clients = [] } = useList<Client>("clients");
  const { data: orders = [] } = useList<Order>("orders");
  const currency = useCurrency();
  const [f, setF] = useState({ clientId: "", orderId: "", date: dateInput(new Date()), notes: "", items: [] as Item[] });
  const create = useMutate<typeof f & { type: string }, { id: string }>((d) => api("/api/documents", { method: "POST", json: d }), "Document created");

  const fromOrder = (id: string, base = f) => {
    const o = orders.find((x) => x.id === id);
    if (!o) return setF({ ...base, orderId: "" });
    const q = Math.max(1, o.quantity);
    const net = o.salePrice - o.taxAmount;
    setF({
      ...base,
      orderId: id,
      clientId: o.client?.id ?? base.clientId,
      items: [{ name: o.name, qty: q, price: Math.round((net / q) * 100) / 100, vatPct: net > 0 ? Math.round((o.taxAmount / net) * 1000) / 10 : 0 }],
    });
  };
  // prefill when opened from an order (?order=)
  useEffect(() => {
    if (!type) return;
    const base = { clientId: "", orderId: "", date: dateInput(new Date()), notes: "", items: [{ name: "", qty: 1, price: 0, vatPct: 0 }] };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form for each new document
    if (orderId && orders.length) fromOrder(orderId, base);
    else setF(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, orderId, orders.length]);

  const net = f.items.reduce((a, i) => a + i.qty * i.price, 0);
  const vat = f.items.reduce((a, i) => a + i.qty * i.price * (i.vatPct / 100), 0);
  const setItem = (k: number, p: Partial<Item>) => setF({ ...f, items: f.items.map((x, i) => (i === k ? { ...x, ...p } : x)) });

  return (
    <Dialog open={!!type} onClose={onClose} title={titleOf(type ?? "")} wide footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={create.isPending} disabled={!f.items.some((i) => i.name.trim())} onClick={() =>
          create.mutate({ ...f, type: type!, items: f.items.filter((i) => i.name.trim()) }, {
            onSuccess: (d) => { window.open(`/api/documents/${d.id}/pdf`, "_blank"); onClose(); },
          })
        }>Create and preview PDF</Button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Client">
          <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
            <option value="">No client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Order" hint="Fills the lines from the order">
          <Select value={f.orderId} onChange={(e) => fromOrder(e.target.value)}>
            <option value="">No order</option>
            {orders.filter((o) => !f.clientId || o.client?.id === f.clientId).map((o) => <option key={o.id} value={o.id}>{o.name} · #{o.number}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </div>
      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_70px_100px_70px_40px] gap-2 text-xs text-muted sm:grid"><span>Item</span><span>Qty</span><span>Price</span><span>VAT %</span><span /></div>
        {f.items.map((i, k) => (
          <div key={k} className="grid grid-cols-[1fr_70px_100px_70px_40px] gap-2">
            <Input aria-label="Item" value={i.name} onChange={(e) => setItem(k, { name: e.target.value })} />
            <NumberInput aria-label="Quantity" value={i.qty} onChange={(v) => setItem(k, { qty: v })} />
            <NumberInput aria-label="Price" value={i.price} onChange={(v) => setItem(k, { price: v })} />
            <NumberInput aria-label="VAT %" value={i.vatPct} onChange={(v) => setItem(k, { vatPct: v })} />
            <Button size="icon" variant="ghost" aria-label="Remove line" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== k) })}><X className="size-4" /></Button>
          </div>
        ))}
        <Button size="sm" onClick={() => setF({ ...f, items: [...f.items, { name: "", qty: 1, price: 0, vatPct: f.items[0]?.vatPct ?? 0 }] })}><Plus className="size-4" /> Add line</Button>
      </div>
      <div className="ml-auto w-60 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(net, currency)}</span></div>
        <div className="flex justify-between"><span>VAT</span><span>{money(vat, currency)}</span></div>
        <div className="flex justify-between font-semibold"><span>Total</span><span>{money(net + vat, currency)}</span></div>
      </div>
      <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Dialog>
  );
}

function CompanyTab() {
  const { data } = useApi<Company>("/api/company-details");
  const save = useMutate<Partial<Company>>((c) => api("/api/company-details", { method: "PUT", json: c }), "Company details saved");
  const [c, setC] = useState<Company | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- edit a copy of the loaded details
  useEffect(() => { if (data && !c) setC(data); }, [data, c]);
  if (!c) return <ListSkeleton />;
  const f = (k: keyof Company, label: string) => <Field label={label}><Input value={(c[k] as string) ?? ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></Field>;
  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Logo and signature">
        <div className="grid gap-4 sm:grid-cols-2">
          <PhotoInput label="Logo" value={c.logoUrl} onChange={(u) => { setC({ ...c, logoUrl: u }); save.mutate({ logoUrl: u }); }} />
          <PhotoInput label="Signature" value={c.signatureUrl} onChange={(u) => { setC({ ...c, signatureUrl: u }); save.mutate({ signatureUrl: u }); }} />
        </div>
        <p className="mt-2 text-xs text-muted">PNG or JPG, up to 10 MB. A transparent PNG signature looks best.</p>
      </Card>
      <Card title="General">
        <div className="grid gap-3 sm:grid-cols-2">
          {f("companyName", "Company name")}{f("taxId", "Tax ID")}{f("address", "Address")}{f("phone", "Phone")}{f("email", "Email")}{f("signer", "Signer")}{f("signerTitle", "Signer title")}
        </div>
      </Card>
      <Card title="Bank">
        <div className="grid gap-3 sm:grid-cols-2">{f("bankName", "Bank name")}{f("bic", "BIC / SWIFT")}{f("bankAccount", "Account / IBAN")}</div>
      </Card>
      <div className="flex justify-end">
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(c)}>Save</Button>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const [tab, setTab] = useQueryState("tab", "documents");
  const [create, setCreate] = useQueryState("create", "");
  const [orderParam] = useQueryState("order", "");
  const router = useRouter();
  const { data: docs, isLoading } = useList<Doc>("documents");
  const currency = useCurrency();
  const remove = useMutate<string>((id) => api(`/api/documents/${id}`, { method: "DELETE" }), "Document deleted");
  const [type, setType] = useState("");
  const [client, setClient] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const all = docs ?? [];
  const rows = all.filter((d) => (!type || d.type === type) && (!client || (d.client?.name ?? "No client") === client) && (!from || d.createdAt.slice(0, 10) >= from) && (!to || d.createdAt.slice(0, 10) <= to));
  const groups = [...new Set(rows.map((d) => d.client?.name ?? "No client"))];

  return (
    <div>
      <PageHeader title="Documents" />
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: "documents", label: "Documents" }, { value: "company", label: "Company details" }]} /></div>
      {tab === "company" ? <CompanyTab /> : (
        <>
          <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Client documents</h2>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {CARDS.map((c) => (
              <div key={c.type} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><c.icon className="size-5" /></span>
                <div className="min-w-0 flex-1"><div className="font-medium">{c.title}</div><div className="text-xs text-muted">{c.sub}</div></div>
                <Button size="sm" onClick={() => setCreate(c.type)}>Create</Button>
              </div>
            ))}
          </div>

          <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Document folders</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <Select className="w-48" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {CARDS.map((c) => <option key={c.type} value={c.type}>{c.title}</option>)}
            </Select>
            <Select className="w-48" aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">All clients</option>
              {[...new Set(all.map((d) => d.client?.name ?? "No client"))].map((n) => <option key={n}>{n}</option>)}
            </Select>
            <Input type="date" aria-label="From" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" aria-label="To" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {isLoading ? <ListSkeleton /> : rows.length === 0 ? <EmptyState text="No documents yet" /> : (
            <div className="space-y-4">
              {groups.map((g) => {
                const list = rows.filter((d) => (d.client?.name ?? "No client") === g);
                return (
                  <Card key={g} title={`${g} · ${list.length}`} bodyClass="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-muted">{["Type", "Document number", "Created", "Amount", "Order", ""].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
                      <tbody>
                        {list.map((d) => (
                          <tr key={d.id} className="border-t border-border">
                            <td className="px-4 py-2">{titleOf(d.type)}</td>
                            <td className="px-4 py-2 font-mono"><a href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noreferrer" className="text-accent hover:underline">{d.number}</a></td>
                            <td className="px-4 py-2">{dateUS(d.createdAt)}</td>
                            <td className="px-4 py-2 tabular-nums">{money(d.amount, currency)}</td>
                            <td className="px-4 py-2">{d.order ? `#${d.order.number}` : "—"}</td>
                            <td className="px-4 py-2">
                              <div className="flex justify-end gap-1">
                                <a href={`/api/documents/${d.id}/pdf?download`} aria-label={`Download ${d.number}`} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-card-2"><Download className="size-4" /></a>
                                <Button size="icon" variant="ghost" aria-label={`Delete ${d.number}`} onClick={() => confirm(`Delete ${d.number}?`) && remove.mutate(d.id)}><Trash2 className="size-4 text-red-500" /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      <CreateDialog type={create || null} orderId={orderParam} onClose={() => router.replace("/en/documents", { scroll: false })} />
    </div>
  );
}
