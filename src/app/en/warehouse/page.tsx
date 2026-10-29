"use client";
// Warehouse, main doc 6.9 and 5.8.
import { ArrowLeft, Box, ChevronRight, Eye, EyeOff, History, KeyRound, Package, Palette, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CsvTools } from "@/components/csv-tools";
import { DataTable, useLocal } from "@/components/data-table";
import {
  Button, Card, Dialog, EmptyState, Field, Input, ListSkeleton, NumberInput, PageHeader, PhotoInput, Segmented, Select, deleteWithUndo,
} from "@/components/ui";
import { api, useCurrency, useList, useMutate, useQueryState, useRemove, useSave } from "@/lib/client";
import { emptyCalc } from "@/lib/calc";
import { num, toCsv } from "@/lib/csv";
import { dateUS, money } from "@/lib/format";
import type { Client, Filament } from "@/lib/types";

type Item = { id: string; shelfId: string; name: string; quantity: number; unitCost: number };
type Good = Item & { unitPrice: number; photoUrl: string | null; description: string; modelId: string | null };
type Shelf = {
  id: string; name: string; icon: string; link: string; builtIn: boolean; kind: string; hidden: boolean;
  photoUrl: string | null; items: Item[]; goods: Good[];
};
type WriteOff = { id: string; kind: string; name: string; quantity: number; reason: string; createdAt: string };

// CSV per shelf: finished models also carry a sale price and description
const ITEM_COLUMNS = ["name", "quantity", "unitCost"];
const GOOD_COLUMNS = [...ITEM_COLUMNS, "unitPrice", "description"];

const ICONS: Record<string, typeof Box> = { spool: Package, key: KeyRound, palette: Palette, box: Box };
const ShelfIcon = ({ s }: { s: Shelf }) => {
  const I = ICONS[s.icon] ?? Package;
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><I className="size-5" /></span>;
};

export default function WarehousePage() {
  const { data, isLoading } = useList<Shelf>("shelves");
  const { data: filaments = [] } = useList<Filament>("filaments");
  const currency = useCurrency();
  const router = useRouter();
  const [open, setOpen] = useQueryState("shelf", "");
  const [view, setView] = useLocal<"table" | "cards">("warehouse:view", "cards");
  const [showHidden, setShowHidden] = useState(false);
  const [newShelf, setNewShelf] = useState<Partial<Shelf> | null>(null);
  const [writeOffs, setWriteOffs] = useState(false);
  const save = useSave<Shelf>("shelves", "Shelf saved");

  const shelves = data ?? [];
  const totals = (s: Shelf) => {
    if (s.kind === "filaments")
      return {
        qty: filaments.reduce((a, f) => a + f.spoolCount, 0),
        value: filaments.reduce((a, f) => a + (Math.max(0, f.stockG) / f.spoolWeightG) * f.spoolPrice, 0),
      };
    const list = s.kind === "finished" ? s.goods : s.items;
    return { qty: list.reduce((a, i) => a + i.quantity, 0), value: list.reduce((a, i) => a + i.quantity * i.unitCost, 0) };
  };
  const shelf = shelves.find((s) => s.id === open);
  if (shelf) return <ShelfView shelf={shelf} onBack={() => setOpen("")} />;

  const visible = shelves.filter((s) => showHidden || !s.hidden);
  const openShelf = (s: Shelf) => (s.kind === "filaments" ? router.push("/en/filaments") : setOpen(s.id));

  return (
    <div>
      <PageHeader
        title="Stocks"
        subtitle="Filaments, finished models, packaging and custom shelves"
        actions={
          <>
            <Button onClick={() => setWriteOffs(true)}><History className="size-4" /> Write-offs</Button>
            <Button size="icon" aria-label={showHidden ? "Hide hidden shelves" : "Show hidden shelves"} onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button variant="primary" onClick={() => setNewShelf({ name: "", icon: "", link: "", photoUrl: null })}><Plus className="size-4" /> New shelf</Button>
          </>
        }
      />
      <div className="mb-3 flex justify-end">
        <Segmented value={view} onChange={setView} options={[{ value: "cards", label: "Grid" }, { value: "table", label: "Table" }]} />
      </div>
      {isLoading ? <ListSkeleton /> : (
        <DataTable
          id="warehouse"
          view={view}
          rows={visible}
          rowKey={(s) => s.id}
          onRowClick={openShelf}
          rowClass={(s) => (s.hidden ? "opacity-60" : "")}
          card={(s) => (
            <div className="flex items-center gap-3">
              <ShelfIcon s={s} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-muted">{`${Math.round(totals(s).qty * 100) / 100} pcs · ${money(totals(s).value, currency, true)}`}</div>
              </div>
              <ChevronRight className="size-5 text-muted" />
            </div>
          )}
          columns={[
            { key: "name", header: "Shelf", fixed: true, cell: (s) => (
              <div className="flex items-center gap-3"><ShelfIcon s={s} /><span className="font-medium">{s.name}</span></div>
            ) },
            { key: "type", header: "Type", cell: (s) => (s.builtIn ? "Built-in shelf" : "Custom shelf") },
            { key: "qty", header: "Quantity", sort: (s) => totals(s).qty, cell: (s) => `${Math.round(totals(s).qty * 100) / 100} pcs` },
            { key: "value", header: "Total value", sort: (s) => totals(s).value, cell: (s) => money(totals(s).value, currency, true) },
            { key: "hide", header: "", fixed: true, cell: (s) => (
              <Button size="icon" variant="ghost" aria-label={s.hidden ? "Show shelf" : "Hide shelf"} onClick={(e) => { e.stopPropagation(); save.mutate({ id: s.id, hidden: !s.hidden }); }}>
                {s.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </Button>
            ) },
          ]}
        />
      )}

      <Dialog open={!!newShelf} onClose={() => setNewShelf(null)} title="New shelf" footer={
        <>
          <Button onClick={() => setNewShelf(null)}>Cancel</Button>
          <Button variant="primary" disabled={!newShelf?.name?.trim()} onClick={() => save.mutate({ name: newShelf!.name, icon: newShelf!.icon, link: newShelf!.link, photoUrl: newShelf!.photoUrl, kind: "custom" }, { onSuccess: () => setNewShelf(null) })}>Save</Button>
        </>
      }>
        {newShelf && (
          <>
            <PhotoInput value={newShelf.photoUrl} onChange={(u) => setNewShelf({ ...newShelf, photoUrl: u })} />
            <Field label="Icon">
              <Select value={newShelf.icon} onChange={(e) => setNewShelf({ ...newShelf, icon: e.target.value })}>
                <option value="">No icon</option><option value="box">Box</option><option value="key">Key ring</option><option value="palette">Palette</option><option value="spool">Package</option>
              </Select>
            </Field>
            <Field label="Name *"><Input value={newShelf.name} onChange={(e) => setNewShelf({ ...newShelf, name: e.target.value })} placeholder="e.g. Packaging" /></Field>
            <Field label="Link" hint="Where to restock, optional"><Input type="url" value={newShelf.link} onChange={(e) => setNewShelf({ ...newShelf, link: e.target.value })} /></Field>
          </>
        )}
      </Dialog>
      <WriteOffsDialog open={writeOffs} onClose={() => setWriteOffs(false)} />
    </div>
  );
}

function WriteOffsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data = [] } = useList<WriteOff>("write-offs");
  return (
    <Dialog open={open} onClose={onClose} title="Write-offs">
      {data.length === 0 && <p className="text-sm text-muted">Nothing written off yet.</p>}
      {data.map((w) => (
        <div key={w.id} className="flex justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
          <div><div>{w.name || w.kind}</div><div className="text-xs text-muted">{w.reason || "No reason"} · {dateUS(w.createdAt)}</div></div>
          <span className="tabular-nums">−{w.quantity}{w.kind === "filament" ? " g" : " pcs"}</span>
        </div>
      ))}
    </Dialog>
  );
}

function ShelfView({ shelf, onBack }: { shelf: Shelf; onBack: () => void }) {
  const currency = useCurrency();
  const router = useRouter();
  const finished = shelf.kind === "finished";
  const entity = finished ? "finished-goods" : "shelf-items";
  const save = useSave<Good>(entity);
  const remove = useRemove(entity);
  const saveShelf = useSave<Shelf>("shelves");
  const removeShelf = useRemove("shelves", "Shelf deleted");
  const { data: clients = [] } = useList<Client>("clients");
  const [form, setForm] = useState<Partial<Good> | null>(null);
  const [sell, setSell] = useState<{ good: Good; qty: number; clientId: string; price: number } | null>(null);
  const [writeOff, setWriteOff] = useState<{ good: Item; qty: number; reason: string } | null>(null);
  const list: Item[] = finished ? shelf.goods : shelf.items;

  const sellMut = useMutate<NonNullable<typeof sell>, { id: string }>(
    (s) => api("/api/orders", {
      method: "POST",
      json: {
        calc: {
          ...emptyCalc(), name: s.good.name, modelSource: "stock", finishedGoodId: s.good.id, modelId: s.good.modelId, quantity: s.qty,
          clientId: s.clientId || null, priceMode: "price", targetPrice: s.price, status: "done", saleDate: new Date().toISOString(),
        },
      },
    }),
    "Sold from stock",
  );
  const writeOffMut = useMutate<NonNullable<typeof writeOff>>(
    (w) => api("/api/write-offs", { method: "POST", json: { kind: finished ? "finished" : "other", refId: w.good.id, name: w.good.name, quantity: w.qty, reason: w.reason } }),
    "Written off",
  );
  const itemWriteOff = useMutate<NonNullable<typeof writeOff>>(async (w) => {
    await api(`/api/shelf-items/${w.good.id}`, { method: "PATCH", json: { quantity: Math.max(0, w.good.quantity - w.qty) } });
    await api("/api/write-offs", { method: "POST", json: { kind: "other", refId: w.good.id, name: w.good.name, quantity: w.qty, reason: w.reason } });
  }, "Written off");

  return (
    <div className="max-w-4xl">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Stocks</button>
      <PageHeader
        title={shelf.name}
        subtitle={`${list.reduce((a, i) => a + i.quantity, 0)} pcs · ${money(list.reduce((a, i) => a + i.quantity * i.unitCost, 0), currency)}`}
        actions={
          <>
            {shelf.link && <a href={shelf.link} target="_blank" rel="noreferrer" className="text-sm text-accent">Restock link</a>}
            {!shelf.builtIn && (
              <Button variant="ghost" onClick={() => deleteWithUndo(shelf.name, () => removeShelf.mutate(shelf.id, { onSuccess: onBack }))}><Trash2 className="size-4 text-red-500" /> Delete shelf</Button>
            )}
            <CsvTools
              name={shelf.name.toLowerCase().replace(/\s+/g, "-")}
              label="items"
              columns={finished ? GOOD_COLUMNS : ITEM_COLUMNS}
              toCsv={() => toCsv(finished ? GOOD_COLUMNS : ITEM_COLUMNS, list.map((i) => (finished ? GOOD_COLUMNS : ITEM_COLUMNS).map((k) => (i as Good)[k as keyof Good])))}
              onImport={async (rows) => {
                const named = rows.filter((r) => r.name);
                for (const r of named) {
                  await api(finished ? "/api/finished-goods" : "/api/shelf-items", {
                    method: "POST",
                    json: {
                      shelfId: shelf.id, name: r.name, quantity: num(r.quantity), unitCost: num(r.unitCost),
                      ...(finished ? { unitPrice: num(r.unitPrice), description: r.description ?? "" } : {}),
                    },
                  });
                }
                return named.length;
              }}
            />
            <Button variant="primary" onClick={() => setForm({ shelfId: shelf.id, name: "", quantity: 1, unitCost: 0, unitPrice: 0 })}><Plus className="size-4" /> Add item</Button>
          </>
        }
      />
      {finished && <p className="mb-3 text-sm text-muted">Use “Save to stocks” in the calculator to add printed models here with their real cost.</p>}
      {list.length === 0 ? <EmptyState text="No items on this shelf" /> : (
        <div className="space-y-2">
          {list.map((i) => (
            <Card key={i.id} bodyClass="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setForm(i)}>
                <div className="font-medium">{i.name}</div>
                <div className="text-sm text-muted">
                  {i.quantity} pcs · {money(i.unitCost, currency)} each{finished ? ` · sells for ${money((i as Good).unitPrice, currency)}` : ""}
                </div>
              </div>
              {finished && (
                <Button size="sm" variant="primary" disabled={i.quantity <= 0} onClick={() => setSell({ good: i as Good, qty: 1, clientId: "", price: (i as Good).unitPrice })}>
                  <ShoppingCart className="size-4" /> Sell
                </Button>
              )}
              <Button size="sm" disabled={i.quantity <= 0} onClick={() => setWriteOff({ good: i, qty: 1, reason: "" })}>Write off</Button>
              <Button size="icon" variant="ghost" aria-label={`Delete ${i.name}`} onClick={() => deleteWithUndo(i.name, () => remove.mutate(i.id))}><Trash2 className="size-4 text-red-500" /></Button>
            </Card>
          ))}
        </div>
      )}
      {!shelf.builtIn && (
        <Button className="mt-4" variant="ghost" onClick={() => saveShelf.mutate({ id: shelf.id, hidden: !shelf.hidden })}>{shelf.hidden ? "Show shelf" : "Hide shelf"}</Button>
      )}

      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit item" : "Add item"} footer={
        <Button variant="primary" disabled={!form?.name?.trim()} onClick={() => {
          const { id, name, quantity, unitCost, unitPrice } = form!;
          save.mutate({ id, name, quantity, unitCost, ...(finished ? { unitPrice } : {}), ...(id ? {} : { shelfId: shelf.id }) }, { onSuccess: () => setForm(null) });
        }}>Save</Button>
      }>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Quantity"><NumberInput value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} /></Field>
            <Field label="Unit cost"><NumberInput value={form.unitCost} onChange={(v) => setForm({ ...form, unitCost: v })} /></Field>
            {finished && <Field label="Unit price"><NumberInput value={form.unitPrice} onChange={(v) => setForm({ ...form, unitPrice: v })} /></Field>}
          </div>
        )}
      </Dialog>

      <Dialog open={!!sell} onClose={() => setSell(null)} title={`Sell ${sell?.good.name ?? ""}`} footer={
        <Button variant="primary" loading={sellMut.isPending} onClick={() => sellMut.mutate(sell!, { onSuccess: (o) => router.push(`/en/orders/${o.id}`) })}>Create sale</Button>
      }>
        {sell && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Quantity (max ${sell.good.quantity})`}>
                <NumberInput value={sell.qty} onChange={(v) => { const qty = Math.max(1, Math.min(sell.good.quantity, Math.round(v) || 1)); setSell({ ...sell, qty, price: sell.good.unitPrice * qty }); }} />
              </Field>
              <Field label="Price"><NumberInput value={sell.price} onChange={(v) => setSell({ ...sell, price: v })} /></Field>
            </div>
            <Field label="Client">
              <Select value={sell.clientId} onChange={(e) => setSell({ ...sell, clientId: e.target.value })}>
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </>
        )}
      </Dialog>

      <Dialog open={!!writeOff} onClose={() => setWriteOff(null)} title={`Write off ${writeOff?.good.name ?? ""}`} footer={
        <Button variant="danger" onClick={() => (finished ? writeOffMut : itemWriteOff).mutate(writeOff!, { onSuccess: () => setWriteOff(null) })}>Write off</Button>
      }>
        {writeOff && (
          <>
            <Field label={`Quantity (max ${writeOff.good.quantity})`}><NumberInput value={writeOff.qty} onChange={(v) => setWriteOff({ ...writeOff, qty: Math.min(writeOff.good.quantity, v) })} /></Field>
            <Field label="Reason"><Input value={writeOff.reason} onChange={(e) => setWriteOff({ ...writeOff, reason: e.target.value })} placeholder="Broken, gift, personal use…" /></Field>
          </>
        )}
      </Dialog>
    </div>
  );
}
