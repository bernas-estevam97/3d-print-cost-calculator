import { route } from "@/lib/api";
import { get } from "@/lib/storage";

export const GET = route<{ params: Promise<{ path: string[] }> }>(async (_req, ctx, auth) => {
  const { path } = await ctx.params;
  const f = await get(auth.workshopId, "/api/files/" + path.join("/"));
  return new Response(new Uint8Array(f.bytes), {
    headers: { "Content-Type": f.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
});
