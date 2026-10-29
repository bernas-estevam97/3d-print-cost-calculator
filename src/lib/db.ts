import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Scripts (seed, backup) run outside Next, which is what normally loads .env.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile();
  } catch {}
}

// One client per process; dev hot reload would otherwise open a new one per edit.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  g.prisma ?? new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }) });

if (process.env.NODE_ENV !== "production") g.prisma = db;

export { parseJson } from "./json";
