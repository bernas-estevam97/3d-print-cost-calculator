import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError, publicRoute } from "@/lib/api";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// ponytail: in-memory per-IP limiter, single process only (local guide section 12)
const attempts = new Map<string, { n: number; until: number }>();

export const POST = publicRoute(async (req) => {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const a = attempts.get(ip);
  if (a && a.n >= 10 && Date.now() < a.until) throw new HttpError(429, "Too many attempts, try again in a few minutes");

  const { email, password } = z.object({ email: z.string().trim().toLowerCase(), password: z.string() }).parse(await req.json());
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const n = (a && Date.now() < a.until ? a.n : 0) + 1;
    attempts.set(ip, { n, until: Date.now() + 5 * 60_000 });
    throw new HttpError(401, "Wrong email or password");
  }
  attempts.delete(ip);
  const s = await getSession();
  s.userId = user.id;
  s.workshopId = user.workshopId;
  await s.save();
  return { ok: true };
});
