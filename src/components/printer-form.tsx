"use client";
import { useState } from "react";
import { Field, Input, NumberInput, PhotoInput, Segmented, Select, Textarea } from "./ui";

export type Printer = {
  id: string; manufacturer: string; model: string; internalName: string; technology: string; powerW: number; price: number;
  lifetimeH: number; initialHours: number; hoursManual: number; note: string; photoUrl: string | null; favourite: boolean;
  groupId: string | null; group?: { name: string } | null; maintenanceIntervalHours: number | null; maintenanceIntervalDays: number | null;
  lastMaintenanceAt: string | null; lastMaintenanceHours: number;
  // derived
  hoursUsed: number; hoursAuto: number; earned: number; last30Earned: number; paybackPct: number; hourCost: number; maintenanceDue: boolean;
};

// [DECISION] preset catalog (main doc 6.6): typical power draw and launch price, EUR.
export const PRINTER_PRESETS: { name: string; manufacturer: string; model: string; powerW: number; price: number; technology: "FDM" | "SLA" }[] = [
  { name: "Bambu Lab A1 mini", manufacturer: "Bambu Lab", model: "A1 mini", powerW: 150, price: 199, technology: "FDM" },
  { name: "Bambu Lab A1", manufacturer: "Bambu Lab", model: "A1", powerW: 200, price: 339, technology: "FDM" },
  { name: "Bambu Lab P1S", manufacturer: "Bambu Lab", model: "P1S", powerW: 300, price: 699, technology: "FDM" },
  { name: "Bambu Lab X1 Carbon", manufacturer: "Bambu Lab", model: "X1 Carbon", powerW: 350, price: 1449, technology: "FDM" },
  { name: "Bambu Lab H2D", manufacturer: "Bambu Lab", model: "H2D", powerW: 600, price: 1999, technology: "FDM" },
  { name: "Prusa MK4S", manufacturer: "Prusa", model: "MK4S", powerW: 240, price: 799, technology: "FDM" },
  { name: "Prusa Core One", manufacturer: "Prusa", model: "Core One", powerW: 300, price: 1199, technology: "FDM" },
  { name: "Prusa MINI+", manufacturer: "Prusa", model: "MINI+", powerW: 160, price: 459, technology: "FDM" },
  { name: "Creality Ender 3 V3", manufacturer: "Creality", model: "Ender 3 V3", powerW: 350, price: 299, technology: "FDM" },
  { name: "Creality K1C", manufacturer: "Creality", model: "K1C", powerW: 350, price: 499, technology: "FDM" },
  { name: "Creality K2 Plus", manufacturer: "Creality", model: "K2 Plus", powerW: 1200, price: 1499, technology: "FDM" },
  { name: "Anycubic Kobra 3", manufacturer: "Anycubic", model: "Kobra 3", powerW: 400, price: 349, technology: "FDM" },
  { name: "ELEGOO Centauri Carbon", manufacturer: "ELEGOO", model: "Centauri Carbon", powerW: 350, price: 299, technology: "FDM" },
  { name: "Qidi Plus4", manufacturer: "Qidi", model: "Plus4", powerW: 1000, price: 799, technology: "FDM" },
  { name: "ELEGOO Saturn 4 Ultra", manufacturer: "ELEGOO", model: "Saturn 4 Ultra", powerW: 120, price: 399, technology: "SLA" },
  { name: "Anycubic Photon Mono M7", manufacturer: "Anycubic", model: "Photon Mono M7", powerW: 100, price: 299, technology: "SLA" },
];

export const emptyPrinter = (): Partial<Printer> => ({
  manufacturer: "", model: "", internalName: "", technology: "FDM", powerW: 200, price: 0, lifetimeH: 5000,
  initialHours: 0, hoursManual: 0, note: "", photoUrl: null, groupId: null,
});

export function PrinterFields({ value, onChange, groups, showPreset = true, showHours = false }: {
  value: Partial<Printer>; onChange: (p: Partial<Printer>) => void; groups: { id: string; name: string }[]; showPreset?: boolean; showHours?: boolean;
}) {
  const [preset, setPreset] = useState("");
  const set = <K extends keyof Printer>(k: K, v: Printer[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      {showPreset && (
        <Field label="Catalog" hint="Fills manufacturer, model, power and price">
          <Select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              const p = PRINTER_PRESETS.find((x) => x.name === e.target.value);
              if (p) onChange({ ...value, manufacturer: p.manufacturer, model: p.model, powerW: p.powerW, price: p.price, technology: p.technology });
            }}
          >
            <option value="">Choose a printer...</option>
            {PRINTER_PRESETS.map((p) => <option key={p.name}>{p.name}</option>)}
          </Select>
        </Field>
      )}
      <Segmented value={value.technology ?? "FDM"} onChange={(v) => set("technology", v)} options={[{ value: "FDM", label: "FDM" }, { value: "SLA", label: "SLA" }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Manufacturer"><Input value={value.manufacturer ?? ""} onChange={(e) => set("manufacturer", e.target.value)} /></Field>
        <Field label="Model *"><Input value={value.model ?? ""} onChange={(e) => set("model", e.target.value)} required /></Field>
        <Field label="Internal name" hint="Tells apart identical printers"><Input value={value.internalName ?? ""} onChange={(e) => set("internalName", e.target.value)} /></Field>
        <Field label="Group">
          <Select value={value.groupId ?? ""} onChange={(e) => set("groupId", e.target.value || null)}>
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Power (W)"><NumberInput value={value.powerW} onChange={(v) => set("powerW", v)} /></Field>
        <Field label="Price"><NumberInput value={value.price} onChange={(v) => set("price", v)} /></Field>
        <Field label="Lifetime (h)"><NumberInput value={value.lifetimeH} onChange={(v) => set("lifetimeH", v)} /></Field>
        <Field label="Initial hours" hint="Hours already on the printer when added"><NumberInput value={value.initialHours} onChange={(v) => set("initialHours", v)} /></Field>
        {showHours && <Field label="Hours used (manual)" hint="Added to the hours counted from orders"><NumberInput value={value.hoursManual} onChange={(v) => set("hoursManual", v)} /></Field>}
      </div>
      <Field label="Note"><Textarea value={value.note ?? ""} onChange={(e) => set("note", e.target.value)} /></Field>
      <PhotoInput value={value.photoUrl} onChange={(u) => set("photoUrl", u)} />
    </div>
  );
}
