"use client";
// Shared table: column sort, column picker, remembered sort/columns, card view on mobile (main doc 6, 9.1).
import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, cn } from "./ui";

export type Column<T> = {
  key: string;
  header: string;
  cell: (r: T) => React.ReactNode;
  sort?: (r: T) => string | number;
  className?: string;
  /** cannot be hidden from the picker */
  fixed?: boolean;
  hiddenByDefault?: boolean;
};

/** localStorage-backed state; falls back silently when storage is blocked. */
export function useLocal<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (raw) setV(JSON.parse(raw));
    } catch {}
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, JSON.stringify(x));
    } catch {}
  };
  return [v, set] as const;
}

export function DataTable<T>({
  id, rows, columns, rowKey, onRowClick, card, view = "table", empty, rowClass, groupBy,
}: {
  id: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  /** mobile / grid card; defaults to a label:value list */
  card?: (r: T) => React.ReactNode;
  view?: "table" | "cards";
  empty?: React.ReactNode;
  rowClass?: (r: T) => string;
  /** heading rows between groups (e.g. order dates); only while no column sort is active */
  groupBy?: (r: T) => string;
}) {
  const [sort, setSort] = useLocal<{ key: string; dir: 1 | -1 } | null>(`table:${id}:sort`, null);
  const [hidden, setHidden] = useLocal<string[]>(`table:${id}:hidden`, columns.filter((c) => c.hiddenByDefault).map((c) => c.key));
  const [picker, setPicker] = useState(false);
  const visible = columns.filter((c) => !hidden.includes(c.key));

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sort || !sort) return rows;
    return [...rows].sort((a, b) => {
      const x = col.sort!(a), y = col.sort!(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, columns, sort]);

  if (!rows.length) return <>{empty}</>;
  const group = sort ? undefined : groupBy;
  const headingAt = (i: number) => (group && (i === 0 || group(sorted[i]) !== group(sorted[i - 1])) ? group(sorted[i]) : null);

  const defaultCard = (r: T) => (
    <div className="space-y-1.5">
      <div className="font-medium">{visible[0]?.cell(r)}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {visible.slice(1).map((c) =>
          c.header ? (
            <div key={c.key} className="contents">
              <dt className="text-muted">{c.header}</dt>
              <dd className="min-w-0 text-right">{c.cell(r)}</dd>
            </div>
          ) : null,
        )}
      </dl>
    </div>
  );

  const cards = (
    <div className={cn("grid gap-2", view === "cards" ? "sm:grid-cols-2 xl:grid-cols-3" : "md:hidden")}>
      {sorted.map((r, i) => (
        <div key={rowKey(r)} className="contents">
        {headingAt(i) && <div className="col-span-full pt-2 text-xs font-semibold text-muted">{headingAt(i)}</div>}
        <div
          onClick={() => onRowClick?.(r)}
          className={cn("rounded-2xl border border-border bg-card p-4", onRowClick && "cursor-pointer active:bg-card-2", rowClass?.(r))}
        >
          {(card ?? defaultCard)(r)}
        </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="relative mb-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setPicker(!picker)} aria-expanded={picker}>
          <Columns3 className="size-4" /> Columns
        </Button>
        {picker && (
          <div className="absolute top-10 right-0 z-20 w-56 rounded-xl border border-border bg-card p-2 shadow-xl">
            {columns.filter((c) => !c.fixed && c.header).map((c) => (
              <label key={c.key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-card-2">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={!hidden.includes(c.key)}
                  onChange={(e) => setHidden(e.target.checked ? hidden.filter((h) => h !== c.key) : [...hidden, c.key])}
                />
                {c.header}
              </label>
            ))}
          </div>
        )}
      </div>
      {view === "cards" ? (
        cards
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  {visible.map((c) => (
                    <th key={c.key} className={cn("px-3 py-2.5 font-medium whitespace-nowrap", c.className)}>
                      {c.sort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-fg"
                          onClick={() => setSort(sort?.key === c.key ? (sort.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}
                        >
                          {c.header}
                          {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => [
                  headingAt(i) && (
                    <tr key={`h-${rowKey(r)}`} className="border-b border-border bg-card-2/50">
                      <td colSpan={visible.length} className="px-3 py-1.5 text-xs font-semibold text-muted">{headingAt(i)}</td>
                    </tr>
                  ),
                  <tr
                    key={rowKey(r)}
                    onClick={() => onRowClick?.(r)}
                    className={cn("group border-b border-border last:border-0 hover:bg-card-2", onRowClick && "cursor-pointer", rowClass?.(r))}
                  >
                    {visible.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2.5", c.className)}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
          {cards}
        </>
      )}
    </div>
  );
}
