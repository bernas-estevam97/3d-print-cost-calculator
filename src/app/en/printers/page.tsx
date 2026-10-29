"use client";
import { FolderPlus, Plus, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, useLocal } from "@/components/data-table";
import { emptyPrinter, PrinterFields, type Printer } from "@/components/printer-form";
import { Badge, Button, Dialog, EmptyState, Field, Input, ListSkeleton, PageHeader, Segmented, Thumb } from "@/components/ui";
import { useCurrency, useList, useSave } from "@/lib/client";
import { money } from "@/lib/format";

export default function PrintersPage() {
  const { data, isLoading } = useList<Printer>("printers");
  const { data: groups = [] } = useList<{ id: string; name: string }>("printer-groups");
  const save = useSave<Printer>("printers", "Printer added");
  const saveGroup = useSave<{ id: string; name: string }>("printer-groups", "Group created");
  const currency = useCurrency();
  const router = useRouter();
  const [tech, setTech] = useState("all");
  const [q, setQ] = useState("");
  const [view, setView] = useLocal<"table" | "cards">("printers:view", "table");
  const [form, setForm] = useState<Partial<Printer> | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);

  const all = data ?? [];
  const rows = all.filter(
    (p) => (tech === "all" || p.technology === tech) && `${p.manufacturer} ${p.model} ${p.internalName}`.toLowerCase().includes(q.toLowerCase()),
  );
  const due = all.filter((p) => p.maintenanceDue);

  return (
    <div>
      <PageHeader
        title="Printers"
        info="Printers used for electricity and amortization in the calculator"
        subtitle={`${all.length} printers`}
        actions={
          <>
            <Link href="/en/dryers" className="px-2 text-sm text-muted hover:text-fg">Dryers</Link>
            <Button onClick={() => setGroupName("")}><FolderPlus className="size-4" /> Group</Button>
            <Button variant="primary" onClick={() => setForm(emptyPrinter())}><Plus className="size-4" /> New printer</Button>
          </>
        }
      />
      {due.map((p) => (
        <Link
          key={p.id}
          href={`/en/printers/${p.id}?tab=maintenance`}
          className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400"
        >
          <Wrench className="size-4" /> Maintenance needed: {p.internalName || p.model}
        </Link>
      ))}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={tech}
          onChange={setTech}
          options={[
            { value: "all", label: `All ${all.length}` },
            { value: "FDM", label: `FDM ${all.filter((p) => p.technology === "FDM").length}` },
            { value: "SLA", label: `SLA ${all.filter((p) => p.technology === "SLA").length}` },
          ]}
        />
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search printers" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented value={view} onChange={setView} options={[{ value: "table", label: "Table" }, { value: "cards", label: "Grid" }]} />
      </div>
      {isLoading ? (
        <ListSkeleton />
      ) : (
        <DataTable
          id="printers"
          view={view}
          rows={rows}
          rowKey={(p) => p.id}
          onRowClick={(p) => router.push(`/en/printers/${p.id}`)}
          empty={<EmptyState text="No printers yet" action={<Button variant="primary" onClick={() => setForm(emptyPrinter())}>Add printer</Button>} />}
          columns={[
            {
              key: "name", header: "Name", fixed: true, sort: (p) => p.internalName || p.model,
              cell: (p) => (
                <div className="flex items-center gap-3">
                  <Thumb src={p.photoUrl} />
                  <div>
                    <div className="font-medium">{p.internalName || p.model}</div>
                    <div className="text-xs text-muted">{p.manufacturer} {p.model}</div>
                  </div>
                </div>
              ),
            },
            { key: "group", header: "Group", cell: (p) => p.group?.name ?? "—" },
            { key: "tech", header: "Technology", cell: (p) => <Badge className="bg-accent/15 text-accent">{p.technology}</Badge> },
            {
              key: "status", header: "Status",
              cell: (p) => (p.maintenanceDue ? <Badge className="bg-amber-500/15 text-amber-500">Maintenance</Badge> : <Badge className="bg-green-500/15 text-green-500">Ready</Badge>),
            },
            { key: "power", header: "Power", sort: (p) => p.powerW, cell: (p) => `${p.powerW} W` },
            { key: "price", header: "Price", sort: (p) => p.price, cell: (p) => money(p.price, currency) },
            { key: "life", header: "Lifetime", sort: (p) => p.hoursUsed, cell: (p) => `${Math.round(p.hoursUsed).toLocaleString("en-US")} h / ${p.lifetimeH.toLocaleString("en-US")} h` },
            { key: "payback", header: "Payback", sort: (p) => p.paybackPct, cell: (p) => `${Math.round(p.paybackPct)}%` },
          ]}
        />
      )}
      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title="New printer"
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} disabled={!form?.model?.trim()} onClick={() => save.mutate(form!, { onSuccess: () => setForm(null) })}>
              Save
            </Button>
          </>
        }
      >
        {form && <PrinterFields value={form} onChange={setForm} groups={groups} />}
      </Dialog>
      <Dialog
        open={groupName !== null}
        onClose={() => setGroupName(null)}
        title="New printer group"
        footer={
          <Button variant="primary" disabled={!groupName?.trim()} onClick={() => saveGroup.mutate({ name: groupName! }, { onSuccess: () => setGroupName(null) })}>
            Create
          </Button>
        }
      >
        <Field label="Name"><Input autoFocus value={groupName ?? ""} onChange={(e) => setGroupName(e.target.value)} /></Field>
        {groups.length > 0 && <p className="text-sm text-muted">Existing: {groups.map((g) => g.name).join(", ")}</p>}
      </Dialog>
    </div>
  );
}
