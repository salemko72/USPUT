import { localPhotoStorage } from "./photo-storage.mjs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { handleApi } from "./api.mjs";
import { adaptSqlite } from "./db.mjs";
const root = resolve(import.meta.dirname, "..");
const data = process.env.USPUT_DATA_DIR || resolve(root, ".data");
mkdirSync(data, { recursive: true });
const sqlite = new DatabaseSync(resolve(data, "usput.sqlite"));
sqlite.exec("PRAGMA journal_mode=WAL;");
sqlite.exec(readFileSync(resolve(root, "server/schema.sql"), "utf8"));
if (
  !sqlite
    .prepare("PRAGMA table_info(rides)")
    .all()
    .some((c) => c.name === "cost_sharing")
)
  sqlite.exec(
    "ALTER TABLE rides ADD COLUMN cost_sharing INTEGER NOT NULL DEFAULT 0 CHECK(cost_sharing IN (0,1))",
  );
for (const column of ["from_json", "to_json", "route_json"])
  if (
    !sqlite
      .prepare("PRAGMA table_info(rides)")
      .all()
      .some((c) => c.name === column)
  )
    sqlite.exec(`ALTER TABLE rides ADD COLUMN ${column} TEXT`);
export const env = {
  DB: adaptSqlite(sqlite),
  PHOTOS: localPhotoStorage(resolve(data, "photos")),
  OSRM_URL: process.env.OSRM_URL,
  OSRM_FOOT_URL: process.env.OSRM_FOOT_URL,
  OPENROUTESERVICE_API_KEY: process.env.OPENROUTESERVICE_API_KEY,
  GEOCODER_URL: process.env.GEOCODER_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
const port = Number(process.env.PORT || 8787),
  host = process.env.HOST || "127.0.0.1";
const server = createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || "localhost:" + port}`,
    );
    let response;
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (
          length >
          (url.pathname.startsWith("/api/photos/") ? 150 * 1024 : 16384)
        ) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end('{"error":"Prevelik zahtjev."}');
          return;
        }
        chunks.push(chunk);
      }
      response = await handleApi(
        new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(!["GET", "HEAD"].includes(req.method)
            ? { body: Buffer.concat(chunks) }
            : {}),
        }),
        env,
      );
    } else {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const dist = resolve(root, "dist");
      let file = resolve(dist, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(dist + "/") && file !== dist) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(file) || statSync(file).isDirectory())
        file = resolve(dist, "index.html");
      if (!existsSync(file)) {
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Prvo pokreni npm run build u app folderu.");
        return;
      }
      response = new Response(
        req.method === "HEAD" ? null : readFileSync(file),
        {
          headers: {
            "Content-Type": types[extname(file)] || "application/octet-stream",
            "Cache-Control":
              extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
          },
        },
      );
    }
    res.writeHead(response.status, {
      ...securityHeaders,
      ...Object.fromEntries(response.headers),
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Local server:", error.name);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end('{"error":"Server nije dostupan."}');
  }
});
server.listen(port, host, () =>
  console.log(
    `USPUT local server listening on ${host}:${port}; SQLite persistent in .data/`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      sqlite.close();
      process.exit(0);
    }),
  );
