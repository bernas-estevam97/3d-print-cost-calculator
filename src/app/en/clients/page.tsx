"use client";
// Clients, main doc 6.5.
import { Plus, Search, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, ClientFields, pickClient } from "@/components/client-form";
import { CsvTools } from "@/components/csv-tools";
import { DataTable, useLocal } from "@/components/data-table";
import { Badge, Button, Dialog, EmptyState, Input, ListSkeleton, PageHeader, Segmented, Select, deleteWithUndo } from "@/components/ui";
import { api, useCurrency, useList, useRemove, useSave } from "@/lib/client";
import { num, toCsv } from "@/lib/csv";
import { money } from "@/lib/format";
import type { Client } from "@/lib/types";

const LEVEL_CLS: Record<string, string> = {
  Beginner: "bg-blue-500/15 text-blue-500",
  Regular: "bg-purple-500/15 text-purple-500",
  Pro: "bg-accent/15 text-accent",
};

// CSV: plain fields plus the category by name (created on import when missing)
const CLIENT_FIELDS = ["name", "companyName", "contactPerson", "phone", "email", "telegram", "address", "source", "discountPct", "taxId", "signer", "note"] as const;
const CLIENT_COLUMNS = [...CLIENT_FIELDS, "category"];
const clientsCsv = (rows: Client[]) => toCsv(CLIENT_COLUMNS, rows.map((c) => [...CLIENT_FIELDS.map((k) => c[k]), c.category?.name]));

async function importClients(rows: Record<string, string>[]) {
  const cats = await api<{ id: string; name: string }[]>("/api/client-categories");
  let n = 0;
  for (const r of rows) {
    if (!r.name) continue;
    let cat = r.category ? cats.find((c) => c.name.toLowerCase() === r.category.toLowerCase()) : undefined;
    if (r.category && !cat) cats.push((cat = await api<{ id: string; name: string }>("/api/client-categories", { method: "POST", json: { name: r.category } })));
    const fields = Object.fromEntries(CLIENT_FIELDS.map((k) => [k, r[k] ?? ""]));
    await api("/api/clients", { method: "POST", json: { ...fields, discountPct: num(r.discountPct), categoryId: cat?.id ?? null } });
    n++;
  }
  return n;
}

export default function ClientsPage() {
  const { data, isLoading } = useList<Client>("clients");
  const save = useSave<Client>("clients", "Client saved");
  const remove = useRemove("clients");
  const currency = useCurrency();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [view, setView] = useLocal<"table" | "cards">("clients:view", "table");
  const [form, setForm] = useState<Partial<Client> | null>(null);

  const all = data ?? [];
  const rows = all.filter((c) => (!level || c.level === level) && `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Clients"
        info="Levels come from the number of orders: Beginner 0–4, Regular 5–14, Pro 15+"
        subtitle={`${all.length} clients`}
        actions={
          <>
            <CsvTools name="clients" label="clients" columns={CLIENT_COLUMNS} toCsv={() => clientsCsv(rows)} onImport={importClients} />
            <Button variant="primary" onClick={() => setForm({ name: "", discountPct: 0 })}><Plus className="size-4" /> New client</Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-40" aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          <option>Beginner</option>
          <option>Regular</option>
          <option>Pro</option>
        </Select>
        <Segmented value={view} onChange={setView} options={[{ value: "table", label: "Table" }, { value: "cards", label: "Cards" }]} />
      </div>
      {isLoading ? <ListSkeleton /> : (
        <DataTable
          id="clients"
          view={view}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => router.push(`/en/clients/${c.id}`)}
          empty={<EmptyState text={all.length ? "No clients match" : "No clients yet"} action={<Button variant="primary" onClick={() => setForm({ name: "" })}>Add client</Button>} />}
          columns={[
            { key: "name", header: "Name", fixed: true, sort: (c) => c.name, cell: (c) => (
              <div className="flex items-center gap-3"><Avatar c={c} /><div><div className="font-medium">{c.name}</div>{c.category && <div className="text-xs text-muted">{c.category.name}</div>}</div></div>
            ) },
            { key: "phone", header: "Phone", cell: (c) => c.phone ? <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-accent">{c.phone}</a> : "—" },
            { key: "telegram", header: "Telegram", cell: (c) => c.telegram ? (
              <a href={`https://t.me/${c.telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" aria-label={`Telegram ${c.telegram}`} onClick={(e) => e.stopPropagation()} className="text-blue-500"><Send className="size-4" /></a>
            ) : "—" },
            { key: "level", header: "Level", sort: (c) => c.ordersCount, cell: (c) => <Badge className={LEVEL_CLS[c.level]}>{c.level}</Badge> },
            { key: "orders", header: "Orders", sort: (c) => c.ordersCount, cell: (c) => c.ordersCount },
            { key: "completed", header: "Completed", sort: (c) => c.completedAmount, cell: (c) => money(c.completedAmount, currency) },
            { key: "discount", header: "Discount", sort: (c) => c.discountPct, cell: (c) => (c.discountPct ? `${c.discountPct}%` : "—") },
            { key: "del", header: "", fixed: true, cell: (c) => (
              <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} className="opacity-60 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteWithUndo(c.name, () => remove.mutate(c.id)); }}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
            ) },
          ]}
        />
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="New client" footer={
        <>
          <Button onClick={() => setForm(null)}>Cancel</Button>
          <Button variant="primary" disabled={!form?.name?.trim()} loading={save.isPending} onClick={() => save.mutate(pickClient(form!), { onSuccess: () => setForm(null) })}>Save</Button>
        </>
      }>
        {form && <ClientFields value={form} onChange={setForm} />}
      </Dialog>
    </div>
  );
}
