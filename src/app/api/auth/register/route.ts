import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError, publicRoute } from "@/lib/api";
import { createWorkshop } from "@/lib/bootstrap";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export const POST = publicRoute(async (req) => {
  const d = z
    .object({
      name: z.string().trim().min(1, "Name is required"),
      email: z.string().trim().toLowerCase().email("Invalid email"),
      password: z.string().min(8, "At least 8 characters"),
      workshop: z.string().trim().optional(),
    })
    .parse(await req.json());
  if (await db.user.findUnique({ where: { email: d.email } })) throw new HttpError(409, "Email already registered");
  const ws = await createWorkshop(db, d.workshop || `${d.name}'s workshop`);
  const user = await db.user.create({
    data: { email: d.email, name: d.name, passwordHash: await bcrypt.hash(d.password, 10), workshopId: ws.id },
  });
  const s = await getSession();
  s.userId = user.id;
  s.workshopId = ws.id;
  await s.save();
  return { ok: true };
});
