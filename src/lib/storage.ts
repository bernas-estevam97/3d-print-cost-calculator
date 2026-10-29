// The only module that touches the filesystem for user files (local guide section 7).
// Files live at uploads/<workshopId>/<kind>/<uuid>.<ext> and are served by /api/files,
// which checks the workshop. Never under public/.
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./api";

// turbopackIgnore: runtime data folder, keep it out of build-time file tracing
const ROOT = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? "./uploads");
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 50) * 1024 * 1024;

export const KINDS = {
  photo: [".png", ".jpg", ".jpeg", ".webp"],
  model: [".gcode", ".3mf", ".stl"],
} as const;
export type UploadKind = keyof typeof KINDS;

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gcode": "text/plain", ".3mf": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml", ".stl": "model/stl",
};

function sniff(ext: string, b: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (ext === ".png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (ext === ".jpg" || ext === ".jpeg") return starts(0xff, 0xd8, 0xff);
  if (ext === ".webp") return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  if (ext === ".3mf") return starts(0x50, 0x4b, 0x03, 0x04);
  return true; // .gcode / .stl have no magic number
}

export async function put(workshopId: string, kind: UploadKind, file: File): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  if (!(KINDS[kind] as readonly string[]).includes(ext)) throw new HttpError(400, `File type ${ext || "?"} not allowed`);
  if (file.size > MAX_BYTES) throw new HttpError(400, `File larger than ${MAX_BYTES / 1024 / 1024} MB`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniff(ext, bytes)) throw new HttpError(400, "File content does not match its extension");
  const rel = path.posix.join(workshopId, kind, `${crypto.randomUUID()}${ext}`);
  await mkdir(path.join(/* turbopackIgnore: true */ ROOT, workshopId, kind), { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ ROOT, rel), bytes);
  return `/api/files/${rel}`;
}

function resolve(workshopId: string, url: string) {
  const rel = url.replace(/^\/api\/files\//, "");
  const abs = path.resolve(/* turbopackIgnore: true */ ROOT, rel);
  // reject traversal and other workshops' files
  if (!abs.startsWith(path.join(/* turbopackIgnore: true */ ROOT, workshopId) + path.sep)) throw new HttpError(404, "Not found");
  return abs;
}

export async function get(workshopId: string, url: string) {
  const abs = resolve(workshopId, url);
  try {
    return { bytes: await readFile(abs), type: MIME[path.extname(abs)] ?? "application/octet-stream" };
  } catch {
    throw new HttpError(404, "Not found");
  }
}

export async function remove(workshopId: string, url: string | null | undefined) {
  if (!url?.startsWith("/api/files/")) return;
  await unlink(resolve(workshopId, url)).catch(() => {});
}

/** Every file of a workshop (account deletion). */
export async function removeAll(workshopId: string) {
  if (!/^[\w-]+$/.test(workshopId)) return;
  await rm(path.join(/* turbopackIgnore: true */ ROOT, workshopId), { recursive: true, force: true });
}
