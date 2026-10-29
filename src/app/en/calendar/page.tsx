"use client";
// Calendar, main doc 6.11. Month view; orders appear on their due date.
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useLocal } from "@/components/data-table";
import { Button, Checkbox, Dialog, Field, Input, ListSkeleton, PageHeader, Select, TagInput, Textarea, cn, deleteWithUndo } from "@/components/ui";
import { useList, useRemove, useSave } from "@/lib/client";
import { dateInput } from "@/lib/format";
import type { Order } from "@/lib/types";

type Ev = {
  id?: string; title: string; description: string; type: string; color: string; date: string; allDay: boolean; repeat: string;
  startTime: string; endTime: string; tags: string[]; done: boolean; orderId?: string | null;
};
type Chip = { key: string; label: string; color: string; done?: boolean; ev?: Ev; href?: string; time?: string };

const TYPES: [string, string][] = [["todo", "To-do"], ["order", "Order"], ["reminder", "Reminder"], ["appointment", "Appointment"]];
const blank = (date: string): Ev => ({ title: "", description: "", type: "todo", color: "#f97316", date, allDay: true, repeat: "none", startTime: "", endTime: "", tags: [], done: false });

/** Does a (possibly repeating) event fall on this day? */
function occurs(e: Ev, day: Date) {
  const start = new Date(e.date);
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (day < s) return false;
  if (e.repeat === "daily") return true;
  if (e.repeat === "weekly") return day.getDay() === s.getDay();
  if (e.repeat === "monthly") return day.getDate() === s.getDate();
  return day.getTime() === s.getTime();
}

export default function CalendarPage() {
  const { data: events, isLoading } = useList<Ev & { id: string }>("events");
  const { data: orders = [] } = useList<Order>("orders");
  const save = useSave<Ev>("events", "Event saved");
  const remove = useRemove("events");
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [hiddenTypes, setHiddenTypes] = useLocal<string[]>("calendar:hidden", []);
  const [form, setForm] = useState<Ev | null>(null);

  // Monday-first grid covering the month
  const first = new Date(month);
  first.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const weeks = days[35].getMonth() !== month.getMonth() ? days.slice(0, 35) : days;
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  const chipsFor = (day: Date): Chip[] => [
    ...(hiddenTypes.includes("order") ? [] : orders
      .filter((o) => o.dueDate && same(new Date(o.dueDate), day) && !["cancelled", "closed"].includes(o.status))
      .map((o) => ({ key: `o${o.id}`, label: o.name, color: "#3b82f6", done: o.status === "done", href: `/en/orders/${o.id}` }))),
    ...(events ?? [])
      .filter((e) => !hiddenTypes.includes(e.type) && occurs(e, day))
      .map((e) => ({ key: `${e.id}${day.getDate()}`, label: e.title, color: e.color, done: e.done, ev: e, time: e.allDay ? "" : e.startTime })),
  ];

  const set = <K extends keyof Ev>(k: K, v: Ev[K]) => setForm({ ...form!, [k]: v });

  return (
    <div>
      <PageHeader
        title="Calendar"
        info="Orders show on their due date"
        subtitle="Orders, appointments, to-dos and reminders, all in one place."
        actions={<Button variant="primary" onClick={() => setForm(blank(dateInput(new Date())))}><Plus className="size-4" /> New event</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="size-5" /></Button>
        <h2 className="min-w-40 text-center text-lg font-semibold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="size-5" /></Button>
        <Button size="sm" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</Button>
        <Input type="month" aria-label="Pick month" className="w-44" value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`} onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); if (y) setMonth(new Date(y, m - 1, 1)); }} />
        <div className="flex flex-wrap gap-1.5 md:ml-auto">
          {TYPES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setHiddenTypes(hiddenTypes.includes(k) ? hiddenTypes.filter((x) => x !== k) : [...hiddenTypes, k])}
              className={cn("h-9 rounded-full border px-3 text-xs", hiddenTypes.includes(k) ? "border-border text-muted line-through" : "border-accent text-accent")}>{l}</button>
          ))}
        </div>
      </div>
      {isLoading ? <ListSkeleton /> : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border text-center text-xs text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {weeks.map((day) => {
              const chips = chipsFor(day);
              const other = day.getMonth() !== month.getMonth();
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => setForm(blank(dateInput(day)))}
                  className={cn("min-h-20 cursor-pointer border-r border-b border-border p-1 hover:bg-card-2 md:min-h-28", other && "bg-card-2/40 text-muted")}
                >
                  <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs", same(day, today) && "bg-accent font-bold text-accent-fg")}>{day.getDate()}</div>
                  <div className="space-y-0.5">
                    {chips.slice(0, 3).map((c) => {
                      const body = (
                        <span className={cn("block truncate rounded px-1 py-0.5 text-[11px] text-white", c.done && "line-through opacity-60")} style={{ background: c.color }}>
                          {c.time && `${c.time} `}{c.label}
                        </span>
                      );
                      return c.href ? (
                        <Link key={c.key} href={c.href} onClick={(e) => e.stopPropagation()}>{body}</Link>
                      ) : (
                        <button key={c.key} type="button" className="block w-full text-left" onClick={(e) => { e.stopPropagation(); setForm({ ...c.ev!, date: dateInput(c.ev!.date) }); }}>{body}</button>
                      );
                    })}
                    {chips.length > 3 && <span className="block px-1 text-[11px] text-muted">+{chips.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit event" : "New event"} footer={
        <>
          {form?.id && <Button variant="ghost" className="mr-auto" onClick={() => { const f = form; setForm(null); deleteWithUndo(f.title, () => remove.mutate(f.id!)); }}><Trash2 className="size-4 text-red-500" /> Delete</Button>}
          <Button onClick={() => setForm(null)}>Cancel</Button>
          <Button variant="primary" disabled={!form?.title.trim()} loading={save.isPending} onClick={() => {
            const { id, title, description, type, color, date, allDay, repeat, startTime, endTime, tags, done } = form!;
            save.mutate({ id, title, description, type, color, date: new Date(date + "T12:00:00").toISOString(), allDay, repeat, startTime, endTime, tags, done }, { onSuccess: () => setForm(null) });
          }}>Save</Button>
        </>
      }>
        {form && (
          <>
            <Field label="Title *"><Input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={form.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              </Field>
              <Field label="Color"><input type="color" aria-label="Color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-border bg-card" /></Field>
              <Field label="Date"><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
              <Field label="Repeat">
                <Select value={form.repeat} onChange={(e) => set("repeat", e.target.value)}>
                  <option value="none">Doesn&apos;t repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </Select>
              </Field>
            </div>
            <Checkbox label="All day" checked={form.allDay} onChange={(v) => set("allDay", v)} />
            {!form.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start"><Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} /></Field>
                <Field label="End"><Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} /></Field>
              </div>
            )}
            <Field label="Tags"><TagInput value={form.tags} onChange={(t) => set("tags", t)} /></Field>
            <Checkbox label="Done" checked={form.done} onChange={(v) => set("done", v)} />
          </>
        )}
      </Dialog>
    </div>
  );
}
