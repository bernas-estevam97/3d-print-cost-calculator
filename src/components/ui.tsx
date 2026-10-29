"use client";
// Small UI kit on native elements (<dialog>, <select>, <input type=date>): no component library.
import { ImagePlus, Info, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { statusOf } from "@/lib/status";
import { upload } from "@/lib/client";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

// ---------- buttons ----------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  loading?: boolean;
};
export function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...p }: BtnProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-sm",
        size === "icon" && "h-11 w-11 shrink-0",
        variant === "primary" && "bg-accent text-accent-fg hover:brightness-110",
        variant === "secondary" && "border border-border bg-card hover:bg-card-2",
        variant === "ghost" && "hover:bg-card-2",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-500",
        className,
      )}
      {...p}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

// ---------- inputs ----------
const field =
  "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none placeholder:text-muted focus:border-accent disabled:opacity-60";

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...p} />;
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "h-auto min-h-24 py-2", className)} {...p} />;
}

/** Number input that accepts "1,5" and "1.5" and keeps the raw text while typing. */
export function NumberInput({
  value, onChange, className, suffix, ...p
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | null | undefined;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  const [text, setText] = useState(value == null || value === 0 ? "" : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value == null || value === 0 ? "" : String(value));
    }
  }, [value]);
  const input = (
    <input
      inputMode="decimal"
      className={cn(field, suffix && "pr-10", className)}
      value={text}
      placeholder={p.placeholder ?? "0"}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,-]/g, "");
        setText(t);
        const v = parseFloat(t.replace(",", "."));
        last.current = Number.isFinite(v) ? v : 0;
        onChange(last.current);
      }}
      {...p}
    />
  );
  if (!suffix) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>
    </div>
  );
}

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, "appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b97ad' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, className }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm", className)}>
      <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode }) {
  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === "string" ? label : undefined}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-border")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
  if (!label) return btn;
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1">
      <div>
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-muted">{description}</div>}
      </div>
      {btn}
    </div>
  );
}

// ---------- layout ----------
export function Card({ title, actions, children, className, bodyClass }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-4 pt-4">
          {title && <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, info, subtitle, actions }: { title: React.ReactNode; info?: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          {title}
          {info && (
            <span title={info} aria-label={info} className="text-muted">
              <Info className="size-4" />
            </span>
          )}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
      {text}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}

// ---------- badges ----------
export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const s = statusOf(status);
  return <Badge className={s.cls}>{s.label}</Badge>;
}

export function PaidBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">Paid</Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Unpaid</Badge>
  );
}

/** App mark: the transparent flask from public/gorilab.png, cropped by CSS, on an accent tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0 rounded-lg bg-accent bg-no-repeat", className)}
      style={{ backgroundImage: "url(/gorilab.png)", backgroundSize: "170%", backgroundPosition: "50% 18%" }}
    />
  );
}

export function ColorDot({ color, className }: { color?: string; className?: string }) {
  return <span className={cn("inline-block size-3 shrink-0 rounded-full border border-black/20", className)} style={{ background: color || "transparent" }} />;
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-xl border border-border bg-card-2 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("min-h-9 flex-1 rounded-lg px-3 text-sm whitespace-nowrap transition-colors", value === o.value ? "bg-card font-medium shadow-sm" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- dialog: native <dialog>, bottom sheet below 768 px (main doc 9.1) ----------
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl border border-border bg-card p-0 text-fg md:m-auto md:rounded-2xl",
        wide ? "md:max-w-3xl" : "md:max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X className="size-5" />
            </Button>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-border px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Delete with a 5 s undo toast instead of a confirm dialog (main doc 9.1). */
export function deleteWithUndo(label: string, doDelete: () => void) {
  let undone = false;
  const timer = setTimeout(() => !undone && doDelete(), 5000);
  toast(`${label} will be deleted`, {
    duration: 5000,
    action: {
      label: "Undo",
      onClick: () => {
        undone = true;
        clearTimeout(timer);
      },
    },
  });
}

// ---------- photo upload ----------
export function PhotoInput({ value, onChange, label = "Photo" }: { value: string | null | undefined; onChange: (url: string | null) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-muted" />}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-card-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {value ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                onChange(await upload(f));
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function Thumb({ src, className }: { src?: string | null; className?: string }) {
  return (
    <div className={cn("size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-card-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="size-full object-cover" />}
    </div>
  );
}

export function Kpi({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-card-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full bg-accent", className)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

/** Tag chips editor. */
export function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = useState("");
  const add = () => {
    const v = t.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setT("");
  };
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1.5">
      {value.map((tag) => (
        <Badge key={tag} className="bg-card-2">
          {tag}
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((x) => x !== tag))}>
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        value={t}
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={value.length ? "" : "Add tag, press Enter"}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}
