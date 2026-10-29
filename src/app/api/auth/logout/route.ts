import { publicRoute } from "@/lib/api";
import { getSession } from "@/lib/session";

export const POST = publicRoute(async () => {
  (await getSession()).destroy();
  return { ok: true };
});
