"use client";
// Settings, main doc 6.14. Integrations and Delivery tabs are out of scope and hidden.
import { Download, Plus, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocal } from "@/components/data-table";
import {
  Badge, Button, Card, Field, Input, ListSkeleton, NumberInput, PageHeader, Segmented, Select, Switch, deleteWithUndo,
} from "@/components/ui";
import {
  api, useList, useMe, useMutate, useQueryState, useRemove, useSave, useSaveSettings, useSettings, type Settings,
} from "@/lib/client";
import { currencySymbol } from "@/lib/format";

type Named = { id: string; name: string };
type Tax = Named & { ratePct: number };
type Fee = Named & { commissionPct: number; fixedFee: number };
type Tier = { id: string; minOrders: number; discountPct: number };
type CatalogItem = Named & { kind: string };
type PrinterRow = { id: string; model: string; internalName: string; hoursUsed: number; hoursAuto: number; hoursManual: number; initialHours: number; maintenanceDue: boolean };

const MARKUP_BASE: [keyof Settings, string, string][] = [
  ["mbMaterial", "Material", "Filament and resin cost"],
  ["mbLabor", "Labor", "Operator, modeling and painting hours"],
  ["mbWarehouse", "Stock items", "Items taken from stock shelves"],
  ["mbPackagingDelivery", "Packaging and delivery", "Packaging and delivery costs"],
  ["mbElectricity", "Electricity", "Printer and dryer power use"],
  ["mbAmortization", "Printer and dryer amortization", "Wear of the equipment per hour"],
  ["mbConsumables", "Consumables and post-processing", "Glue, sandpaper, print file cost"],
];

function Calculations() {
  const { data } = useSettings();
  const save = useSaveSettings();
  const [s, setS] = useState<Settings | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- start editing from the loaded settings
  useEffect(() => { if (data && !s) setS(data); }, [data, s]);
  if (!s) return <ListSkeleton />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const cur = currencySymbol(s.currency);
  const dirty = JSON.stringify(s) !== JSON.stringify(data);

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Electricity">
        <Segmented value={s.electricityMode} onChange={(v) => set("electricityMode", v)} options={[{ value: "single", label: "Single tariff" }, { value: "day_night", label: "Day / Night" }]} />
        {s.electricityMode === "day_night" && <p className="mt-2 text-xs text-amber-500">Day/Night tariffs are not supported yet; the single tariff below is used.</p>}
        <Switch label="Include electricity in calculations" checked={s.electricityEnabled} onChange={(v) => set("electricityEnabled", v)} />
        <Field label={`Tariff (${cur}/kWh)`}>
          <NumberInput value={s.electricityTariff} onChange={(v) => set("electricityTariff", v)} />
        </Field>
      </Card>
      <Card title="Labor">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`Operator (${cur}/h)`} hint="0 disables the line"><NumberInput value={s.operatorRate} onChange={(v) => set("operatorRate", v)} /></Field>
          <Field label={`Modeling (${cur}/h)`}><NumberInput value={s.modelingRate} onChange={(v) => set("modelingRate", v)} /></Field>
          <Field label={`Painting (${cur}/h)`}><NumberInput value={s.paintingRate} onChange={(v) => set("paintingRate", v)} /></Field>
        </div>
      </Card>
      <Card title="Markup">
        <Field label="Default markup (%)" className="max-w-48"><NumberInput value={s.defaultMarkupPct} onChange={(v) => set("defaultMarkupPct", v)} suffix="%" /></Field>
        <div className="mt-4 text-xs font-semibold tracking-wider text-muted uppercase">Markup base: what&apos;s included</div>
        <p className="text-xs text-muted">Items switched off are still added to the price, at cost, without markup.</p>
        <div className="divide-y divide-border">
          {MARKUP_BASE.map(([k, label, desc]) => (
            <Switch key={k} label={label} description={desc} checked={s[k] as boolean} onChange={(v) => set(k, v as never)} />
          ))}
        </div>
      </Card>
      <Card title="Mandatory deductions">
        <div className="divide-y divide-border">
          <Switch label="Taxes" description="Adds the selected tax rate on the current base" checked={s.deductTaxes} onChange={(v) => set("deductTaxes", v)} />
          <Switch label="Marketplace commission" description="Adds the marketplace commission on the current base" checked={s.deductMarketplace} onChange={(v) => set("deductMarketplace", v)} />
          <Switch label="Acquiring" description="Adds the payment processing fee on the current base" checked={s.deductAcquiring} onChange={(v) => set("deductAcquiring", v)} />
        </div>
      </Card>
      <Card title="Manufacturing complexity markup">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Simple (%)"><NumberInput value={s.complexitySimplePct} onChange={(v) => set("complexitySimplePct", v)} suffix="%" /></Field>
          <Field label="Medium (%)"><NumberInput value={s.complexityMediumPct} onChange={(v) => set("complexityMediumPct", v)} suffix="%" /></Field>
          <Field label="Complex (%)"><NumberInput value={s.complexityComplexPct} onChange={(v) => set("complexityComplexPct", v)} suffix="%" /></Field>
        </div>
      </Card>
      <Card title="Defects & rounding">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Defect allowance (%)" hint="Increases material grams by this percentage"><NumberInput value={s.defectAllowancePct} onChange={(v) => set("defectAllowancePct", v)} suffix="%" /></Field>
          <Field label="Rounding mode">
            <Select value={s.roundingMode} onChange={(e) => set("roundingMode", e.target.value)}>
              <option value="none">No rounding</option>
              <option value="nearest_1">To nearest 1</option>
              <option value="up_1">Up to 1</option>
              <option value="nearest_5">To nearest 5</option>
              <option value="up_5">Up to 5</option>
              <option value="up_10">Up to 10</option>
            </Select>
          </Field>
        </div>
      </Card>
      <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
        <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(s)} className="shadow-lg">
          Save settings
        </Button>
      </div>
    </div>
  );
}

function Catalogs() {
  const { data = [] } = useList<CatalogItem>("catalog-items");
  const save = useSave<CatalogItem>("catalog-items", "Added");
  const remove = useRemove("catalog-items");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const groups: [string, string][] = [["brand", "Filament brands"], ["materialType", "Material types"], ["modifier", "Modifiers"]];
  return (
    <div className="max-w-3xl space-y-4">
      {groups.map(([kind, title]) => {
        const items = data.filter((i) => i.kind === kind);
        return (
          <Card key={kind} title={`${title} · ${items.length}`}>
            <div className="flex flex-wrap gap-2">
              {items.map((i) => (
                <Badge key={i.id} className="bg-card-2 py-1 text-sm">
                  {i.name}
                  <button type="button" aria-label={`Remove ${i.name}`} onClick={() => remove.mutate(i.id)}>
                    <X className="size-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = drafts[kind]?.trim();
                if (!name) return;
                save.mutate({ kind, name });
                setDrafts({ ...drafts, [kind]: "" });
              }}
            >
              <Input value={drafts[kind] ?? ""} onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })} placeholder="Add..." />
              <Button type="submit" aria-label="Add"><Plus className="size-4" /></Button>
            </form>
          </Card>
        );
      })}
    </div>
  );
}

/** Small inline-editable list used by Taxes, Commissions and Loyalty. */
function RowList<T extends { id: string }>({
  entity, rows, fields, blank, addLabel,
}: {
  entity: string;
  rows: T[];
  fields: { key: keyof T & string; label: string; type: "text" | "number"; suffix?: string }[];
  blank: Omit<T, "id">;
  addLabel: string;
}) {
  const save = useSave<T>(entity, "Saved");
  const remove = useRemove(entity);
  const [draft, setDraft] = useState<Omit<T, "id">>(blank);
  const input = (f: (typeof fields)[number], v: unknown, onChange: (v: unknown) => void, onBlur?: () => void) =>
    f.type === "number" ? (
      <NumberInput value={v as number} onChange={onChange} suffix={f.suffix} onBlur={onBlur} aria-label={f.label} />
    ) : (
      <Input value={v as string} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-label={f.label} />
    );
  return (
    <div className="space-y-2">
      <div className="hidden gap-2 px-1 text-xs text-muted sm:grid" style={{ gridTemplateColumns: `repeat(${fields.length}, 1fr) 44px` }}>
        {fields.map((f) => <span key={f.key}>{f.label}</span>)}
      </div>
      {rows.map((r) => (
        <EditableRow key={r.id} row={r} fields={fields} input={input} onSave={(p) => save.mutate({ id: r.id, ...p } as never)} onDelete={() => deleteWithUndo("Row", () => remove.mutate(r.id))} />
      ))}
      <div className="grid gap-2 border-t border-border pt-2 sm:items-center" style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0,1fr)) 44px` }}>
        {fields.map((f) => <div key={f.key}>{input(f, draft[f.key as keyof typeof draft], (v) => setDraft({ ...draft, [f.key]: v }))}</div>)}
        <Button
          size="icon"
          variant="primary"
          aria-label={addLabel}
          onClick={() => {
            save.mutate(draft as never);
            setDraft(blank);
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function EditableRow<T extends { id: string }>({
  row, fields, input, onSave, onDelete,
}: {
  row: T;
  fields: { key: keyof T & string; label: string; type: "text" | "number"; suffix?: string }[];
  input: (f: { key: keyof T & string; label: string; type: "text" | "number"; suffix?: string }, v: unknown, onChange: (v: unknown) => void, onBlur?: () => void) => React.ReactNode;
  onSave: (p: Partial<T>) => void;
  onDelete: () => void;
}) {
  const [r, setR] = useState(row);
  const commit = () => JSON.stringify(r) !== JSON.stringify(row) && onSave(Object.fromEntries(fields.map((f) => [f.key, r[f.key]])) as Partial<T>);
  return (
    <div className="grid gap-2 sm:items-center" style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0,1fr)) 44px` }}>
      {fields.map((f) => <div key={f.key}>{input(f, r[f.key], (v) => setR({ ...r, [f.key]: v }), commit)}</div>)}
      <Button size="icon" variant="ghost" aria-label="Delete" onClick={onDelete}>
        <Trash2 className="size-4 text-red-500" />
      </Button>
    </div>
  );
}

function Taxes() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const { data: taxes = [] } = useList<Tax>("tax-regimes");
  const { data: fees = [] } = useList<Fee>("marketplace-fees");
  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Tax systems and rates">
        <RowList<Tax> entity="tax-regimes" rows={taxes} addLabel="Add tax rate" blank={{ name: "", ratePct: 0 }}
          fields={[{ key: "name", label: "Name", type: "text" }, { key: "ratePct", label: "Rate", type: "number", suffix: "%" }]} />
        {settings && (
          <Field label="Default in calculator" className="mt-4 max-w-sm">
            <Select value={settings.defaultTaxRegimeId ?? ""} onChange={(e) => saveSettings.mutate({ defaultTaxRegimeId: e.target.value || null })}>
              <option value="">No tax</option>
              {taxes.map((t) => <option key={t.id} value={t.id}>{t.name} {t.ratePct}%</option>)}
            </Select>
          </Field>
        )}
      </Card>
      {settings && (
        <Card title="Payment processing (acquiring)">
          <Switch label="Include acquiring fee in calculations" checked={settings.deductAcquiring} onChange={(v) => saveSettings.mutate({ deductAcquiring: v })} />
          <Field label="Acquiring fee (%)" className="max-w-48">
            <NumberInput value={settings.acquiringPct} onChange={() => {}} onBlur={(e) => saveSettings.mutate({ acquiringPct: parseFloat(e.target.value.replace(",", ".")) || 0 })} suffix="%" />
          </Field>
        </Card>
      )}
      <Card title="Calculator commissions">
        <p className="mb-3 text-xs text-muted">Marketplace fees offered in the calculator&apos;s Marketplace select.</p>
        <RowList<Fee> entity="marketplace-fees" rows={fees} addLabel="Add commission" blank={{ name: "", commissionPct: 0, fixedFee: 0 }}
          fields={[{ key: "name", label: "Name", type: "text" }, { key: "commissionPct", label: "Commission", type: "number", suffix: "%" }, { key: "fixedFee", label: "Fixed fee", type: "number" }]} />
      </Card>
    </div>
  );
}

function Loyalty() {
  const { data = [] } = useList<Tier>("loyalty-tiers");
  return (
    <Card title="Loyalty program" className="max-w-3xl">
      <p className="mb-3 text-sm text-muted">
        When a client reaches the number of orders in a tier, the calculator offers that discount. With no tiers the feature is off.
      </p>
      <RowList<Tier> entity="loyalty-tiers" rows={data} addLabel="Add tier" blank={{ minOrders: 5, discountPct: 5 }}
        fields={[{ key: "minOrders", label: "From orders", type: "number" }, { key: "discountPct", label: "Discount", type: "number", suffix: "%" }]} />
    </Card>
  );
}

function Maintenance() {
  const { data = [] } = useList<PrinterRow>("printers");
  return (
    <Card title="Maintenance" className="max-w-3xl">
      {data.length === 0 && <p className="text-sm text-muted">No printers yet.</p>}
      <div className="divide-y divide-border">
        {data.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <div className="font-medium">{p.internalName || p.model}</div>
              <div className="text-sm text-muted">
                {p.hoursUsed.toFixed(2)} h ({p.hoursAuto.toFixed(2)} auto + {(p.hoursManual + p.initialHours).toFixed(2)} manual)
              </div>
            </div>
            <div className="flex items-center gap-2">
              {p.maintenanceDue && <Badge className="bg-amber-500/15 text-amber-500">Maintenance needed</Badge>}
              <Link href={`/en/printers/${p.id}?tab=maintenance`} className="text-sm text-accent hover:underline">Configure intervals</Link>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FilePicker({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-card-2">
      <Upload className="size-4" /> {label}
      <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

function useImport(okMsg: string) {
  return useMutate<File>(async (f) => api("/api/import", { method: "POST", json: JSON.parse(await f.text()) }), okMsg);
}

function Sync() {
  const imp = useImport("Settings imported");
  return (
    <Card title="Sync settings" className="max-w-3xl">
      <p className="mb-4 text-sm text-muted">
        Export markup, rates, taxes, commissions, loyalty tiers and catalogs as JSON. Orders, clients and stocks are not included. Importing replaces these settings.
      </p>
      <div className="flex flex-wrap gap-2">
        <a download href="/api/export?scope=settings" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"><Download className="size-4" /> Export settings</a>
        <FilePicker label="Import settings" onFile={(f) => imp.mutate(f)} />
      </div>
      <p className="mt-4 text-sm text-muted">Need a full data backup? See the <Link className="text-accent" href="/en/settings?tab=backups">Backups</Link> section.</p>
    </Card>
  );
}

function Backups() {
  const imp = useImport("Backup restored");
  const [confirm, setConfirm] = useState<File | null>(null);
  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Full backup">
        <p className="mb-4 text-sm text-muted">
          Everything in this workshop as one JSON file: settings, printers, filaments, clients, models, orders, stocks and documents.
          Uploaded photos and files are not inside it; back up the <code>uploads/</code> folder alongside (see <code>npm run backup</code>).
        </p>
        <div className="flex flex-wrap gap-2">
        <a download href="/api/export" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"><Download className="size-4" /> Download full backup</a>
          <FilePicker label="Restore from backup" onFile={setConfirm} />
        </div>
      </Card>
      {confirm && (
        <Card title="Restore backup?" className="border-red-500/50">
          <p className="text-sm">Restoring <b>{confirm.name}</b> replaces all data in this workshop. This cannot be undone.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" loading={imp.isPending} onClick={() => imp.mutate(confirm, { onSettled: () => setConfirm(null) })}>Replace all data</Button>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function About() {
  const me = useMe().data;
  return (
    <Card title="About" className="max-w-3xl">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">App</dt><dd>Gori.Lab (local edition)</dd>
        <dt className="text-muted">Version</dt><dd>0.1.0</dd>
        <dt className="text-muted">Account</dt><dd>{me?.name} · {me?.email}</dd>
        <dt className="text-muted">Workshop</dt><dd>{me?.workshop.name}</dd>
        <dt className="text-muted">Plan</dt><dd><Badge className="bg-accent/15 text-accent">Local · all features</Badge></dd>
      </dl>
      <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-muted">
        <p className="font-medium text-fg">Restoring a file-level backup</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Stop the app.</li>
          <li>Replace <code>prisma/dev.db</code> and the <code>uploads/</code> folder with the copies from <code>backup/</code>.</li>
          <li>Start the app again with <code>npm start</code>.</li>
        </ol>
      </div>
    </Card>
  );
}

const SUB = [
  { value: "calculations", label: "Calculations" },
  { value: "catalogs", label: "Catalogs" },
  { value: "taxes", label: "Taxes" },
  { value: "loyalty", label: "Loyalty" },
  { value: "maintenance", label: "Maintenance" },
];

export default function SettingsPage() {
  const [tab, setTab] = useQueryState("tab", "general");
  const [sub, setSub] = useLocal("settings:sub", "calculations");
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="mb-4 overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={[{ value: "general", label: "General" }, { value: "sync", label: "Sync" }, { value: "backups", label: "Backups" }, { value: "about", label: "About" }]} />
      </div>
      {tab === "general" && (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {SUB.map((s) => (
              <button key={s.value} type="button" onClick={() => setSub(s.value)}
                className={`h-9 shrink-0 rounded-full px-4 text-sm ${sub === s.value ? "bg-accent text-accent-fg" : "border border-border bg-card"}`}>
                {s.label}
              </button>
            ))}
          </div>
          {sub === "calculations" && <Calculations />}
          {sub === "catalogs" && <Catalogs />}
          {sub === "taxes" && <Taxes />}
          {sub === "loyalty" && <Loyalty />}
          {sub === "maintenance" && <Maintenance />}
        </>
      )}
      {tab === "sync" && <Sync />}
      {tab === "backups" && <Backups />}
      {tab === "about" && <About />}
    </div>
  );
}
