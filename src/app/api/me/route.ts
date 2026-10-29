import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { remove, removeAll } from "@/lib/storage";

const pick = { id: true, email: true, name: true, avatarUrl: true, notifyLowFilament: true, notifyOverdue: true } as const;

export const GET = route(async (_req, _ctx, auth) => {
  const [user, workshop] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: auth.userId }, select: pick }),
    db.workshop.findUniqueOrThrow({ where: { id: auth.workshopId } }),
  ]);
  return { ...user, workshop };
});

export const PATCH = route(async (req, _ctx, auth) => {
  const d = z
    .object({
      name: z.string().trim().min(1).optional(),
      avatarUrl: z.string().nullable().optional(),
      notifyLowFilament: z.boolean().optional(),
      notifyOverdue: z.boolean().optional(),
      workshopName: z.string().trim().min(1).optional(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8, "At least 8 characters").optional(),
    })
    .parse(await req.json());
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
  const data: Record<string, unknown> = {};
  if (d.name) data.name = d.name;
  if (d.notifyLowFilament !== undefined) data.notifyLowFilament = d.notifyLowFilament;
  if (d.notifyOverdue !== undefined) data.notifyOverdue = d.notifyOverdue;
  if (d.avatarUrl !== undefined) {
    if (user.avatarUrl !== d.avatarUrl) await remove(auth.workshopId, user.avatarUrl);
    data.avatarUrl = d.avatarUrl;
  }
  if (d.newPassword) {
    if (!d.currentPassword || !(await bcrypt.compare(d.currentPassword, user.passwordHash)))
      throw new HttpError(400, "Current password is wrong");
    data.passwordHash = await bcrypt.hash(d.newPassword, 10);
  }
  if (d.workshopName) await db.workshop.update({ where: { id: auth.workshopId }, data: { name: d.workshopName } });
  await db.user.update({ where: { id: auth.userId }, data });
  return db.user.findUniqueOrThrow({ where: { id: auth.userId }, select: pick });
});

/** Danger zone: delete the whole workshop and every record in it. */
export const DELETE = route(async (req, _ctx, auth) => {
  const { password } = z.object({ password: z.string() }).parse(await req.json());
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(400, "Password is wrong");
  await db.workshop.delete({ where: { id: auth.workshopId } });
  await removeAll(auth.workshopId);
  (await getSession()).destroy();
  return { ok: true };
});
