import { ZodError } from "zod";
import { getSession, type Auth } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "Not found");

function toResponse(out: unknown) {
  return out instanceof Response ? out : Response.json(out ?? { ok: true });
}

function toError(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) return Response.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
  console.error(e);
  return Response.json({ error: "Server error" }, { status: 500 });
}

export async function requireAuth(): Promise<Auth> {
  const s = await getSession();
  if (!s.userId || !s.workshopId) throw new HttpError(401, "Not signed in");
  return { userId: s.userId, workshopId: s.workshopId };
}

/** Route handler wrapper: authenticates, maps errors to JSON. */
export function route<C = unknown>(fn: (req: Request, ctx: C, auth: Auth) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      return toResponse(await fn(req, ctx, await requireAuth()));
    } catch (e) {
      return toError(e);
    }
  };
}

/** Same as route() but without authentication (login, register, public order page). */
export function publicRoute<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      return toResponse(await fn(req, ctx));
    } catch (e) {
      return toError(e);
    }
  };
}
