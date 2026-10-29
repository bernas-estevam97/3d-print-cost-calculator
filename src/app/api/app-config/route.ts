import { route } from "@/lib/api";

const PRIVATE = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i;

/** What the browser needs to know about this install (local guide 5.2). */
export const GET = route(async () => {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  return { publicBaseUrl, shareLinksEnabled: !PRIVATE.test(publicBaseUrl) };
});
