import { route } from "@/lib/api";
import { dashboard } from "@/lib/analytics";

export const GET = route(async (req, _ctx, auth) =>
  dashboard(auth.workshopId, new URL(req.url).searchParams.get("range") === "month" ? "month" : "week"),
);
