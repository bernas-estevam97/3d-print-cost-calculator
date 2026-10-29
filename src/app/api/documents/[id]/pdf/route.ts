import { notFound, route } from "@/lib/api";
import { renderDocumentPdf } from "@/lib/documents";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, ctx, auth) => {
  const pdf = await renderDocumentPdf(auth.workshopId, (await ctx.params).id);
  if (!pdf) throw notFound();
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.number}.pdf"` },
  });
});
