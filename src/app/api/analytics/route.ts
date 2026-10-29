import { HttpError, route } from "@/lib/api";
import { analytics } from "@/lib/analytics";

export const GET = route(async (req, _ctx, auth) => {
  const sp = new URL(req.url).searchParams;
  const from = new Date(sp.get("from") ?? "");
  const to = new Date(sp.get("to") ?? "");
  if (isNaN(+from) || isNaN(+to)) throw new HttpError(400, "from and to are required");
  return analytics(auth.workshopId, from, to);
});
