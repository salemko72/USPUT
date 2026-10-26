// Beta-only switch. Remove DEMO_EXPIRES_AT from deployment vars before launch.
export function demoStatus(env, now = Date.now()) {
  const raw = env.DEMO_EXPIRES_AT;
  if (!raw) return { expiresAt: null, expired: false, serverNow: now };
  const expiresAt = Date.parse(raw);
  // Invalid configured limits fail closed rather than silently extending beta.
  return {
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    expired: !Number.isFinite(expiresAt) || now >= expiresAt,
    serverNow: now,
  };
}
export function demoExpiredResponse(api = false) {
  const headers = { "Cache-Control": "no-store" };
  if (api)
    return Response.json(
      { code: "DEMO_EXPIRED", error: "Demo period je završen." },
      { status: 410, headers },
    );
  return new Response(
    `<!doctype html><html lang="bs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>USPUT · Demo period je završen</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f6f0;color:#151a15;font-family:system-ui,sans-serif}main{padding:32px;max-width:480px}b{display:inline-block;background:#d5fa62;padding:10px 18px;border-radius:24px}h1{font-size:32px}p{line-height:1.6}</style><main><b>USPUT · DEMO</b><h1>Demo period je završen.</h1><p>Hvala što si testirao USPUT. Ova demo verzija više nije dostupna.</p><p lang="en">The demo period has ended. Thank you for testing USPUT.</p></main></html>`,
    {
      status: 410,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    },
  );
}
