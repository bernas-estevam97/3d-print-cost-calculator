"use client";
import QRCode from "qrcode";

/** Opens a print window with a QR code and a caption (the "Print QR" buttons). */
export async function printQr(text: string, caption: string) {
  const url = await QRCode.toDataURL(text, { margin: 1, width: 480 });
  const w = window.open("", "_blank", "width=420,height=560");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><title>${esc(caption)}</title><body style="font-family:system-ui;text-align:center;padding:24px">
<img src="${url}" style="width:300px;height:300px"><h2 style="margin:12px 0 4px">${esc(caption)}</h2><div style="font-family:monospace;font-size:20px">${esc(text)}</div>
<script>window.onload=()=>window.print()</script></body>`);
  w.document.close();
}
