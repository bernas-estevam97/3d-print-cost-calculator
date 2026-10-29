"use client";
// Kanban, main doc 6.4. Drag works by mouse and touch; every card also has a status
// dropdown so the board is never drag-only (main doc 9.1).
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, List, Plus, Printer, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocal } from "@/components/data-table";
import { Badge, Checkbox, Input, ListSkeleton, PageHeader, PaidBadge, Select, cn } from "@/components/ui";
import { api, useCurrency, useList, useMutate } from "@/lib/client";
import { dateDot, duration, money } from "@/lib/format";
import { STATUSES } from "@/lib/status";
import { printerName, type Order } from "@/lib/types";

type PrinterLite = { id: string; model: string; internalName: string };

const SORTS: Record<string, [string, (a: Order, b: Order) => number]> = {
  color: ["Color → time ↑", (a, b) => (a.materials[0]?.color ?? "").localeCompare(b.materials[0]?.color ?? "") || a.printTimeMin * a.quantity - b.printTimeMin * b.quantity],
  due: ["Due date ↑", (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")],
  newest: ["Newest first", (a, b) => b.saleDate.localeCompare(a.saleDate)],
  price: ["Price ↓", (a, b) => b.salePrice - a.salePrice],
};

function OrderCard({ o, currency, selected, focused, onClick, onStatus, overlay }: {
  o: Order; currency: string; selected?: boolean; focused?: boolean; overlay?: boolean;
  onClick?: (e: React.MouseEvent) => void; onStatus?: (s: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: o.id, disabled: overlay });
  const overdue = o.dueDate && new Date(o.dueDate) < new Date() && !["done", "cancelled", "closed"].includes(o.status);
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      onClick={onClick}
      data-order={o.id}
      className={cn(
        "cursor-grab touch-manipulation space-y-2 rounded-xl border border-border bg-card p-3 text-sm shadow-sm active:cursor-grabbing",
        isDragging && "opacity-30",
        selected && "ring-2 ring-accent",
        focused && "outline-2 outline-accent",
        overlay && "rotate-2 shadow-xl",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium break-words">{o.name}</span>
        <PaidBadge paid={o.paid} />
      </div>
      {o.materials.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {o.materials.slice(0, 3).map((mt) => (
            <span key={mt.id} className="inline-flex items-center gap-1 rounded-full bg-card-2 px-2 py-0.5 text-[11px]">
              <span className="size-2 rounded-full border border-black/20" style={{ background: mt.color }} />
              {mt.name.split("·")[0].trim()}
            </span>
          ))}
          {o.materials.length > 3 && <span className="text-[11px] text-muted">+{o.materials.length - 3}</span>}
        </div>
      )}
      {o.printTimeMin > 0 && <div className="text-xs text-muted">{duration(o.printTimeMin * o.quantity)}{o.quantity > 1 ? ` · ${o.quantity} pcs` : ""}</div>}
      <div className="text-xs text-muted">{o.client?.name ?? "No client"}</div>
      {o.printer && <div className="flex items-center gap-1 text-xs text-muted"><Printer className="size-3" /> {printerName(o.printer)}</div>}
      {o.dueDate && <div className={cn("flex items-center gap-1 text-xs", overdue ? "text-red-500" : "text-muted")}><CalendarClock className="size-3" /> Due {dateDot(o.dueDate)}</div>}
      <div className="flex items-center justify-between gap-2">
        <b>{money(o.salePrice, currency)}</b>
        {onStatus && (
          <select
            aria-label="Change status"
            value={o.status}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onStatus(e.target.value)}
            className="h-8 max-w-32 rounded-lg border border-border bg-card-2 px-1 text-xs"
          >
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

function Column({ id, title, orders, children }: { id: string; title: string; orders: Order[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const min = orders.reduce((a, o) => a + o.printTimeMin * o.quantity, 0);
  const g = orders.reduce((a, o) => a + o.materials.reduce((x, y) => x + y.grams, 0), 0);
  return (
    <section ref={setNodeRef} className={cn("flex w-72 shrink-0 snap-start flex-col rounded-2xl border border-border bg-card-2/50 p-2", isOver && "border-accent bg-accent/5")}>
      <header className="mb-2 px-1">
        <div className="flex items-center justify-between text-sm font-semibold">{title}<Badge className="bg-card">{orders.length}</Badge></div>
        <div className="text-[11px] text-muted">{duration(min)} · {Math.round(g)} g</div>
      </header>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

export default function KanbanPage() {
  const { data, isLoading } = useList<Order>("orders");
  const { data: printers = [] } = useList<PrinterLite>("printers");
  const currency = useCurrency();
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sort, setSort] = useLocal("kanban:sort", "color");
  const [byPrinter, setByPrinter] = useLocal("kanban:byPrinter", false);
  const [showClosed, setShowClosed] = useLocal("kanban:showClosed", true);
  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // press-and-hold on touch, so a swipe still scrolls the board
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const orders = useMemo(
    () => (data ?? []).filter((o) => !o.personalUse && `${o.name} ${o.number} ${o.client?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())).sort(SORTS[sort]?.[1] ?? SORTS.color[1]),
    [data, q, sort],
  );
  const columns = STATUSES.filter((s) => showClosed || !["cancelled", "closed"].includes(s.key));

  const move = useMutate<{ ids: string[]; status?: string; printerId?: string | null }>(async ({ ids, status, printerId }) => {
    for (const id of ids) {
      if (printerId !== undefined) await api(`/api/orders/${id}`, { method: "PATCH", json: { printerId } });
      if (status) await api(`/api/orders/${id}/status`, { method: "PATCH", json: { status } });
    }
  });
  const remove = useMutate<string[]>(async (ids) => { for (const id of ids) await api(`/api/orders/${id}`, { method: "DELETE" }); }, "Deleted");

  /** optimistic: move cards now, server catches up */
  function apply(ids: string[], status?: string, printerId?: string | null) {
    qc.setQueryData<Order[]>(["/api/orders"], (old) =>
      old?.map((o) => (ids.includes(o.id) ? { ...o, ...(status ? { status } : {}), ...(printerId !== undefined ? { printerId } : {}) } : o)),
    );
    move.mutate({ ids, status, printerId }, { onError: () => qc.invalidateQueries() });
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const [lane, status] = String(e.over.id).split("|");
    const id = String(e.active.id);
    const ids = selected.includes(id) ? selected : [id];
    const o = orders.find((x) => x.id === id);
    const printerId = byPrinter ? (lane === "none" ? null : lane) : undefined;
    if (o && (o.status !== status || (printerId !== undefined && o.printerId !== printerId))) {
      apply(ids, status, printerId !== undefined && printerId !== o.printerId ? printerId : undefined);
      if (status === "printing" && o.status !== "printing") toast.success("Filament taken from stock");
    }
  }

  // hotkeys: arrows navigate, 1-5 status, Enter open, Del delete, Esc clear
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      const cols = columns.map((c) => orders.filter((o) => o.status === c.key));
      const ci = cols.findIndex((c) => c.some((o) => o.id === focus));
      const ri = ci >= 0 ? cols[ci].findIndex((o) => o.id === focus) : -1;
      const targets = selected.length ? selected : focus ? [focus] : [];
      if (e.key === "Escape") { setSelected([]); setFocus(null); }
      else if (/^[1-5]$/.test(e.key) && targets.length) apply(targets, STATUSES[Number(e.key) - 1].key);
      else if (e.key === "Enter" && focus) router.push(`/en/orders/${focus}`);
      else if (e.key === "Delete" && targets.length) { if (confirm(`Delete ${targets.length} order(s)? Stock used is returned.`)) remove.mutate(targets); }
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        if (ci < 0) { const first = cols.find((c) => c.length)?.[0]; if (first) setFocus(first.id); return; }
        let [c, r] = [ci, ri];
        if (e.key === "ArrowDown") r = Math.min(cols[c].length - 1, r + 1);
        if (e.key === "ArrowUp") r = Math.max(0, r - 1);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const step = e.key === "ArrowRight" ? 1 : -1;
          for (let k = c + step; k >= 0 && k < cols.length; k += step) if (cols[k].length) { c = k; r = Math.min(r, cols[k].length - 1); break; }
        }
        setFocus(cols[c][r]?.id ?? focus);
        document.querySelector(`[data-order="${cols[c][r]?.id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const cardClick = (o: Order) => (e: React.MouseEvent) => {
    if (e.shiftKey) setSelected(selected.includes(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id]);
    else router.push(`/en/orders/${o.id}`);
  };

  const board = (laneId: string, laneOrders: Order[]) => (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3">
      {columns.map((c) => {
        const list = laneOrders.filter((o) => o.status === c.key);
        return (
          <Column key={c.key} id={`${laneId}|${c.key}`} title={c.label} orders={list}>
            {list.map((o) => (
              <OrderCard key={o.id} o={o} currency={currency} selected={selected.includes(o.id)} focused={focus === o.id} onClick={cardClick(o)} onStatus={(s) => apply([o.id], s)} />
            ))}
          </Column>
        );
      })}
    </div>
  );

  const lanes: { id: string; name: string; orders: Order[] }[] = byPrinter
    ? [
        ...printers.map((p) => ({ id: p.id, name: printerName(p), orders: orders.filter((o) => o.printerId === p.id) })),
        { id: "none", name: "No printer", orders: orders.filter((o) => !o.printerId) },
      ]
    : [{ id: "all", name: "", orders }];

  return (
    <div>
      <PageHeader
        title="Kanban"
        info="Drag cards between columns, or use the status menu on each card. Moving to Printing takes filament from stock."
        actions={
          <>
            <Link href="/en/orders" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm hover:bg-card-2"><List className="size-4" /> List</Link>
            <Link href="/en/calculator" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"><Plus className="size-4" /> New order</Link>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search orders" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-44" aria-label="Sort cards" value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Checkbox label="By printer" checked={byPrinter} onChange={setByPrinter} />
        <Checkbox label="Show cancelled & closed" checked={showClosed} onChange={setShowClosed} />
      </div>
      {isLoading ? <ListSkeleton /> : (
        <DndContext sensors={sensors} onDragStart={(e) => setDragging(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          {lanes.map((l) => (
            <div key={l.id} className="mb-2">
              {byPrinter && (
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Printer className="size-4" /> {l.name}
                  <span className="text-xs font-normal text-muted">
                    queue {l.orders.filter((o) => !["done", "cancelled", "closed"].includes(o.status)).length} · {duration(l.orders.filter((o) => !["done", "cancelled", "closed"].includes(o.status)).reduce((a, o) => a + o.printTimeMin * o.quantity, 0))}
                  </span>
                </h2>
              )}
              {board(l.id, l.orders)}
            </div>
          ))}
          <DragOverlay>{dragging && orders.find((o) => o.id === dragging) ? <OrderCard o={orders.find((o) => o.id === dragging)!} currency={currency} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
      <p className="mt-2 hidden text-xs text-muted md:block">↑↓←→ navigate · 1–5 status · Shift+click multi-select · Enter open · Del delete · Esc clear</p>
    </div>
  );
}
