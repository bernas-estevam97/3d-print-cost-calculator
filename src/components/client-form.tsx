"use client";
import { useState } from "react";
import { useList, useSave } from "@/lib/client";
import type { Client } from "@/lib/types";
import { Button, Field, Input, NumberInput, PhotoInput, Select, Textarea } from "./ui";

export const CLIENT_FIELDS = [
  "name", "phone", "email", "address", "source", "discountPct", "categoryId", "photoUrl", "telegram", "contactPerson", "signer",
  "companyName", "taxId", "note",
] as const;

export const pickClient = (c: Partial<Client>) => Object.fromEntries(CLIENT_FIELDS.filter((k) => k in c).map((k) => [k, c[k]])) as Partial<Client>;

export function ClientFields({ value, onChange, section = "contacts" }: { value: Partial<Client>; onChange: (c: Partial<Client>) => void; section?: "contacts" | "company" }) {
  const { data: categories = [] } = useList<{ id: string; name: string }>("client-categories");
  const saveCategory = useSave<{ id: string; name: string }>("client-categories", "Category created");
  const [newCat, setNewCat] = useState<string | null>(null);
  const set = <K extends keyof Client>(k: K, v: Client[K]) => onChange({ ...value, [k]: v });

  if (section === "company") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company name"><Input value={value.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} /></Field>
        <Field label="Tax ID"><Input value={value.taxId ?? ""} onChange={(e) => set("taxId", e.target.value)} /></Field>
        <Field label="Contact person"><Input value={value.contactPerson ?? ""} onChange={(e) => set("contactPerson", e.target.value)} /></Field>
        <Field label="Signer"><Input value={value.signer ?? ""} onChange={(e) => set("signer", e.target.value)} /></Field>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Field label="Name *"><Input value={value.name ?? ""} onChange={(e) => set("name", e.target.value)} required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone"><Input type="tel" value={value.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={value.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Telegram"><Input value={value.telegram ?? ""} onChange={(e) => set("telegram", e.target.value)} placeholder="@username" /></Field>
        <Field label="Source"><Input value={value.source ?? ""} onChange={(e) => set("source", e.target.value)} placeholder="Instagram, OLX, word of mouth…" /></Field>
        <Field label="Discount (%)"><NumberInput value={value.discountPct} onChange={(v) => set("discountPct", v)} suffix="%" /></Field>
        <Field label="Category">
          {newCat !== null ? (
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (newCat.trim()) saveCategory.mutate({ name: newCat.trim() }, { onSuccess: (c) => { set("categoryId", c.id); setNewCat(null); } }); }}>
              <Input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name" />
              <Button type="submit" variant="primary">Add</Button>
            </form>
          ) : (
            <Select value={value.categoryId ?? ""} onChange={(e) => (e.target.value === "__new" ? setNewCat("") : set("categoryId", e.target.value || null))}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">+ New category…</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Address"><Input value={value.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
      <Field label="Note"><Textarea value={value.note ?? ""} onChange={(e) => set("note", e.target.value)} /></Field>
      <PhotoInput value={value.photoUrl} onChange={(u) => set("photoUrl", u)} />
    </div>
  );
}

export function Avatar({ c, className = "size-9" }: { c: Pick<Client, "name" | "photoUrl">; className?: string }) {
  const initials = c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-2 text-xs font-semibold ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c.photoUrl ? <img src={c.photoUrl} alt="" className="size-full object-cover" /> : initials}
    </span>
  );
}
