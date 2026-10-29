"use client";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, ClientFields, pickClient } from "@/components/client-form";
import { Badge, Button, Card, ListSkeleton, PaidBadge, Segmented, StatusBadge, deleteWithUndo } from "@/components/ui";
import { useApi, useCurrency, useList, useQueryState, useRemove, useSave } from "@/lib/client";
import { dateUS, money } from "@/lib/format";
import type { Client, Order } from "@/lib/types";

type Doc = { id: string; type: string; number: string; amount: number; clientId: string | null; createdAt: string };

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const currency = useCurrency();
  const { data: c, isLoading } = useApi<Client>(`/api/clients/${id}`);
  const { data: orders = [] } = useList<Order>("orders");
  const { data: docs = [] } = useList<Doc>("documents");
  const save = useSave<Client>("clients");
  const remove = useRemove("clients");
  const [tab, setTab] = useQueryState("tab", "contacts");
  const [form, setForm] = useState<Partial<Client> | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- edit a copy of the loaded client
  useEffect(() => { if (c) setForm(c); }, [c]);

  if (isLoading || !c || !form) return <ListSkeleton />;
  const mine = orders.filter((o) => o.client?.id === c.id);
  const myDocs = docs.filter((d) => d.clientId === c.id);

  return (
    <div className="max-w-4xl">
      <Link href="/en/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Back to list</Link>
      <div className="mb-4 flex items-center gap-4">
        <Avatar c={c} className="size-16 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <div className="text-sm text-muted">{c.ordersCount} orders · {money(c.completedAmount, currency)} <Badge className="ml-1 bg-card-2">{c.level}</Badge></div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Delete client" onClick={() => deleteWithUndo(c.name, () => remove.mutate(c.id, { onSuccess: () => router.push("/en/clients") }))}>
          <Trash2 className="size-5 text-red-500" />
        </Button>
      </div>
      <div className="mb-4 overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "contacts", label: "Contacts" }, { value: "company", label: "Company details" },
          { value: "orders", label: `Orders (${mine.length})` }, { value: "documents", label: "Documents" },
        ]} />
      </div>
      {(tab === "contacts" || tab === "company") && (
        <Card>
          <ClientFields value={form} onChange={setForm} section={tab === "company" ? "company" : "contacts"} />
          <div className="mt-4 flex justify-end">
            <Button variant="primary" disabled={!form.name?.trim()} loading={save.isPending} onClick={() => save.mutate({ id: c.id, ...pickClient(form) })}>Save</Button>
          </div>
        </Card>
      )}
      {tab === "orders" && (
        <Card bodyClass="p-0">
          {mine.length === 0 && <p className="p-4 text-sm text-muted">No orders yet.</p>}
          {mine.map((o) => (
            <Link key={o.id} href={`/en/orders/${o.id}`} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-card-2">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{o.name}</div><div className="text-xs text-muted">{dateUS(o.saleDate)}</div></div>
              <StatusBadge status={o.status} /><PaidBadge paid={o.paid} />
              <span className="w-20 text-right font-medium">{money(o.salePrice, currency)}</span>
            </Link>
          ))}
        </Card>
      )}
      {tab === "documents" && (
        <Card bodyClass="p-0">
          {myDocs.length === 0 && <p className="p-4 text-sm text-muted">No documents yet. Create them from an order or the Documents page.</p>}
          {myDocs.map((d) => (
            <a key={d.id} href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noreferrer" className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0 hover:bg-card-2">
              <span className="font-mono">{d.number}</span>
              <span className="text-sm text-muted">{dateUS(d.createdAt)} · {money(d.amount, currency)}</span>
            </a>
          ))}
        </Card>
      )}
    </div>
  );
}
