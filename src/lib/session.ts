import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = { userId?: string; workshopId?: string };
export type Auth = { userId: string; workshopId: string };

export const SESSION_COOKIE = "pp_session";

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    cookieName: SESSION_COOKIE,
    password: process.env.SESSION_SECRET!,
    ttl: 60 * 60 * 24 * 30,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true" },
  });
}
