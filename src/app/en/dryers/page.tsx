"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, EmptyState, Field, Input, ListSkeleton, NumberInput, PageHeader, deleteWithUndo } from "@/components/ui";
import { useCurrency, useList, useRemove, useSave } from "@/lib/client";
import { money } from "@/lib/format";

type Dryer = { id: string; name: string; powerW: number; price: number; lifetimeH: number; hoursUsed: number };
const blank = (): Partial<Dryer> => ({ name: "", powerW: 50, price: 0, lifetimeH: 5000, hoursUsed: 0 });

export default function DryersPage() {
  const { data, isLoading } = useList<Dryer>("dryers");
  const save = useSave<Dryer>("dryers");
  const remove = useRemove("dryers");
  const currency = useCurrency();
  const [form, setForm] = useState<Partial<Dryer> | null>(null);
  const set = (k: keyof Dryer, v: unknown) => setForm({ ...form!, [k]: v });
  const rows = data ?? [];
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Dryers"
        subtitle={`${rows.length} dryers`}
        actions={<Button variant="primary" onClick={() => setForm(blank())}><Plus className="size-4" /> New dryer</Button>}
      />
      {isLoading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState text="No dryers yet" action={<Button variant="primary" onClick={() => setForm(blank())}>Add dryer</Button>} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((d) => (
            <div key={d.id} onClick={() => setForm(d)} className="cursor-pointer rounded-2xl border border-border bg-card p-4 hover:bg-card-2">
              <div className="flex items-start justify-between">
                <div className="font-medium">{d.name}</div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete dryer"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteWithUndo(d.name, () => remove.mutate(d.id));
                  }}
                >
                  <Trash2 className="size-4 text-red-500" />
                </Button>
              </div>
              <div className="text-sm text-muted">{d.powerW} W · {money(d.price, currency)} · {d.hoursUsed} / {d.lifetimeH} h</div>
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit dryer" : "New dryer"}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!form?.name?.trim()}
              loading={save.isPending}
              onClick={() => {
                const { id, name, powerW, price, lifetimeH, hoursUsed } = form!;
                save.mutate({ id, name, powerW, price, lifetimeH, hoursUsed }, { onSuccess: () => setForm(null) });
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *" className="sm:col-span-2"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Power (W)"><NumberInput value={form.powerW} onChange={(v) => set("powerW", v)} /></Field>
            <Field label="Price"><NumberInput value={form.price} onChange={(v) => set("price", v)} /></Field>
            <Field label="Lifetime (h)"><NumberInput value={form.lifetimeH} onChange={(v) => set("lifetimeH", v)} /></Field>
            <Field label="Hours used"><NumberInput value={form.hoursUsed} onChange={(v) => set("hoursUsed", v)} /></Field>
          </div>
        )}
      </Dialog>
    </div>
  );
}
