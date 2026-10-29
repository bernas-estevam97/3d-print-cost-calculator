"use client";
// App shell: sidebar (desktop), bottom tab bar (mobile), top bar (main doc 3, 9.1).
import {
  BarChart3, Bell, Box, Calculator, CalendarDays, Check, ChevronDown, ClipboardList, FileText, Home, KanbanSquare,
  LayoutDashboard, LogOut, Menu, Moon, MoreHorizontal, Package, PanelLeft, Printer, Search, Settings as SettingsIcon,
  Sun, SunMoon, User, Users, Wind,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { api, useApi, useCurrency, useMe, useSaveSettings, useSettings } from "@/lib/client";
import { CURRENCIES } from "@/lib/format";
import { useLocal } from "./data-table";
import { Button, cn, Dialog, Input } from "./ui";

export const NAV = [
  { href: "/en/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/en/calculator", label: "Calculator", icon: Calculator },
  { href: "/en/orders", label: "Orders", icon: ClipboardList },
  { href: "/en/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/en/production", label: "Kanban", icon: KanbanSquare },
  { href: "/en/clients", label: "Clients", icon: Users },
  { href: "/en/documents", label: "Documents", icon: FileText },
  { href: "/en/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/en/printers", label: "Printers", icon: Printer },
  { href: "/en/dryers", label: "Dryers", icon: Wind },
  { href: "/en/models", label: "Model Catalog", icon: Box },
  { href: "/en/warehouse", label: "Warehouse", icon: Package },
  { href: "/en/settings", label: "Settings", icon: SettingsIcon },
];
const TABS = ["/en/dashboard", "/en/calculator", "/en/orders", "/en/production", "/en/clients"];
const ACCENTS: [string, string][] = [
  ["orange", "#f97316"], ["blue", "#3b82f6"], ["red", "#ef4444"], ["slate", "#64748b"], ["green", "#22c55e"], ["purple", "#a855f7"],
];

const active = (path: string, href: string) => path === href || path.startsWith(href + "/") || (href === "/en/warehouse" && path.startsWith("/en/filaments"));

/** Closes a popover when clicking outside it. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return [open, setOpen, ref] as const;
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const settings = useSettings().data;
  const save = useSaveSettings(undefined);
  const [open, setOpen, ref] = usePopover();
  const pick = (t: string) => {
    setTheme(t);
    save.mutate({ theme: t });
  };
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" aria-label="Theme and accent" onClick={() => setOpen(!open)}>
        <SunMoon className="size-5" />
      </Button>
      {open && (
        <div className="absolute top-12 right-0 z-40 w-56 rounded-xl border border-border bg-card p-2 shadow-xl">
          {[["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", SunMoon]].map(([k, l, I]) => {
            const Icon = I as typeof Sun;
            return (
              <button key={k as string} type="button" onClick={() => pick(k as string)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm hover:bg-card-2">
                <Icon className="size-4" /> {l as string}
                {theme === k && <Check className="ml-auto size-4 text-accent" />}
              </button>
            );
          })}
          <div className="mt-2 border-t border-border px-2 pt-2 text-xs text-muted">Accent</div>
          <div className="flex gap-2 px-2 py-2">
            {ACCENTS.map(([k, c]) => (
              <button
                key={k}
                type="button"
                aria-label={`${k} accent`}
                onClick={() => save.mutate({ accent: k })}
                className={cn("size-7 rounded-full ring-offset-2 ring-offset-card", settings?.accent === k && "ring-2 ring-fg")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CurrencyMenu() {
  const currency = useCurrency();
  const save = useSaveSettings(undefined);
  return (
    <label className="relative hidden sm:block">
      <span className="sr-only">Currency</span>
      <select
        value={currency}
        onChange={(e) => save.mutate({ currency: e.target.value })}
        className="h-11 cursor-pointer appearance-none rounded-xl bg-bg px-3 text-sm text-fg hover:bg-card-2"
      >
        {CURRENCIES.map(([code, sym, name]) => (
          <option key={code} value={code}>
            {sym} {code} · {name}
          </option>
        ))}
      </select>
    </label>
  );
}

type Note = { kind: string; text: string; href: string };

function Notifications() {
  const { data = [] } = useApi<Note[]>("/api/notifications");
  const [open, setOpen, ref] = usePopover();
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" aria-label={`Notifications (${data.length})`} onClick={() => setOpen(!open)}>
        <Bell className="size-5" />
        {data.length > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-accent" />}
      </Button>
      {open && (
        <div className="absolute top-12 right-0 z-40 w-72 rounded-xl border border-border bg-card p-2 shadow-xl">
          {data.length === 0 && <div className="p-3 text-sm text-muted">Nothing needs attention</div>}
          {data.map((n, i) => (
            <Link key={i} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm hover:bg-card-2">
              {n.text}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const me = useMe().data;
  const [open, setOpen, ref] = usePopover();
  const initials = (me?.name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className="flex h-11 items-center gap-2 rounded-xl px-1.5 hover:bg-card-2" aria-label="Profile menu">
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-bold text-accent-fg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {me?.avatarUrl ? <img src={me.avatarUrl} alt="" className="size-full object-cover" /> : initials}
        </span>
        <span className="hidden text-sm lg:block">{me?.name}</span>
        <ChevronDown className="hidden size-4 text-muted lg:block" />
      </button>
      {open && (
        <div className="absolute top-12 right-0 z-40 w-56 rounded-xl border border-border bg-card p-2 shadow-xl">
          <div className="px-2 pb-2 text-xs text-muted">{me?.email}</div>
          <Link href="/en/profile" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-card-2">
            <User className="size-4" /> Profile
          </Link>
          <Link href="/en/settings?tab=about" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-card-2">
            <SettingsIcon className="size-4" /> About
          </Link>
          <button
            type="button"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              // full reload on purpose: drops every cached query of the old session
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/login";
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm text-red-500 hover:bg-card-2"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

type SearchHit = { type: string; label: string; sub: string; href: string };

function GlobalSearch({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const { data = [] } = useApi<SearchHit[]>(q.trim().length >= 1 ? `/api/search?q=${encodeURIComponent(q.trim())}` : null);
  const pages: SearchHit[] = q.trim()
    ? NAV.filter((n) => n.label.toLowerCase().includes(q.trim().toLowerCase())).map((n) => ({ type: "Pages", label: n.label, sub: "", href: n.href }))
    : [];
  const hits = [...pages, ...data];
  const groups = [...new Set(hits.map((h) => h.type))];
  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Search">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search orders, clients, filaments..."
        onKeyDown={(e) => e.key === "Enter" && hits[0] && go(hits[0].href)}
      />
      {q && !hits.length && <p className="text-sm text-muted">No results</p>}
      {groups.map((g) => (
        <div key={g}>
          <div className="mb-1 text-xs font-semibold text-muted uppercase">{g}</div>
          {hits.filter((h) => h.type === g).map((h) => (
            <button key={h.href + h.label} type="button" onClick={() => go(h.href)} className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-2 text-left hover:bg-card-2">
              <span className="text-sm">{h.label}</span>
              {h.sub && <span className="text-xs text-muted">{h.sub}</span>}
            </button>
          ))}
        </div>
      ))}
    </Dialog>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useLocal("shell:collapsed", false);
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState(false);
  const settings = useSettings().data;
  const { theme, setTheme } = useTheme();
  const page = NAV.find((n) => active(path, n.href));

  // apply per-user accent and theme from settings
  useEffect(() => {
    if (settings) document.documentElement.dataset.accent = settings.accent;
  }, [settings]);
  const themeApplied = useRef(false);
  useEffect(() => {
    if (settings && !themeApplied.current) {
      themeApplied.current = true;
      if (settings.theme !== theme) setTheme(settings.theme);
    }
  }, [settings, theme, setTheme]);

  // "/" and Ctrl/Cmd+K focus search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-card md:flex", collapsed ? "w-16" : "w-60")}>
        <Link href="/en/dashboard" className="flex h-16 items-center gap-2 px-4 font-bold">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">3D</span>
          {!collapsed && <span className="truncate">Print Pricing</span>}
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              title={collapsed ? n.label : undefined}
              aria-label={n.label}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                active(path, n.href) ? "bg-accent text-accent-fg" : "text-muted hover:bg-card-2 hover:text-fg",
              )}
            >
              <n.icon className="size-5 shrink-0" />
              {!collapsed && n.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-1 border-b border-border bg-bg/90 px-2 backdrop-blur sm:px-4">
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label="Toggle sidebar" onClick={() => setCollapsed(!collapsed)}>
            <PanelLeft className="size-5" />
          </Button>
          <Link href="/en/dashboard" className="flex min-w-0 items-center gap-2 px-2 text-sm">
            <Home className="size-4 shrink-0 text-muted" />
            <span className="truncate font-medium">{page?.label ?? ""}</span>
          </Link>
          <button
            type="button"
            onClick={() => setSearch(true)}
            className="mx-auto hidden h-10 w-full max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted md:flex"
          >
            <Search className="size-4" /> Search orders, clients, filaments...
            <kbd className="ml-auto rounded border border-border px-1.5 text-xs">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center md:ml-0">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setSearch(true)}>
              <Search className="size-5" />
            </Button>
            <Notifications />
            <ThemeMenu />
            <CurrencyMenu />
            <ProfileMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 pb-28 md:px-6 md:pb-8">{children}</main>
      </div>

      {/* calculator shortcut (main doc 3) */}
      {!path.startsWith("/en/calculator") && (
        <Link
          href="/en/calculator"
          aria-label="New calculation"
          className="fixed right-5 bottom-6 z-30 hidden size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg hover:brightness-110 md:flex"
        >
          <Calculator className="size-6" />
        </Link>
      )}

      {/* bottom tab bar below 768 px (main doc 9.1) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((href) => {
          const n = NAV.find((x) => x.href === href)!;
          return (
            <Link key={href} href={href} className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active(path, href) ? "text-accent" : "text-muted")}>
              <n.icon className="size-5" />
              {n.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
          <MoreHorizontal className="size-5" /> More
        </button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <div className="grid grid-cols-3 gap-2">
          {NAV.filter((n) => !TABS.includes(n.href)).map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMore(false)} className={cn("flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-border text-xs", active(path, n.href) && "border-accent text-accent")}>
              <n.icon className="size-5" />
              {n.label}
            </Link>
          ))}
          <Link href="/en/profile" onClick={() => setMore(false)} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-border text-xs">
            <User className="size-5" /> Profile
          </Link>
          <Link href="/en/filaments" onClick={() => setMore(false)} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-border text-xs">
            <Menu className="size-5" /> Filaments
          </Link>
        </div>
      </Dialog>
      <GlobalSearch open={search} setOpen={setSearch} />
    </div>
  );
}
