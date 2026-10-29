import { route } from "@/lib/api";
import { exportData } from "@/lib/backup";

export const GET = route(async (req, _ctx, auth) => {
  const scope = new URL(req.url).searchParams.get("scope") === "settings" ? "settings" : "full";
  const body = await exportData(auth.workshopId, scope);
  const name = `3d-print-pricing-${scope}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"` },
  });
});
