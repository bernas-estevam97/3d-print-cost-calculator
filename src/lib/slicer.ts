// Slicer file parsing, main doc 6.1.1. Pure: runs in the browser before anything is uploaded.
import { strFromU8, unzipSync } from "fflate";

export type SlicerResult = {
  filaments: { grams: number; color?: string; type?: string }[];
  timeMin: number;
};

export class SlicerError extends Error {}

export const EXPORT_HINT = "Export plate sliced as 3MF (File → Export → Export plate sliced as 3MF)";

/** "1d 2h 10m 5s" / "1h 10m" / "35m 20s" -> minutes */
export function parseDuration(s: string): number {
  let min = 0;
  for (const [, n, u] of s.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) {
    const v = parseFloat(n);
    min += u === "d" ? v * 1440 : u === "h" ? v * 60 : u === "m" ? v : v / 60;
  }
  return Math.round(min);
}

const nums = (s: string) => s.split(/[,;]/).map((x) => parseFloat(x)).filter((x) => Number.isFinite(x));
const list = (s: string | undefined) => (s ? s.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : []);

/** Reads PrusaSlicer / OrcaSlicer / Bambu Studio header and footer comments. */
export function parseGcode(text: string): SlicerResult {
  // the interesting comments are at the start and end; skip megabytes of moves in between
  const t = text.length > 400_000 ? text.slice(0, 200_000) + "\n" + text.slice(-200_000) : text;
  const get = (re: RegExp) => t.match(re)?.[1];

  const perExtruder = get(/^;\s*filament used \[g\]\s*=\s*(.+)$/m);
  const total = get(/^;\s*total filament (?:weight|used) \[g\]\s*[:=]\s*([\d.]+)/m);
  let grams = perExtruder ? nums(perExtruder) : [];
  if (!grams.some((g) => g > 0) && total) grams = [parseFloat(total)];

  const time =
    get(/^;\s*estimated printing time(?: \(normal mode\))?\s*=\s*(.+)$/m) ??
    get(/total estimated time:\s*([^;\n]+)/) ??
    get(/^;\s*model printing time:\s*([^;\n]+)/m);

  const colors = list(get(/^;\s*filament_colou?r\s*=\s*(.+)$/m));
  const types = list(get(/^;\s*filament_type\s*=\s*(.+)$/m));

  const used = grams.map((g, i) => ({ grams: Math.round(g * 100) / 100, color: colors[i], type: types[i] })).filter((f) => f.grams > 0);
  if (!used.length && !time) throw new SlicerError("No slicer data found in this G-code");
  return { filaments: used, timeMin: time ? parseDuration(time) : 0 };
}

/** Bambu / Orca sliced 3MF: Metadata/slice_info.config, else an embedded plate G-code. */
export function parse3mf(bytes: Uint8Array): SlicerResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.startsWith("Metadata/") && (f.name.endsWith(".config") || f.name.endsWith(".gcode")) });
  } catch {
    throw new SlicerError("This file is not a valid 3MF archive");
  }
  const info = files["Metadata/slice_info.config"];
  if (info) {
    const xml = strFromU8(info);
    const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    const filaments = [...xml.matchAll(/<filament\b[^>]*>/g)]
      .map(([tag]) => ({ grams: parseFloat(attr(tag, "used_g") ?? "0"), color: attr(tag, "color"), type: attr(tag, "type") }))
      .filter((f) => f.grams > 0);
    // a project can have several plates; sum them
    const seconds = [...xml.matchAll(/key="prediction"\s+value="(\d+)"/g)].reduce((a, m) => a + parseInt(m[1]), 0);
    if (filaments.length || seconds) return { filaments, timeMin: Math.round(seconds / 60) };
  }
  const gcode = Object.keys(files).find((k) => k.endsWith(".gcode"));
  if (gcode) return parseGcode(strFromU8(files[gcode]));
  throw new SlicerError(`This 3MF has no slicing results. ${EXPORT_HINT}`);
}

export async function parseSlicerFile(file: File): Promise<SlicerResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".gcode")) return parseGcode(await file.text());
  if (name.endsWith(".3mf")) return parse3mf(new Uint8Array(await file.arrayBuffer()));
  if (name.endsWith(".stl")) throw new SlicerError("STL files have no print data. Slice the model and upload the .gcode or sliced .3mf.");
  throw new SlicerError("Use a .gcode or .3mf file");
}
