import { cleanupPhotos } from "./photos.mjs";
import { handleApi } from "./api.mjs";
import {
  cleanupNotifications,
  deliverPushNotifications,
} from "./notifications.mjs";
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(deliverPushNotifications(env));
    if (event.cron === "0 3 * * *") {
      ctx.waitUntil(cleanupPhotos(env));
      ctx.waitUntil(cleanupNotifications(env));
    }
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = url.pathname.startsWith("/api/")
      ? await handleApi(request, { ...env, waitUntil: ctx.waitUntil.bind(ctx) })
      : await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    if (url.pathname === "/sw.js") {
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Service-Worker-Allowed", "/");
    }
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://tiles.openfreemap.org https://*.openfreemap.org https://assets.openfreemap.com; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
};
