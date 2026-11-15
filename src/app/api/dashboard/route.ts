import { route } from "@/lib/api";
import { dashboard } from "@/lib/analytics";

export const GET = route(async (req, _ctx, auth) => {
  const r = new URL(req.url).searchParams.get("range");
  return dashboard(auth.workshopId, r === "month" || r === "all" ? r : "week");
});
