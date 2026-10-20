import { cleanupPhotos } from "./photos.mjs";
import { handleApi } from "./api.mjs";
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupPhotos(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = url.pathname.startsWith("/api/")
      ? await handleApi(request, env)
      : await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self' https://tile.openstreetmap.org; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
};
