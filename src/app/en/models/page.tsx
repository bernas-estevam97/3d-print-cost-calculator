"use client";
// Model Catalog, main doc 6.8. The New model dialog doubles as the edit view.
import { Calculator, ClipboardPaste, Copy, FileUp, FolderPlus, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, useLocal } from "@/components/data-table";
import {
  Badge, Button, Checkbox, ColorDot, Dialog, EmptyState, Field, Input, ListSkeleton, NumberInput, PageHeader, PhotoInput, Segmented,
  Select, Textarea, Thumb, deleteWithUndo,
} from "@/components/ui";
import { upload, useCurrency, useList, useRemove, useSave } from "@/lib/client";
import { duration, money } from "@/lib/format";
import { parseJson } from "@/lib/json";
import { parseSlicerFile, SlicerError } from "@/lib/slicer";
import type { Filament, Model } from "@/lib/types";

type Form = {
  id?: string; name: string; photoUrl: string | null; fileUrl: string | null; sourceLink: string; groupId: string | null;
  printH: number; printM: number; extraCosts: number; pricePerPiece: number | null; complexity: string; sellAsProduct: boolean;
  productDescription: string; filaments: { filamentId: string | null; grams: number }[];
};

const blank = (): Form => ({
  name: "", photoUrl: null, fileUrl: null, sourceLink: "", groupId: null, printH: 0, printM: 0, extraCosts: 0,
  pricePerPiece: null, complexity: "none", sellAsProduct: false, productDescription: "", filaments: [{ filamentId: null, grams: 0 }],
});

const toForm = (x: Model): Form => ({
  id: x.id, name: x.name, photoUrl: x.photoUrl, fileUrl: x.fileUrl, sourceLink: x.sourceLink, groupId: x.groupId,
  printH: Math.floor(x.printTimeMin / 60), printM: Math.round(x.printTimeMin % 60), extraCosts: x.extraCosts, pricePerPiece: x.pricePerPiece,
  complexity: x.complexity, sellAsProduct: x.sellAsProduct, productDescription: x.productDescription,
  filaments: x.filaments.length ? x.filaments.map((f) => ({ filamentId: f.filamentId, grams: f.grams })) : [{ filamentId: null, grams: 0 }],
});

function ModelDialog({ form, setForm, filaments, groups }: { form: Form | null; setForm: (f: Form | null) => void; filaments: Filament[]; groups: { id: string; name: string }[] }) {
  const save = useSave<Model>("models", "Model saved");
  const [busy, setBusy] = useState(false);
  if (!form) return null;
  const cur: Form = form;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...cur, [k]: v });

  async function onFile(file: File) {
    setBusy(true);
    try {
      const fileUrl = await upload(file, "model");
      let patch: Partial<Form> = { fileUrl };
      if (!file.name.toLowerCase().endsWith(".stl")) {
        const r = await parseSlicerFile(file);
        const match = (color?: string) => filaments.find((f) => color && f.colors.some((c) => c.toLowerCase() === color.toLowerCase().slice(0, 7)))?.id ?? null;
        patch = {
          ...patch,
          printH: Math.floor(r.timeMin / 60),
          printM: r.timeMin % 60,
          ...(r.filaments.length ? { filaments: r.filaments.slice(0, 16).map((f) => ({ filamentId: match(f.color), grams: f.grams })) } : {}),
        };
        toast.success("Weight and time filled from the file");
      }
      setForm({ ...cur, ...patch, name: cur.name || file.name.replace(/\.(gcode|3mf|stl)$/i, "") });
    } catch (e) {
      toast.error(e instanceof SlicerError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const submit = () => {
    const { id, printH, printM, ...rest } = form;
    save.mutate(
      { id, ...rest, printTimeMin: printH * 60 + printM, filaments: form.filaments.filter((f) => f.grams > 0) } as never,
      { onSuccess: () => setForm(null) },
    );
  };

  return (
    <Dialog open onClose={() => setForm(null)} title={form.id ? "Edit model" : "New model"} wide footer={
      <>
        <Button onClick={() => setForm(null)}>Cancel</Button>
        <Button variant="primary" disabled={!form.name.trim()} loading={save.isPending} onClick={submit}>Save</Button>
      </>
    }>
      <Field label="Name *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <PhotoInput value={form.photoUrl} onChange={(u) => set("photoUrl", u)} />
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border p-3 text-center text-sm text-muted hover:border-accent"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
          {form.fileUrl ? "File attached · replace" : "Model file (.gcode / .3mf auto-fills weight and time, .stl)"}
          <input type="file" accept=".gcode,.3mf,.stl" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Group">
          <Select value={form.groupId ?? ""} onChange={(e) => set("groupId", e.target.value || null)}>
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={`Filaments (${form.filaments.length}/16)`}>
        <div className="space-y-2">
          {form.filaments.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_44px] gap-2">
              <Select aria-label="Filament" value={row.filamentId ?? ""} onChange={(e) => set("filaments", form.filaments.map((x, j) => (j === i ? { ...x, filamentId: e.target.value || null } : x)))}>
                <option value="">Choose filament</option>
                {filaments.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
              <NumberInput aria-label="Grams" value={row.grams} onChange={(v) => set("filaments", form.filaments.map((x, j) => (j === i ? { ...x, grams: v } : x)))} suffix="g" />
              <Button size="icon" variant="ghost" aria-label="Remove filament" disabled={form.filaments.length <= 1} onClick={() => set("filaments", form.filaments.filter((_, j) => j !== i))}><X className="size-4" /></Button>
            </div>
          ))}
          {form.filaments.length < 16 && <Button size="sm" onClick={() => set("filaments", [...form.filaments, { filamentId: null, grams: 0 }])}><Plus className="size-4" /> Add filament</Button>}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Print time (h)"><NumberInput value={form.printH} onChange={(v) => set("printH", v)} /></Field>
        <Field label="(min)"><NumberInput value={form.printM} onChange={(v) => set("printM", v)} /></Field>
        <Field label="Extra costs"><NumberInput value={form.extraCosts} onChange={(v) => set("extraCosts", v)} /></Field>
        <Field label="Price per piece"><NumberInput value={form.pricePerPiece ?? 0} onChange={(v) => set("pricePerPiece", v || null)} /></Field>
      </div>
      <p className="-mt-2 text-xs text-muted">Price per piece is used as the sale price when ordering, instead of the cost-based price.</p>
      <Field label="Manufacturing complexity">
        <Select value={form.complexity} onChange={(e) => set("complexity", e.target.value)}>
          <option value="none">Not set</option><option value="simple">Simple</option><option value="medium">Medium</option><option value="complex">Complex</option>
        </Select>
      </Field>
      <Field label="Source link">
        <div className="flex gap-2">
          <Input type="url" value={form.sourceLink} onChange={(e) => set("sourceLink", e.target.value)} placeholder="https://makerworld.com/…" />
          <Button size="icon" aria-label="Copy link" disabled={!form.sourceLink} onClick={() => navigator.clipboard.writeText(form.sourceLink).then(() => toast.success("Copied"))}><Copy className="size-4" /></Button>
          <Button size="icon" aria-label="Paste link" onClick={() => navigator.clipboard.readText().then((t) => set("sourceLink", t.trim())).catch(() => toast.error("Clipboard not available"))}><ClipboardPaste className="size-4" /></Button>
        </div>
      </Field>
      <Checkbox label="Sell this model as a product" checked={form.sellAsProduct} onChange={(v) => set("sellAsProduct", v)} />
      {form.sellAsProduct && <Field label="Product description"><Textarea value={form.productDescription} onChange={(e) => set("productDescription", e.target.value)} /></Field>}
    </Dialog>
  );
}

export default function ModelsPage() {
  const { data, isLoading } = useList<Model>("models");
  const { data: filaments = [] } = useList<Filament>("filaments");
  const { data: groups = [] } = useList<{ id: string; name: string }>("model-groups");
  const saveGroup = useSave<{ id: string; name: string }>("model-groups", "Group created");
  const remove = useRemove("models");
  const currency = useCurrency();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [view, setView] = useLocal<"table" | "cards">("models:view", "table");
  const [form, setForm] = useState<Form | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);

  const all = data ?? [];
  const rows = all.filter((x) => (!group || x.groupId === group) && x.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Model Catalog"
        info="Saved models prefill the calculator with filaments, grams, time and price"
        subtitle={`${all.length} models`}
        actions={
          <>
            <Button onClick={() => setGroupName("")}><FolderPlus className="size-4" /> Group</Button>
            <Button variant="primary" onClick={() => setForm(blank())}><Plus className="size-4" /> New model</Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {groups.length > 0 && (
          <Select className="w-40" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        )}
        <Segmented value={view} onChange={setView} options={[{ value: "table", label: "Table" }, { value: "cards", label: "Grid" }]} />
      </div>
      {isLoading ? <ListSkeleton /> : (
        <DataTable
          id="models"
          view={view}
          rows={rows}
          rowKey={(x) => x.id}
          onRowClick={(x) => setForm(toForm(x))}
          empty={<EmptyState text={all.length ? "No models match" : "No models yet"} action={<Button variant="primary" onClick={() => setForm(blank())}>Add model</Button>} />}
          columns={[
            { key: "name", header: "Name", fixed: true, sort: (x) => x.name, cell: (x) => (
              <div className="flex items-center gap-3">
                <Thumb src={x.photoUrl} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{x.name}</div>
                  {x.filaments[0]?.filament && (
                    <div className="flex items-center gap-1 text-xs text-muted"><ColorDot color={parseJson<string[]>(x.filaments[0].filament.colors, [])[0]} /> {x.filaments[0].filament.name}</div>
                  )}
                </div>
              </div>
            ) },
            { key: "group", header: "Group", cell: (x) => x.group?.name ?? "—" },
            { key: "grams", header: "Material / pc", sort: (x) => x.materialPerPieceG, cell: (x) => `${Math.round(x.materialPerPieceG * 100) / 100} g` },
            { key: "time", header: "Print time", sort: (x) => x.printTimeMin, cell: (x) => duration(x.printTimeMin) },
            { key: "price", header: "Price / pc", sort: (x) => x.pricePerPiece ?? 0, cell: (x) => (x.pricePerPiece != null ? money(x.pricePerPiece, currency) : "—") },
            { key: "sale", header: "For sale", cell: (x) => (x.sellAsProduct ? <Badge className="bg-green-500/15 text-green-500">For sale</Badge> : "—") },
            { key: "file", header: "File", cell: (x) => (x.fileUrl ? <a href={x.fileUrl} download onClick={(e) => e.stopPropagation()} className="text-accent">Download</a> : "—") },
            { key: "actions", header: "", fixed: true, cell: (x) => (
              <div className="flex justify-end gap-1">
                <Link href={`/en/calculator?model=${x.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex h-9 items-center gap-1 rounded-xl border border-border px-2 text-xs hover:bg-card-2">
                  <Calculator className="size-4" /> To calculator
                </Link>
                <Button size="icon" variant="ghost" aria-label={`Delete ${x.name}`} onClick={(e) => { e.stopPropagation(); deleteWithUndo(x.name, () => remove.mutate(x.id)); }}>
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </div>
            ) },
          ]}
        />
      )}
      <ModelDialog form={form} setForm={setForm} filaments={filaments} groups={groups} />
      <Dialog open={groupName !== null} onClose={() => setGroupName(null)} title="New model group" footer={
        <Button variant="primary" disabled={!groupName?.trim()} onClick={() => saveGroup.mutate({ name: groupName! }, { onSuccess: () => setGroupName(null) })}>Create</Button>
      }>
        <Field label="Name"><Input autoFocus value={groupName ?? ""} onChange={(e) => setGroupName(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}
