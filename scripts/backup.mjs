// File-level backup (local guide section 10): a consistent SQLite snapshot plus a copy of uploads/,
// into backup/<timestamp>/. Safe while the app runs. Keeps the newest 7. Stdlib only.
// Usage: npm run backup            (optionally BACKUP_DIR=D:/OneDrive/3d-backups npm run backup)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

process.loadEnvFile?.();
const dbFile = path.resolve((process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, ""));
const uploads = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
const root = path.resolve(process.env.BACKUP_DIR ?? "./backup");
const KEEP = 7;

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(root, stamp);
mkdirSync(dest, { recursive: true });

const db = new DatabaseSync(dbFile, { readOnly: true });
await backup(db, path.join(dest, "dev.db"));
db.close();
if (existsSync(uploads)) cpSync(uploads, path.join(dest, "uploads"), { recursive: true });

const old = readdirSync(root).filter((d) => /^\d{4}-/.test(d)).sort().reverse().slice(KEEP);
for (const d of old) rmSync(path.join(root, d), { recursive: true, force: true });

console.log(`Backup written to ${dest}${old.length ? ` (removed ${old.length} old)` : ""}`);
