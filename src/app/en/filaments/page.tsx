"use client";
// Warehouse > Filaments, main doc 6.10.
import { ChevronRight, CheckSquare, Plus, Scale, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CsvTools } from "@/components/csv-tools";
import { DataTable, useLocal } from "@/components/data-table";
import {
  Badge, Button, ColorDot, Dialog, EmptyState, Field, Input, ListSkeleton, NumberInput, PageHeader, PhotoInput, Segmented, Select, deleteWithUndo,
} from "@/components/ui";
import { api, useCurrency, useList, useMutate, useQueryState, useRemove, useSave } from "@/lib/client";
import { num, toCsv } from "@/lib/csv";
import { grams, money } from "@/lib/format";
import type { Filament } from "@/lib/types";

type CatalogItem = { id: string; kind: string; name: string };

const blank = (): Partial<Filament> => ({
  name: "", brand: "Bambu Lab", type: "PLA", modifier: null, purchaseLink: "", spoolPrice: 0, spoolWeightG: 1000, spoolCount: 1,
  usedFromSpoolG: 0, colors: ["#ffffff"], photoUrl: null, lowStockThresholdG: null,
});

// CSV: the editable fields; colors are space-separated hex codes. Older files with one "color" column still import.
// usedFromSpoolG is exported as everything used so far (manual + orders), so the imported copy shows the same stock.
const FILAMENT_FIELDS = ["name", "brand", "type", "modifier", "spoolPrice", "spoolWeightG", "spoolCount", "lowStockThresholdG", "purchaseLink"] as const;
const FILAMENT_COLUMNS = [...FILAMENT_FIELDS, "usedFromSpoolG", "colors"];
const filamentsCsv = (rows: Filament[]) =>
  toCsv(FILAMENT_COLUMNS, rows.map((f) => [...FILAMENT_FIELDS.map((k) => f[k]), f.spoolCount * f.spoolWeightG - f.stockG, f.colors.join(" ")]));

async function importFilaments(rows: Record<string, string>[]) {
  for (const r of rows) {
    const colors = (r.colors ?? r.color ?? "").split(/[\s|]+/).filter(Boolean).map((c) => (c.startsWith("#") ? c : `#${c}`));
    await api("/api/filaments", {
      method: "POST",
      json: {
        name: r.name ?? "", brand: r.brand ?? "", type: r.type || "PLA", modifier: r.modifier || null, purchaseLink: r.purchaseLink || null, colors,
        spoolPrice: num(r.spoolPrice), spoolWeightG: num(r.spoolWeightG, 1000), spoolCount: num(r.spoolCount, 1), usedFromSpoolG: num(r.usedFromSpoolG),
        lowStockThresholdG: r.lowStockThresholdG ? num(r.lowStockThresholdG) : null,
      },
    });
  }
  return rows.length;
}

function FilamentForm({ value, onChange, catalogs }: { value: Partial<Filament>; onChange: (f: Partial<Filament>) => void; catalogs: CatalogItem[] }) {
  const set = <K extends keyof Filament>(k: K, v: Filament[K]) => onChange({ ...value, [k]: v });
  const of = (kind: string) => catalogs.filter((c) => c.kind === kind).map((c) => c.name);
  const brands = of("brand");
  const [manualBrand, setManualBrand] = useState(!!value.brand && !brands.includes(value.brand));
  const colors = value.colors ?? [];
  return (
    <div className="space-y-4">
      <Field label="Name" hint="Empty uses “PLA Basic”"><Input placeholder="PLA Basic" value={value.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Brand">
          {manualBrand ? (
            <div className="flex gap-1">
              <Input autoFocus value={value.brand ?? ""} onChange={(e) => set("brand", e.target.value)} />
              <Button size="icon" variant="ghost" aria-label="Pick from list" onClick={() => setManualBrand(false)}><X className="size-4" /></Button>
            </div>
          ) : (
            <Select value={value.brand ?? ""} onChange={(e) => (e.target.value === "__manual" ? setManualBrand(true) : set("brand", e.target.value))}>
              {brands.map((b) => <option key={b}>{b}</option>)}
              <option value="__manual">Other, manually…</option>
            </Select>
          )}
        </Field>
        <Field label="Type">
          <Select value={value.type ?? "PLA"} onChange={(e) => set("type", e.target.value)}>
            {of("materialType").map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Modifier">
          <Select value={value.modifier ?? ""} onChange={(e) => set("modifier", e.target.value || null)}>
            <option value="">None</option>
            {of("modifier").map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Purchase link"><Input type="url" value={value.purchaseLink ?? ""} onChange={(e) => set("purchaseLink", e.target.value)} placeholder="https://" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Spool price"><NumberInput value={value.spoolPrice} onChange={(v) => set("spoolPrice", v)} /></Field>
        <Field label="Spool weight (g)"><NumberInput value={value.spoolWeightG} onChange={(v) => set("spoolWeightG", v)} /></Field>
        <Field label="Spool count">
          <div className="flex items-center gap-2">
            <Button size="icon" aria-label="Fewer spools" onClick={() => set("spoolCount", Math.max(0, (value.spoolCount ?? 1) - 1))}>−</Button>
            <NumberInput className="text-center" value={value.spoolCount} onChange={(v) => set("spoolCount", v)} />
            <Button size="icon" aria-label="More spools" onClick={() => set("spoolCount", (value.spoolCount ?? 0) + 1)}>+</Button>
          </div>
        </Field>
        <Field label="Used from spool (g)" hint="Already used before adding here"><NumberInput value={value.usedFromSpoolG} onChange={(v) => set("usedFromSpoolG", v)} /></Field>
        <Field label="Low stock alert (g)" hint="Optional"><NumberInput value={value.lowStockThresholdG ?? 0} onChange={(v) => set("lowStockThresholdG", v || null)} /></Field>
      </div>
      <Field label="Colors">
        <div className="flex flex-wrap items-center gap-2">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-1 rounded-xl border border-border p-1">
              <input type="color" aria-label={`Color ${i + 1}`} value={c} onChange={(e) => set("colors", colors.map((x, j) => (j === i ? e.target.value : x)))} className="size-8 cursor-pointer rounded border-0 bg-transparent" />
              <Input className="h-8 w-24 font-mono text-xs" value={c} onChange={(e) => set("colors", colors.map((x, j) => (j === i ? e.target.value : x)))} />
              {colors.length > 1 && <Button size="sm" variant="ghost" aria-label="Remove color" onClick={() => set("colors", colors.filter((_, j) => j !== i))}><X className="size-3" /></Button>}
            </div>
          ))}
          {colors.length < 4 && <Button size="sm" onClick={() => set("colors", [...colors, "#000000"])}><Plus className="size-4" /> Color</Button>}
        </div>
      </Field>
      <PhotoInput value={value.photoUrl} onChange={(u) => set("photoUrl", u)} />
    </div>
  );
}

function SpoolCalc({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [total, setTotal] = useState(0);
  const [empty, setEmpty] = useState(250);
  return (
    <Dialog open={open} onClose={onClose} title="Spool remaining calculator">
      <Field label="Spool on the scale (g)"><NumberInput value={total} onChange={setTotal} /></Field>
      <Field label="Empty spool weight (g)" hint="Bambu Lab ≈ 250 g, cardboard ≈ 140 g"><NumberInput value={empty} onChange={setEmpty} /></Field>
      <div className="rounded-xl bg-card-2 p-4 text-center text-2xl font-bold">{Math.max(0, total - empty)} g left</div>
    </Dialog>
  );
}

export default function FilamentsPage() {
  const { data, isLoading } = useList<Filament>("filaments");
  const { data: catalogs = [] } = useList<CatalogItem>("catalog-items");
  const save = useSave<Filament>("filaments", "Filament saved");
  const remove = useRemove("filaments");
  const currency = useCurrency();
  const [q, setQ] = useQueryState("q", "");
  const [type, setType] = useState("");
  const [view, setView] = useLocal<"table" | "cards">("filaments:view", "table");
  const [form, setForm] = useState<Partial<Filament> | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [spoolCalc, setSpoolCalc] = useState(false);
  const bulkDelete = useMutate<string[]>(async (ids) => {
    for (const id of ids) await api(`/api/filaments/${id}`, { method: "DELETE" });
  }, "Deleted");

  const all = data ?? [];
  const rows = all.filter((f) => (!type || f.type === type) && `${f.name} ${f.brand} ${f.type}`.toLowerCase().includes(q.toLowerCase()));
  const stockKg = all.reduce((a, f) => a + Math.max(0, f.stockG), 0) / 1000;
  const spools = all.reduce((a, f) => a + f.spoolCount, 0);
  // [DECISION] stock-proportional value: it is what reproduces the observed "worth 128 €"
  const worth = all.reduce((a, f) => a + (Math.max(0, f.stockG) / f.spoolWeightG) * f.spoolPrice, 0);
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const submit = () => {
    const { id, name, brand, type, modifier, purchaseLink, spoolPrice, spoolWeightG, spoolCount, usedFromSpoolG, colors, photoUrl, lowStockThresholdG } = form!;
    save.mutate({ id, name, brand, type, modifier, purchaseLink, spoolPrice, spoolWeightG, spoolCount, usedFromSpoolG, colors, photoUrl, lowStockThresholdG }, { onSuccess: () => setForm(null) });
  };

  return (
    <div>
      <nav className="mb-1 flex items-center gap-1 text-sm text-muted">
        <Link href="/en/warehouse" className="hover:text-fg">Stocks</Link> <ChevronRight className="size-4" /> Filaments
      </nav>
      <PageHeader
        title="Filaments"
        info="Stock is reduced automatically when an order is placed"
        actions={
          <>
            <CsvTools name="filaments" label="filaments" columns={FILAMENT_COLUMNS} toCsv={() => filamentsCsv(rows)} onImport={importFilaments} />
            <Button variant="primary" onClick={() => setForm(blank())}><Plus className="size-4" /> New filament</Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <span>In stock: <b>{stockKg.toFixed(1)} kg</b> · {spools} spools · worth <b>{money(worth, currency, true)}</b></span>
        <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => setSpoolCalc(true)}>
          <Scale className="size-4" /> Spool remaining calculator
        </button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search filaments" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-36" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {[...new Set(all.map((f) => f.type))].map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Button onClick={() => { setSelecting(!selecting); setSelected([]); }} variant={selecting ? "primary" : "secondary"}><CheckSquare className="size-4" /> Select</Button>
        <Segmented value={view} onChange={setView} options={[{ value: "table", label: "Table" }, { value: "cards", label: "Grid" }]} />
      </div>
      {selecting && selected.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-card-2 px-4 py-2 text-sm">
          {selected.length} selected
          <Button size="sm" variant="danger" onClick={() => {
            const ids = selected;
            setSelected([]);
            deleteWithUndo(`${ids.length} filaments`, () => bulkDelete.mutate(ids));
          }}><Trash2 className="size-4" /> Delete</Button>
        </div>
      )}
      {isLoading ? <ListSkeleton /> : (
        <DataTable
          id="filaments"
          view={view}
          rows={rows}
          rowKey={(f) => f.id}
          onRowClick={(f) => (selecting ? toggle(f.id) : setForm(f))}
          rowClass={(f) => (selected.includes(f.id) ? "bg-accent/10" : "")}
          empty={<EmptyState text="No filaments yet" action={<Button variant="primary" onClick={() => setForm(blank())}>Add filament</Button>} />}
          columns={[
            { key: "name", header: "Name", fixed: true, sort: (f) => f.name, cell: (f) => (
              <div className="flex items-center gap-2">
                {selecting && <input type="checkbox" readOnly checked={selected.includes(f.id)} className="size-4 accent-[var(--accent)]" />}
                <ColorDot color={f.colors[0]} className="size-4" />
                <div className="min-w-0"><div className="truncate font-medium">{f.name}</div><div className="text-xs text-muted">{f.brand}</div></div>
              </div>
            ) },
            { key: "brand", header: "Brand", sort: (f) => f.brand, cell: (f) => f.brand, hiddenByDefault: true },
            { key: "type", header: "Type", sort: (f) => f.type, cell: (f) => <Badge className="bg-card-2">{f.type}{f.modifier ? ` ${f.modifier}` : ""}</Badge> },
            { key: "color", header: "Color", cell: (f) => <span className="flex gap-1">{f.colors.map((c, i) => <ColorDot key={i} color={c} className="size-5 rounded-md" />)}</span> },
            { key: "spools", header: "Spools", sort: (f) => f.spoolCount, cell: (f) => f.spoolCount },
            { key: "stock", header: "Stock", sort: (f) => f.stockG, cell: (f) => (
              <div>
                <div className={f.stockG < 0 ? "text-red-500" : ""}>{grams(f.stockG)}</div>
                {f.lastsDays != null && <div className={`text-xs ${f.lastsDays <= 7 ? "text-red-500" : f.lastsDays <= 14 ? "text-amber-500" : "text-muted"}`}>Lasts ~{f.lastsDays} d</div>}
              </div>
            ) },
            { key: "price", header: "Spool price", sort: (f) => f.spoolPrice, cell: (f) => (
              <div><div>{money(f.spoolPrice, currency)}</div><div className="text-xs text-muted">{money(f.pricePerKg, currency, true)}/kg</div></div>
            ) },
            { key: "del", header: "", fixed: true, cell: (f) => (
              <Button size="icon" variant="ghost" aria-label={`Delete ${f.name}`} className="opacity-60 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteWithUndo(f.name, () => remove.mutate(f.id)); }}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
            ) },
          ]}
        />
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit filament" : "New filament"} footer={
        <>
          <Button onClick={() => setForm(null)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>Save</Button>
        </>
      }>
        {form && <FilamentForm value={form} onChange={setForm} catalogs={catalogs} />}
      </Dialog>
      <SpoolCalc open={spoolCalc} onClose={() => setSpoolCalc(false)} />
    </div>
  );
}
