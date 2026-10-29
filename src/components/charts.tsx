"use client";
// Chart building blocks on Recharts. Colors come from CSS tokens so light/dark both work:
// one series -> accent; several series -> --series-N in fixed order (never cycled, never by rank).
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ColorDot } from "./ui";

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltip = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--fg)", fontSize: 12 },
  labelStyle: { color: "var(--muted)" },
  cursor: { fill: "var(--card-2)", stroke: "var(--border)" },
} as const;

export const shortMonth = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
};

/** Tiny bar sparkline inside KPI tiles. */
export function MiniBars({ data, dataKey, label }: { data: object[]; dataKey: string; label: string }) {
  return (
    <div className="h-10" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }} barCategoryGap={2}>
          <Tooltip {...tooltip} formatter={(v) => [Math.round(Number(v) * 100) / 100, label]} labelFormatter={() => ""} />
          <Bar dataKey={dataKey} fill="var(--accent)" radius={[3, 3, 0, 0]} minPointSize={2} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series bars (accent). */
export function Bars({ data, x, y, name, format, height = 220 }: { data: object[]; x: string; y: string; name: string; format?: (v: number) => string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} tickFormatter={format ? (v) => format(v) : undefined} width={48} />
          <Tooltip {...tooltip} formatter={(v) => [format ? format(Number(v)) : v, name]} />
          <Bar dataKey={y} name={name} fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Several series as lines (or grouped bars), with a legend. One y-axis only. */
export function MultiSeries({ data, x, series, format, kind = "line", height = 240 }: {
  data: object[]; x: string; series: { key: string; name: string }[]; format?: (v: number) => string; kind?: "line" | "bar"; height?: number;
}) {
  const fmt = (v: unknown) => (format ? format(Number(v)) : String(v));
  // legend text stays in text ink; the dot carries the series colour
  const legend = <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: "var(--muted)" }}>{v}</span>} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        {kind === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey={x} {...axis} />
            <YAxis {...axis} tickFormatter={fmt} width={48} />
            <Tooltip {...tooltip} formatter={(v, n) => [fmt(v), n]} />
            {legend}
            {series.map((s, i) => (
              <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey={x} {...axis} />
            <YAxis {...axis} tickFormatter={fmt} width={48} allowDecimals={false} />
            <Tooltip {...tooltip} formatter={(v, n) => [fmt(v), n]} />
            {legend}
            {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={18} />)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Donut + list (the list doubles as legend and table view). Max 8 slices, the rest folds into "Other". */
export function Donut({ items, format }: { items: { name: string; value: number }[]; format: (v: number) => string }) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const shown = sorted.length > 8 ? [...sorted.slice(0, 7), { name: "Other", value: sorted.slice(7).reduce((a, x) => a + x.value, 0) }] : sorted;
  const total = shown.reduce((a, x) => a + x.value, 0);
  if (!total) return <p className="text-sm text-muted">No data</p>;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[160px_1fr]">
      <div className="mx-auto size-40">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={1} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
              {shown.map((_, i) => <Cell key={i} fill={SERIES[i]} />)}
            </Pie>
            <Tooltip {...tooltip} formatter={(v, n) => [format(Number(v)), n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-sm">
        {shown.map((x, i) => (
          <li key={x.name} className="flex items-center gap-2">
            <ColorDot color={SERIES[i]} />
            <span className="flex-1">{x.name}</span>
            <span className="tabular-nums">{format(x.value)}</span>
            <span className="w-12 text-right text-muted tabular-nums">{((x.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bar list in plain HTML: label, bar, value. Readable on phones without a chart lib. */
export function BarList({ items, format, color }: { items: { name: string; value: number; color?: string }[]; format: (v: number) => string; color?: boolean }) {
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  if (!items.length) return <p className="text-sm text-muted">No data</p>;
  return (
    <ul className="space-y-2">
      {items.map((x) => (
        <li key={x.name} className="text-sm" title={`${x.name}: ${format(x.value)}`}>
          <div className="mb-1 flex items-center gap-2">
            {color && <ColorDot color={x.color} />}
            <span className="min-w-0 flex-1 truncate">{x.name}</span>
            <span className="tabular-nums">{format(x.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-card-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(x.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
