"use client";
// Calculator, main doc 6.1. Form on the left, live COST BREAKDOWN on the right
// (sticky bottom bar that expands into a sheet on mobile, main doc 9.1).
import {
  AlertTriangle, Bookmark, ChevronUp, FileUp, History, List, Loader2, Package, Plus, RotateCcw, Save, Trash2, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Badge, Button, Card, Checkbox, ColorDot, Dialog, Field, Input, ListSkeleton, NumberInput, PageHeader, Segmented, Select, TagInput,
  Textarea, cn, deleteWithUndo,
} from "@/components/ui";
import { calcSchema, computeCalc, emptyCalc, type CalcInput, type CalcRefs } from "@/lib/calc";
import { api, upload, useApi, useList, useMutate, useRemove, useSave, type Settings } from "@/lib/client";
import { dateInput, money, pct } from "@/lib/format";
import { parseSlicerFile, SlicerError } from "@/lib/slicer";
import { STATUSES } from "@/lib/status";
import type { Client, Model } from "@/lib/types";

type Refs = CalcRefs & {
  clients: Client[];
  models: Model[];
  loyaltyTiers: { minOrders: number; discountPct: number }[];
  rawSettings: Settings;
};
type Saved = { id: string; name: string; input: unknown; updatedAt: string };

const LOCAL_KEY = "calc:current";
const MAX_TEMPLATES = 15;

function readLocal(): { calc: CalcInput; draftId: string | null; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLocal(v: { calc: CalcInput; draftId: string | null; savedAt: string } | null) {
  try {
    if (v) localStorage.setItem(LOCAL_KEY, JSON.stringify(v));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {}
}
/** Anything typed beyond the defaults? */
const hasInput = (c: CalcInput) => JSON.stringify({ ...c, saleDate: "" }) !== JSON.stringify({ ...emptyCalc(), saleDate: "" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-xs font-semibold tracking-wider text-muted uppercase">
        {title}
        <ChevronUp className="size-4 transition-transform group-not-open:rotate-180" />
      </summary>
      <div className="space-y-4 px-4 pb-4">{children}</div>
    </details>
  );
}

export default function CalculatorPage() {
  const { data: refs, isLoading } = useApi<Refs>("/api/calculator/refs");
  if (isLoading || !refs) return <ListSkeleton rows={8} />;
  return <Calculator refs={refs} />;
}

function Calculator({ refs }: { refs: Refs }) {
  const router = useRouter();
  const sp = useSearchParams();
  const s = refs.rawSettings;
  const currency = s.currency;
  const m = (x: number) => money(x, currency);

  const fresh = (): CalcInput => ({
    ...emptyCalc(),
    taxRegimeId: s.defaultTaxRegimeId,
    markupPct: s.defaultMarkupPct,
    saleDate: new Date().toISOString(),
  });

  const [calc, setCalcRaw] = useState<CalcInput>(fresh);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [banner, setBanner] = useState<{ calc: CalcInput; draftId: string | null; savedAt: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "templates" | "drafts" | "saveTemplate" | "newClient">(null);

  const setCalc = (patch: Partial<CalcInput>) => {
    setTouched(true);
    setCalcRaw((c) => ({ ...c, ...patch }));
  };

  // ---- initial load: ?model / ?template / ?draft, else offer the unfinished calculation ----
  const { data: templates = [] } = useList<Saved>("templates");
  const { data: drafts = [] } = useList<Saved>("drafts");
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const modelId = sp.get("model");
    const local = readLocal();
    if (modelId) {
      // a prefilled calculation starts fresh; the unfinished one stays in Drafts (main doc 6.8)
      writeLocal(null);
      applyModel(modelId, fresh());
    } else if (local && hasInput(local.calc)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore offer on mount
      setBanner(local);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(input: unknown, opts: { draftId?: string | null; msg?: string } = {}) {
    const c = calcSchema.parse({ ...fresh(), ...(input as object) });
    setCalcRaw(c);
    setDraftId(opts.draftId ?? null);
    setTouched(true);
    setBanner(null);
    if (opts.msg) toast.success(opts.msg);
  }

  function applyModel(id: string, base: CalcInput = calc) {
    const model = refs.models.find((x) => x.id === id);
    if (!model) return;
    const c: CalcInput = {
      ...base,
      modelSource: "catalog",
      modelId: id,
      name: model.name,
      materialMode: "stock",
      materials: model.filaments.length ? model.filaments.map((f) => ({ filamentId: f.filamentId, grams: f.grams })) : base.materials,
      printH: Math.floor(model.printTimeMin / 60),
      printMin: Math.round(model.printTimeMin % 60),
      complexity: (model.complexity as CalcInput["complexity"]) ?? "none",
      printFileCost: model.extraCosts || base.printFileCost,
      advanced: base.advanced || model.extraCosts > 0,
      // a fixed price per piece replaces cost-based pricing (main doc 5.5)
      ...(model.pricePerPiece != null ? { priceMode: "price" as const, targetPrice: model.pricePerPiece * base.quantity } : {}),
    };
    setCalcRaw(c);
    setTouched(true);
  }

  // ---- autosave: localStorage now, server after 3 s ----
  const saveDraft = useMutate<{ id: string | null; calc: CalcInput }, Saved>((v) =>
    v.id
      ? api<Saved>(`/api/drafts/${v.id}`, { method: "PATCH", json: { name: v.calc.name, input: v.calc } })
      : api<Saved>("/api/drafts", { method: "POST", json: { name: v.calc.name, input: v.calc } }),
  );
  useEffect(() => {
    if (!touched || !hasInput(calc)) return;
    const now = new Date().toISOString();
    writeLocal({ calc, draftId, savedAt: now });
    const t = setTimeout(() => {
      saveDraft.mutate({ id: draftId, calc }, {
        onSuccess: (d) => {
          setDraftId(d.id);
          setSavedAt(d.updatedAt);
          writeLocal({ calc, draftId: d.id, savedAt: d.updatedAt });
        },
      });
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc, touched]);

  const removeDraft = useRemove("drafts", "Draft deleted");
  function clearDraft() {
    if (draftId) api(`/api/drafts/${draftId}`, { method: "DELETE" }).catch(() => {});
    writeLocal(null);
    setDraftId(null);
    setSavedAt(null);
  }

  function startOver() {
    const before = { calc, draftId };
    writeLocal(null);
    setCalcRaw(fresh());
    setDraftId(null);
    setSavedAt(null);
    setTouched(false);
    toast("Form cleared", {
      duration: 7000,
      action: { label: "Restore", onClick: () => { setCalcRaw(before.calc); setDraftId(before.draftId); setTouched(true); } },
    });
  }

  // ---- live computation ----
  // orders always include labor; the checkbox only affects the personal-use write-off
  const { result: r } = useMemo(() => computeCalc({ ...calc, includeLabor: true }, refs), [calc, refs]);
  const writeOffCost = useMemo(() => computeCalc(calc, refs).result.totalCost, [calc, refs]);
  const filled = r.totalCost > 0 || r.salePrice > 0;

  // stock warnings (main doc 5.2: allowed, but warn)
  const negative = calc.materialMode === "stock" && calc.modelSource !== "stock"
    ? calc.materials
        .map((x) => ({ f: refs.filaments.find((f) => f.id === x.filamentId), g: x.grams * calc.quantity * (1 + s.defectAllowancePct / 100) }))
        .filter(({ f, g }) => f && f.stockG != null && g > f.stockG)
        .map(({ f }) => f!.name)
    : [];

  // ---- saving ----
  const saveOrder = useMutate<{ personalUse?: boolean }, { id: string }>(
    (v) => api("/api/orders", { method: "POST", json: { calc, personalUse: v.personalUse } }),
  );
  const saveWarehouse = useMutate<void>(() => api("/api/calculator/warehouse", { method: "POST", json: { calc } }), "Saved to warehouse");
  const onSaveOrder = (personalUse = false) =>
    saveOrder.mutate({ personalUse }, {
      onSuccess: (o) => {
        clearDraft();
        toast.success(personalUse ? "Written off for personal use" : "Order saved");
        router.push(`/en/orders/${o.id}`);
      },
    });

  // ---- slicer file ----
  const [parsing, setParsing] = useState(false);
  async function onSlicerFile(file: File) {
    setParsing(true);
    try {
      const res = await parseSlicerFile(file);
      // match each slicer filament to a stock filament by colour, else by type
      const pick = (color?: string, type?: string) =>
        refs.filaments.find((f) => color && f.colors.some((c) => c.toLowerCase() === color.toLowerCase().slice(0, 7)))?.id ??
        refs.filaments.find((f) => type && f.name.toLowerCase().includes(type.toLowerCase()))?.id ??
        refs.filaments[0]?.id ??
        null;
      setCalc({
        materialMode: "stock",
        materials: res.filaments.length ? res.filaments.map((f) => ({ filamentId: pick(f.color, f.type), grams: f.grams })) : calc.materials,
        printH: Math.floor(res.timeMin / 60),
        printMin: res.timeMin % 60,
        name: calc.name || file.name.replace(/\.(gcode|3mf)$/i, ""),
      });
      toast.success(`Read ${res.filaments.reduce((a, f) => a + f.grams, 0).toFixed(1)} g and ${Math.floor(res.timeMin / 60)}h ${res.timeMin % 60}m from ${file.name}`);
      // keep the file for the order's "Slicer file" button (local build keeps files on disk)
      upload(file, "model").then((url) => setCalc({ slicerFileUrl: url })).catch(() => {});
    } catch (e) {
      toast.error(e instanceof SlicerError ? e.message : "Could not read this file");
    } finally {
      setParsing(false);
    }
  }

  const client = refs.clients.find((c) => c.id === calc.clientId);
  const tier = client ? [...refs.loyaltyTiers].reverse().find((t) => client.ordersCount >= t.minOrders) : undefined;
  const saveTemplate = useSave<Saved>("templates", "Template saved");

  const breakdown = (
    <Breakdown
      calc={calc} setCalc={setCalc} r={r} m={m} settings={s} filled={filled} writeOffCost={writeOffCost}
      onSaveOrder={() => onSaveOrder(false)} onWriteOff={() => onSaveOrder(true)} onWarehouse={() => saveWarehouse.mutate()}
      saving={saveOrder.isPending || saveWarehouse.isPending}
    />
  );

  return (
    <div>
      <PageHeader title="Calculator" info="Every order starts here. Prices update as you type." subtitle={savedAt ? `Draft saved · ${hhmm(savedAt)}` : undefined} />

      {/* templates and draft tools */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => load(t.input, { msg: `Template "${t.name}" loaded` })} className="h-9 shrink-0 rounded-full border border-border bg-card px-3 text-sm hover:border-accent">
              {t.name}
            </button>
          ))}
          <Button size="sm" variant="ghost" aria-label="Save as template" title="Save as template" disabled={templates.length >= MAX_TEMPLATES} onClick={() => setDialog("saveTemplate")}>
            <Bookmark className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" aria-label="All templates" title="All templates" onClick={() => setDialog("templates")}>
            <List className="size-4" />
          </Button>
        </div>
        <Button size="sm" onClick={() => setDialog("drafts")}><History className="size-4" /> Drafts ({drafts.length})</Button>
        <Button size="sm" onClick={startOver}><RotateCcw className="size-4" /> Start over</Button>
      </div>

      {banner && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          <span className="flex-1">Unfinished calculation &quot;{banner.calc.name || "Untitled"}&quot; · {hhmm(banner.savedAt)}</span>
          <Button size="sm" variant="primary" onClick={() => load(banner.calc, { draftId: banner.draftId })}>Continue</Button>
          <Button size="sm" variant="ghost" onClick={() => { writeLocal(null); setBanner(null); }}>Hide</Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          <Checkbox
            label={<span>Advanced mode <span className="text-muted">· Labor, price simulation, detailed breakdown</span></span>}
            checked={calc.advanced}
            onChange={(v) => setCalc({ advanced: v })}
          />

          <Section title="Model">
            <Field label="Model name"><Input value={calc.name} onChange={(e) => setCalc({ name: e.target.value })} placeholder="e.g. Dragon figurine" /></Field>
            <Segmented
              value={calc.modelSource}
              onChange={(v) => setCalc({ modelSource: v, modelId: null, finishedGoodId: null })}
              options={[{ value: "catalog", label: "Catalog" }, { value: "stock", label: "Stock" }]}
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              {calc.modelSource === "catalog" ? (
                <Field label="From catalog">
                  <Select value={calc.modelId ?? ""} onChange={(e) => (e.target.value ? applyModel(e.target.value) : setCalc({ modelId: null }))}>
                    <option value="">None selected</option>
                    {refs.models.map((x) => <option key={x.id} value={x.id}>{x.name}{x.pricePerPiece != null ? ` · ${m(x.pricePerPiece)}` : ""}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label="Finished good in stock">
                  <Select
                    value={calc.finishedGoodId ?? ""}
                    onChange={(e) => {
                      const g = refs.finishedGoods.find((x) => x.id === e.target.value);
                      setCalc(g ? { finishedGoodId: g.id, name: g.name, priceMode: "price", targetPrice: g.unitPrice * calc.quantity } : { finishedGoodId: null });
                    }}
                  >
                    <option value="">None selected</option>
                    {refs.finishedGoods.map((g) => <option key={g.id} value={g.id} disabled={g.quantity <= 0}>{g.name} · {g.quantity} pcs</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Quantity (pcs)">
                <NumberInput
                  value={calc.quantity}
                  onChange={(q) => {
                    const qty = Math.max(1, Math.round(q) || 1);
                    // keep a per-piece fixed price per piece when quantity changes
                    const model = refs.models.find((x) => x.id === calc.modelId);
                    const good = refs.finishedGoods.find((x) => x.id === calc.finishedGoodId);
                    const per = calc.modelSource === "stock" ? good?.unitPrice : model?.pricePerPiece;
                    setCalc({ quantity: qty, ...(per != null && calc.priceMode === "price" ? { targetPrice: per * qty } : {}) });
                  }}
                />
              </Field>
            </div>
          </Section>

          {calc.modelSource === "catalog" && (
            <>
              <Section title="Material">
                <label
                  className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border p-4 text-center text-sm text-muted hover:border-accent"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onSlicerFile(f); }}
                >
                  {parsing ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
                  Drop a .gcode or .3mf file, or tap to choose
                  <span className="text-xs">Fills grams per filament and print time</span>
                  <input type="file" accept=".gcode,.3mf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSlicerFile(f); e.target.value = ""; }} />
                </label>
                <Segmented value={calc.materialMode} onChange={(v) => setCalc({ materialMode: v })} options={[{ value: "stock", label: "From stock" }, { value: "manual", label: "Manual" }]} />
                {calc.materialMode === "stock" ? (
                  <div className="space-y-2">
                    {(calc.materials.length ? calc.materials : [{ filamentId: null, grams: 0 }]).map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_110px_44px] items-end gap-2">
                        <Field label={i === 0 ? "Filament" : `Additional filament ${i}`}>
                          <Select
                            value={row.filamentId ?? ""}
                            onChange={(e) => {
                              const list = calc.materials.length ? [...calc.materials] : [{ filamentId: null, grams: 0 }];
                              list[i] = { ...list[i], filamentId: e.target.value || null };
                              setCalc({ materials: list });
                            }}
                          >
                            <option value="">Choose filament</option>
                            {refs.filaments.map((f) => <option key={f.id} value={f.id}>{f.name} · {Math.round(f.stockG ?? 0)} g</option>)}
                          </Select>
                        </Field>
                        <Field label="Usage (g)">
                          <NumberInput
                            value={row.grams}
                            onChange={(g) => {
                              const list = calc.materials.length ? [...calc.materials] : [{ filamentId: null, grams: 0 }];
                              list[i] = { ...list[i], grams: g };
                              setCalc({ materials: list });
                            }}
                          />
                        </Field>
                        <Button size="icon" variant="ghost" aria-label="Remove filament" disabled={calc.materials.length <= 1} onClick={() => setCalc({ materials: calc.materials.filter((_, j) => j !== i) })}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" onClick={() => setCalc({ materials: [...(calc.materials.length ? calc.materials : [{ filamentId: null, grams: 0 }]), { filamentId: null, grams: 0 }] })}>
                      <Plus className="size-4" /> Additional filament
                    </Button>
                    {negative.length > 0 && (
                      <p className="flex items-center gap-2 text-sm text-amber-500"><AlertTriangle className="size-4" /> Stock will go negative: {negative.join(", ")}</p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Name"><Input value={calc.manual.name} onChange={(e) => setCalc({ manual: { ...calc.manual, name: e.target.value } })} placeholder="Optional" /></Field>
                    <Field label="Grams"><NumberInput value={calc.manual.grams} onChange={(v) => setCalc({ manual: { ...calc.manual, grams: v } })} /></Field>
                    <Field label={`Price per kg (${currency})`}><NumberInput value={calc.manual.pricePerKg} onChange={(v) => setCalc({ manual: { ...calc.manual, pricePerKg: v } })} /></Field>
                    <p className="text-xs text-muted sm:col-span-3">Manual material is not taken from stock.</p>
                  </div>
                )}
              </Section>

              <Section title="Equipment">
                <Field label="Printer">
                  <Select value={calc.printerId ?? ""} onChange={(e) => setCalc({ printerId: e.target.value || null })}>
                    <option value="">No printer</option>
                    {refs.printers.map((p) => <option key={p.id} value={p.id}>{p.internalName || p.model} · {p.powerW} W</option>)}
                  </Select>
                </Field>
                {!calc.printerId && (
                  <p className="flex items-start gap-2 text-sm text-amber-500">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> No printer selected: depreciation and electricity aren&apos;t included, the price will come out lower than real
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Print time (h)"><NumberInput value={calc.printH} onChange={(v) => setCalc({ printH: v })} suffix="h" /></Field>
                  <Field label="(min)"><NumberInput value={calc.printMin} onChange={(v) => setCalc({ printMin: v })} suffix="min" /></Field>
                </div>
                <Field label="Dryer">
                  <Select value={calc.dryerId ?? ""} onChange={(e) => setCalc({ dryerId: e.target.value || null })}>
                    <option value="">No dryer</option>
                    {refs.dryers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
              </Section>
            </>
          )}

          {calc.advanced && (
            <Section title="Labor">
              {([["operator", "Operator work", s.operatorRate], ["modeling", "Modeling", s.modelingRate], ["painting", "Painting", s.paintingRate]] as const).map(([k, label, rate]) => (
                <div key={k} className="grid items-end gap-2 sm:grid-cols-[1fr_140px]">
                  <div className="text-sm">
                    {label}
                    {rate === 0 ? (
                      <div className="text-xs text-amber-500">Enable the rate in <Link className="underline" href="/en/settings">Settings → Calculation</Link> to include this cost</div>
                    ) : (
                      <div className="text-xs text-muted">{m(rate)} / h</div>
                    )}
                  </div>
                  <NumberInput aria-label={`${label} hours`} value={calc.labor[k]} onChange={(v) => setCalc({ labor: { ...calc.labor, [k]: v } })} suffix="h" />
                </div>
              ))}
            </Section>
          )}

          <Section title="Consumables & packaging">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Warehouse items</span>
                <Link href="/en/warehouse" className="text-xs text-accent">Open warehouse</Link>
              </div>
              {calc.warehouseItems.length === 0 && <p className="text-xs text-muted">No items</p>}
              {calc.warehouseItems.map((w, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_44px] gap-2">
                  <Select aria-label="Warehouse item" value={w.shelfItemId} onChange={(e) => setCalc({ warehouseItems: calc.warehouseItems.map((x, j) => (j === i ? { ...x, shelfItemId: e.target.value } : x)) })}>
                    {refs.shelfItems.map((it) => <option key={it.id} value={it.id}>{it.name} · {m(it.unitCost)} · {it.quantity} left</option>)}
                  </Select>
                  <NumberInput aria-label="Quantity" value={w.qty} onChange={(v) => setCalc({ warehouseItems: calc.warehouseItems.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} />
                  <Button size="icon" variant="ghost" aria-label="Remove item" onClick={() => setCalc({ warehouseItems: calc.warehouseItems.filter((_, j) => j !== i) })}><X className="size-4" /></Button>
                </div>
              ))}
              <Button size="sm" disabled={!refs.shelfItems.length} onClick={() => setCalc({ warehouseItems: [...calc.warehouseItems, { shelfItemId: refs.shelfItems[0].id, qty: 1 }] })}>
                <Plus className="size-4" /> Add item
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Packaging"><NumberInput value={calc.packaging} onChange={(v) => setCalc({ packaging: v })} /></Field>
              <Field label="Delivery"><NumberInput value={calc.delivery} onChange={(v) => setCalc({ delivery: v })} /></Field>
              {calc.advanced && (
                <>
                  <Field label="Consumables"><NumberInput value={calc.consumables} onChange={(v) => setCalc({ consumables: v })} /></Field>
                  <Field label="Post-processing"><NumberInput value={calc.postProcessing} onChange={(v) => setCalc({ postProcessing: v })} /></Field>
                  <Field label="Print file cost"><NumberInput value={calc.printFileCost} onChange={(v) => setCalc({ printFileCost: v })} /></Field>
                </>
              )}
            </div>
          </Section>

          <Section title="Sale">
            <Field label="Client">
              <div className="flex gap-2">
                <Select
                  value={calc.clientId ?? ""}
                  onChange={(e) => {
                    const c = refs.clients.find((x) => x.id === e.target.value);
                    setCalc({ clientId: c?.id ?? null, ...(c && c.discountPct && !calc.discountPct ? { discountPct: c.discountPct } : {}) });
                  }}
                >
                  <option value="">No client</option>
                  {refs.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Button size="icon" aria-label="New client" onClick={() => setDialog("newClient")}><Plus className="size-4" /></Button>
              </div>
            </Field>
            {client && tier && calc.discountPct !== tier.discountPct && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400">
                {client.name} has {client.ordersCount} orders: loyalty discount {tier.discountPct}%
                <Button size="sm" onClick={() => setCalc({ discountPct: tier.discountPct })}>Apply</Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Discount (%)"><NumberInput value={calc.discountPct} onChange={(v) => setCalc({ discountPct: v })} suffix="%" /></Field>
              <Field label={`Discount (${currency})`}><NumberInput value={calc.discountAmount} onChange={(v) => setCalc({ discountAmount: v })} /></Field>
              <Field label="Tax regime">
                <Select
                  value={calc.customTaxPct != null ? "__custom" : calc.taxRegimeId ?? ""}
                  onChange={(e) => (e.target.value === "__custom" ? setCalc({ customTaxPct: 0, taxRegimeId: null }) : setCalc({ taxRegimeId: e.target.value || null, customTaxPct: null }))}
                >
                  <option value="">No tax</option>
                  {refs.taxRegimes.map((t) => <option key={t.id} value={t.id}>{t.name} {t.ratePct}%</option>)}
                  <option value="__custom">Custom %</option>
                </Select>
              </Field>
              {calc.customTaxPct != null ? (
                <Field label="Custom tax (%)"><NumberInput value={calc.customTaxPct} onChange={(v) => setCalc({ customTaxPct: v })} suffix="%" /></Field>
              ) : (
                <div className="flex items-end pb-3 text-xs"><Link href="/en/settings" className="text-accent">Add tax rate</Link></div>
              )}
              <Field label="Marketplace">
                <Select
                  value={calc.customMarketplacePct != null ? "__custom" : calc.marketplaceFeeId ?? ""}
                  onChange={(e) => (e.target.value === "__custom" ? setCalc({ customMarketplacePct: 0, marketplaceFeeId: null }) : setCalc({ marketplaceFeeId: e.target.value || null, customMarketplacePct: null }))}
                >
                  <option value="">No marketplace</option>
                  {refs.marketplaceFees.map((f) => <option key={f.id} value={f.id}>{f.name} {f.commissionPct}%</option>)}
                  <option value="__custom">Custom %</option>
                </Select>
              </Field>
              {calc.customMarketplacePct != null && (
                <Field label="Commission (%)"><NumberInput value={calc.customMarketplacePct} onChange={(v) => setCalc({ customMarketplacePct: v })} suffix="%" /></Field>
              )}
            </div>
            {!s.deductTaxes && (calc.taxRegimeId || calc.customTaxPct != null) && (
              <p className="text-xs text-muted">Taxes are switched off in Settings → Mandatory deductions, so the tax is not applied.</p>
            )}
          </Section>

          <Section title="Order details" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sale date"><Input type="date" value={dateInput(calc.saleDate)} onChange={(e) => setCalc({ saleDate: e.target.value })} /></Field>
              <Field label="Due date"><Input type="date" value={dateInput(calc.dueDate)} onChange={(e) => setCalc({ dueDate: e.target.value })} /></Field>
            </div>
            <Field label="Tags"><TagInput value={calc.tags} onChange={(tags) => setCalc({ tags })} /></Field>
            <Field label="Notes"><Textarea value={calc.notes} onChange={(e) => setCalc({ notes: e.target.value })} /></Field>
          </Section>
        </div>

        {/* desktop panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">{breakdown}</div>
        </aside>
      </div>

      {/* mobile: sticky totals bar that opens the full panel */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-xl lg:hidden"
      >
        <span><span className="block text-[11px] text-muted">Total cost</span><b className="tabular-nums">{m(r.totalCost)}</b></span>
        <span><span className="block text-[11px] text-muted">Sale price</span><b className="tabular-nums text-accent">{m(r.salePrice)}</b></span>
        <span><span className="block text-[11px] text-muted">Profit</span><b className={cn("tabular-nums", r.profit >= 0 ? "text-green-500" : "text-red-500")}>{m(r.profit)}</b></span>
      </button>
      <Dialog open={panelOpen} onClose={() => setPanelOpen(false)} title="Cost breakdown">{breakdown}</Dialog>

      {/* dialogs */}
      <TemplatesDialog
        open={dialog === "templates"}
        onClose={() => setDialog(null)}
        templates={templates}
        current={calc}
        onLoad={(t) => { load(t.input, { msg: `Template "${t.name}" loaded` }); setDialog(null); }}
      />
      <Dialog open={dialog === "drafts"} onClose={() => setDialog(null)} title={`Drafts (${drafts.length})`}>
        {drafts.length === 0 && <p className="text-sm text-muted">No drafts. Calculations are saved here automatically while you type (last 5).</p>}
        {drafts.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{d.name || "Untitled"}</div>
              <div className="text-xs text-muted">{new Date(d.updatedAt).toLocaleString("en-GB")}</div>
            </div>
            <Button size="sm" variant="primary" onClick={() => { load(d.input, { draftId: d.id, msg: `Draft "${d.name || "Untitled"}" opened` }); setDialog(null); }}>Open</Button>
            <Button size="icon" variant="ghost" aria-label="Delete draft" onClick={() => removeDraft.mutate(d.id)}><Trash2 className="size-4 text-red-500" /></Button>
          </div>
        ))}
      </Dialog>
      <SaveTemplateDialog
        open={dialog === "saveTemplate"}
        onClose={() => setDialog(null)}
        defaultName={calc.name}
        onSave={(name) => saveTemplate.mutate({ name, input: calc }, { onSuccess: () => setDialog(null) })}
      />
      <NewClientDialog open={dialog === "newClient"} onClose={() => setDialog(null)} onCreated={(id) => setCalc({ clientId: id })} />
    </div>
  );
}

function Breakdown({
  calc, setCalc, r, m, settings, filled, writeOffCost, onSaveOrder, onWriteOff, onWarehouse, saving,
}: {
  calc: CalcInput;
  setCalc: (p: Partial<CalcInput>) => void;
  r: ReturnType<typeof computeCalc>["result"];
  m: (x: number) => string;
  settings: Settings;
  filled: boolean;
  writeOffCost: number;
  onSaveOrder: () => void;
  onWriteOff: () => void;
  onWarehouse: () => void;
  saving: boolean;
}) {
  const line = (label: string, v: number, sub?: React.ReactNode) =>
    v > 0 || sub ? (
      <div className="flex items-start justify-between gap-2 py-1 text-sm">
        <span className="min-w-0">{label}{sub}</span>
        <span className="tabular-nums">{m(v)}</span>
      </div>
    ) : null;
  const production = r.costMaterial + r.costElectricity + r.costPrinter + r.costDryer;
  const effectiveMarkup = calc.priceMode === "auto" ? settings.defaultMarkupPct : calc.markupPct;

  return (
    <Card title="Cost breakdown" bodyClass="space-y-3">
      {!filled && <p className="rounded-xl bg-card-2 p-3 text-sm text-muted">Fill in the form to calculate</p>}

      <div>
        <div className="flex justify-between text-xs font-semibold tracking-wider text-muted uppercase"><span>Production</span><span>{m(production)}</span></div>
        {r.materialLines.length > 0 && (
          <div className="py-1 text-sm">
            <div className="flex justify-between"><span>Material</span><span className="tabular-nums">{m(r.costMaterial)}</span></div>
            {r.materialLines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 pl-2 text-xs text-muted">
                <ColorDot color={l.color} /> <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span>{Math.round(l.gramsEffective * 100) / 100} g</span><span className="w-16 text-right tabular-nums">{m(l.cost)}</span>
              </div>
            ))}
          </div>
        )}
        {line("Electricity", r.costElectricity)}
        {line("Printer", r.costPrinter)}
        {line("Dryer", r.costDryer)}
        {line("Labor", r.costLabor)}
        {line("Warehouse items", r.costWarehouse)}
        {line("Consumables", r.costConsumables)}
        {line("Post-processing", r.costPostprocessing)}
        {line("Print file", r.costOther)}
        {line("Packaging", r.costPackaging)}
        {line("Delivery", r.costDelivery)}
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Services</div>
        {calc.services.map((sv, i) => {
          const upd = (p: Partial<typeof sv>) => setCalc({ services: calc.services.map((x, j) => (j === i ? { ...x, ...p } : x)) });
          return (
            <div key={i} className="mb-2 space-y-2 rounded-xl bg-card-2 p-2">
              <div className="flex gap-2">
                <Input placeholder="Service name" value={sv.name} onChange={(e) => upd({ name: e.target.value })} />
                <Button size="icon" variant="ghost" aria-label="Remove service" onClick={() => setCalc({ services: calc.services.filter((_, j) => j !== i) })}><X className="size-4" /></Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberInput aria-label="Cost" placeholder="Cost" value={sv.cost} onChange={(v) => upd({ cost: v })} />
                <Select aria-label="Price mode" value={sv.mode} onChange={(e) => upd({ mode: e.target.value as "fixed" | "markup" })}>
                  <option value="fixed">Fixed</option>
                  <option value="markup">Markup %</option>
                </Select>
                <NumberInput aria-label={sv.mode === "fixed" ? "Sale price" : "Markup %"} placeholder={sv.mode === "fixed" ? "Sale price" : "%"} value={sv.price} onChange={(v) => upd({ price: v })} />
              </div>
            </div>
          );
        })}
        <Button size="sm" onClick={() => setCalc({ services: [...calc.services, { name: "", cost: 0, mode: "fixed", price: 0 }] })}><Plus className="size-4" /> Add service</Button>
      </div>

      <div className="flex justify-between border-t border-border pt-3 font-semibold"><span>Total cost</span><span className="tabular-nums">{m(r.totalCost)}</span></div>

      <Segmented
        className="w-full"
        value={calc.priceMode}
        onChange={(v) => setCalc({ priceMode: v, ...(v === "price" && !calc.targetPrice ? { targetPrice: Math.round(r.salePrice * 100) / 100 } : {}) })}
        options={[{ value: "auto", label: "Auto" }, { value: "markup", label: "Markup" }, { value: "price", label: "Price" }, { value: "profit", label: "Profit" }]}
      />
      {calc.priceMode === "auto" && <p className="text-xs text-muted">Price is calculated automatically: {settings.defaultMarkupPct}%</p>}
      {calc.priceMode === "markup" && <Field label="Markup (%)"><NumberInput value={calc.markupPct} onChange={(v) => setCalc({ markupPct: v })} suffix="%" /></Field>}
      {calc.priceMode === "price" && <Field label="Final price"><NumberInput value={calc.targetPrice} onChange={(v) => setCalc({ targetPrice: v })} /></Field>}
      {calc.priceMode === "profit" && <Field label="Desired profit"><NumberInput value={calc.targetProfit} onChange={(v) => setCalc({ targetProfit: v })} /></Field>}
      {r.warnings.includes("emptyMarkupBase") && filled && (
        <p className="flex items-center gap-2 text-xs text-amber-500"><AlertTriangle className="size-4" /> Nothing in the markup base has an amount, so the {effectiveMarkup}% markup adds nothing.</p>
      )}

      {(calc.priceMode === "auto" || calc.priceMode === "markup") && (
        <>
          <div>
            <div className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">Complexity markup</div>
            <div className="flex flex-wrap gap-1.5">
              {(["none", "simple", "medium", "complex"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCalc({ complexity: c })} className={cn("h-9 rounded-full border px-3 text-sm capitalize", calc.complexity === c ? "border-accent bg-accent/15 text-accent" : "border-border")}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <Field label="Marketing coefficient (%)"><NumberInput value={calc.marketingPct} onChange={(v) => setCalc({ marketingPct: v })} suffix="%" /></Field>
        </>
      )}

      <div className="space-y-1 rounded-xl bg-card-2 p-3">
        {r.discountTotal > 0.005 && <div className="flex justify-between text-sm text-muted"><span>Discount</span><span>−{m(r.discountTotal)}</span></div>}
        <div className="flex items-baseline justify-between"><span className="text-sm">Sale price</span><span className="text-2xl font-bold text-accent tabular-nums">{m(r.salePrice)}</span></div>
        <div className="flex items-baseline justify-between"><span className="text-sm">Profit</span><span className={cn("text-lg font-semibold tabular-nums", r.profit >= 0 ? "text-green-500" : "text-red-500")}>{m(r.profit)}</span></div>
        <div className="flex justify-between text-xs text-muted"><span>Margin {pct(r.marginPct)}</span><span>{pct(r.pctOfCost)} of cost</span></div>
        {(r.taxAmount > 0 || r.marketplaceFee > 0 || r.acquiringFee > 0) && (
          <div className="border-t border-border pt-1 text-xs text-muted">
            {r.taxAmount > 0 && <div className="flex justify-between"><span>Tax</span><span>{m(r.taxAmount)}</span></div>}
            {r.marketplaceFee > 0 && <div className="flex justify-between"><span>Marketplace fee</span><span>{m(r.marketplaceFee)}</span></div>}
            {r.acquiringFee > 0 && <div className="flex justify-between"><span>Acquiring</span><span>{m(r.acquiringFee)}</span></div>}
            <div className="flex justify-between font-medium text-fg"><span>Net profit</span><span>{m(r.netProfit)}</span></div>
          </div>
        )}
      </div>

      <Field label="Tips">
        <NumberInput value={calc.tips} onChange={(v) => setCalc({ tips: v })} />
      </Field>

      <div>
        <div className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">Order status</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((st) => (
            <button key={st.key} type="button" onClick={() => setCalc({ status: st.key })} className={cn("h-8 rounded-full px-3 text-xs", calc.status === st.key ? st.cls + " ring-1 ring-current" : "bg-card-2 text-muted")}>
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <Button variant="primary" className="w-full" disabled={!filled} loading={saving} onClick={onSaveOrder}><Save className="size-4" /> Save order</Button>
        <Button className="w-full" disabled={!filled || saving} onClick={onWarehouse}><Package className="size-4" /> Save to warehouse</Button>
        <Checkbox label="Include labor (operator/painting/modeling)" checked={calc.includeLabor} onChange={(v) => setCalc({ includeLabor: v })} />
        <div className="flex items-center justify-between text-sm"><span className="text-muted">Cost to write off</span><Badge className="bg-card-2">{m(writeOffCost)}</Badge></div>
        <Button variant="ghost" className="w-full" disabled={!filled || saving} onClick={onWriteOff}>Write off for personal use</Button>
      </div>
    </Card>
  );
}

function TemplatesDialog({ open, onClose, templates, current, onLoad }: { open: boolean; onClose: () => void; templates: Saved[]; current: CalcInput; onLoad: (t: Saved) => void }) {
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const save = useSave<Saved>("templates");
  const remove = useRemove("templates");
  const list = templates.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onClose={onClose} title={`Templates (${templates.length}/${MAX_TEMPLATES})`}>
      <Input placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <p className="text-sm text-muted">No templates</p>}
      {list.map((t) => (
        <div key={t.id} className="space-y-2 rounded-xl border border-border p-3">
          {renaming?.id === t.id ? (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate({ id: t.id, name: renaming.name }); setRenaming(null); }}>
              <Input autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
              <Button type="submit" variant="primary">Save</Button>
            </form>
          ) : (
            <div className="font-medium">{t.name}</div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onLoad(t)}>Load</Button>
            <Button size="sm" onClick={() => setRenaming({ id: t.id, name: t.name })}>Rename</Button>
            <Button size="sm" onClick={() => save.mutate({ id: t.id, input: current }, {})}>Update from current</Button>
            <Button size="sm" variant="ghost" onClick={() => deleteWithUndo(`Template "${t.name}"`, () => remove.mutate(t.id))}><Trash2 className="size-4 text-red-500" /></Button>
          </div>
        </div>
      ))}
    </Dialog>
  );
}

function SaveTemplateDialog({ open, onClose, defaultName, onSave }: { open: boolean; onClose: () => void; defaultName: string; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill each time it opens
  useEffect(() => { if (open) setName(defaultName); }, [open, defaultName]);
  return (
    <Dialog open={open} onClose={onClose} title="Save as template" footer={<Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save template</Button>}>
      <Field label="Template name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Dialog>
  );
}

function NewClientDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name: "", phone: "" });
  const save = useSave<Client>("clients", "Client created");
  return (
    <Dialog open={open} onClose={onClose} title="New client" footer={
      <Button variant="primary" disabled={!f.name.trim()} loading={save.isPending} onClick={() => save.mutate(f, { onSuccess: (c) => { onCreated(c.id); setF({ name: "", phone: "" }); onClose(); } })}>Save</Button>
    }>
      <Field label="Name *"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Phone"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
    </Dialog>
  );
}
