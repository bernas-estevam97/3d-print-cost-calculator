"use client";
// Browser data layer: fetch wrapper + TanStack Query hooks. Every mutation invalidates
// broadly, so lists, dashboard and calculator refs stay live without reloads (main doc 9).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth")) {
    // full reload on purpose: drops every cached query of the expired session
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = data.issues?.[0];
    throw new ApiError(res.status, issue ? `${issue.path?.join(".") || "Input"}: ${issue.message}` : data.error || res.statusText);
  }
  return data as T;
}

export async function upload(file: File, kind: "photo" | "model" = "photo"): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const { url } = await api<{ url: string }>("/api/upload", { method: "POST", body: fd });
  return url;
}

export function useApi<T>(url: string | null, opts: { enabled?: boolean } = {}) {
  return useQuery<T>({ queryKey: [url], queryFn: () => api<T>(url!), enabled: !!url && opts.enabled !== false });
}

export const useList = <T,>(entity: string) => useApi<T[]>(`/api/${entity}`);

/** Generic mutation that refreshes every query afterwards. */
export function useMutate<V, R = unknown>(fn: (v: V) => Promise<R>, okMsg?: string | ((r: R) => string)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries();
      if (okMsg) toast.success(typeof okMsg === "function" ? okMsg(r) : okMsg);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSave<T extends { id?: string }>(entity: string, okMsg = "Saved") {
  return useMutate<Partial<T> & { id?: string }, T>(
    ({ id, ...body }) =>
      id ? api<T>(`/api/${entity}/${id}`, { method: "PATCH", json: body }) : api<T>(`/api/${entity}`, { method: "POST", json: body }),
    okMsg,
  );
}

export function useRemove(entity: string, okMsg = "Deleted") {
  return useMutate<string>((id) => api(`/api/${entity}/${id}`, { method: "DELETE" }), okMsg);
}

export type Settings = {
  electricityEnabled: boolean; electricityMode: string; electricityTariff: number;
  operatorRate: number; modelingRate: number; paintingRate: number; defaultMarkupPct: number;
  mbMaterial: boolean; mbLabor: boolean; mbWarehouse: boolean; mbPackagingDelivery: boolean; mbElectricity: boolean;
  mbAmortization: boolean; mbConsumables: boolean; deductTaxes: boolean; deductMarketplace: boolean; deductAcquiring: boolean;
  acquiringPct: number; complexitySimplePct: number; complexityMediumPct: number; complexityComplexPct: number;
  defectAllowancePct: number; roundingMode: string; currency: string; theme: string; accent: string;
  defaultTaxRegimeId: string | null;
};

export const useSettings = () => useApi<Settings>("/api/settings");

export function useSaveSettings(okMsg: string | undefined = "Settings saved") {
  return useMutate<Partial<Settings>>((s) => api("/api/settings", { method: "PUT", json: s }), okMsg);
}

/** Currency code from settings, for money() everywhere. */
export function useCurrency() {
  return useSettings().data?.currency ?? "EUR";
}

export type Me = { id: string; email: string; name: string; avatarUrl: string | null; notifyLowFilament: boolean; notifyOverdue: boolean; workshop: { name: string } };
export const useMe = () => useApi<Me>("/api/me");

/** ?key= state in the URL, so tabs and filters survive reload and can be linked. */
export function useQueryState(key: string, fallback: string) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = sp.get(key) ?? fallback;
  const set = (v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v === fallback) next.delete(key);
    else next.set(key, v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return [value, set] as const;
}
