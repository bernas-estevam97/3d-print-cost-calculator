import { HttpError, route } from "@/lib/api";
import { KINDS, put, type UploadKind } from "@/lib/storage";

export const POST = route(async (req, _ctx, auth) => {
  const form = await req.formData();
  const kind = String(form.get("kind") ?? "photo") as UploadKind;
  const file = form.get("file");
  if (!(kind in KINDS) || !(file instanceof File)) throw new HttpError(400, "Missing file");
  return { url: await put(auth.workshopId, kind, file) };
});
