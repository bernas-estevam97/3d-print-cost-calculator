import { HttpError, route } from "@/lib/api";
import { importData } from "@/lib/backup";

export const POST = route(async (req, _ctx, auth) => {
  try {
    return await importData(auth.workshopId, await req.json());
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
