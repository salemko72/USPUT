import { places } from "./places.mjs";
const inflight = new WeakMap();
export async function readRoadMatrix(env) {
  if (!env.OSRM_URL) return null;
  if (inflight.has(env)) return inflight.get(env);
  const pending = loadMatrix(env).catch(() => null);
  inflight.set(env, pending);
  try {
    return await pending;
  } finally {
    inflight.delete(env);
  }
}
async function loadMatrix(env) {
  const root = new URL(env.OSRM_URL);
  if (
    root.protocol !== "https:" &&
    !(
      root.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(root.hostname)
    )
  )
    return null;
  const coordinates = places.map((p) => `${p.lng},${p.lat}`).join(";");
  const key = root.href + "|" + coordinates;
  const cached = await env.DB.prepare(
    "SELECT payload,expires FROM routing_cache WHERE id=?",
  )
    .bind(key)
    .first();
  if (cached && cached.expires > Date.now()) return JSON.parse(cached.payload);
  const now = Date.now();
  const claim = await env.DB.prepare(
    "INSERT INTO routing_cache(id,payload,expires) VALUES(?,'null',?) ON CONFLICT(id) DO UPDATE SET payload='null',expires=excluded.expires WHERE routing_cache.expires<=?",
  )
    .bind(key, now + 15000, now)
    .run();
  if (!claim.meta.changes) return null;
  try {
    const url = new URL(
      `table/v1/driving/${coordinates}`,
      root.href.replace(/\/?$/, "/"),
    );
    url.searchParams.set("annotations", "duration");
    const response = await (env.ROUTING_FETCH || fetch)(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw Error("Routing unavailable");
    const text = await response.text();
    if (text.length > 200000) throw Error("Oversized matrix");
    const data = JSON.parse(text),
      n = places.length;
    if (
      data.code !== "Ok" ||
      !Array.isArray(data.durations) ||
      data.durations.length !== n ||
      !data.durations.every(
        (row) =>
          Array.isArray(row) &&
          row.length === n &&
          row.every(
            (v) => v === null || (Number.isFinite(v) && v >= 0 && v < 86400),
          ),
      )
    )
      throw Error("Invalid matrix");
    if (
      !Array.isArray(data.sources) ||
      !Array.isArray(data.destinations) ||
      data.sources.length !== n ||
      data.destinations.length !== n
    )
      throw Error("Missing snaps");
    const durations = data.durations.map((row, i) =>
      row.map((v, j) =>
        Number.isFinite(data.sources[i]?.distance) &&
        data.sources[i].distance <= 200 &&
        Number.isFinite(data.destinations[j]?.distance) &&
        data.destinations[j].distance <= 200
          ? v
          : null,
      ),
    );
    const result = { ids: places.map((p) => p.id), durations };
    await env.DB.prepare(
      "INSERT OR REPLACE INTO routing_cache(id,payload,expires) VALUES(?,?,?)",
    )
      .bind(key, JSON.stringify(result), Date.now() + 86400000)
      .run();
    return result;
  } catch {
    // Brief negative cache prevents an outage causing one upstream call per search.
    await env.DB.prepare(
      "INSERT OR REPLACE INTO routing_cache(id,payload,expires) VALUES(?,?,?)",
    )
      .bind(key, "null", Date.now() + 60000)
      .run();
    return null;
  }
}
export function matchRoute(
  ride,
  fromId,
  toId,
  wantedAt,
  matrix,
  points = places,
) {
  const a = points.find((p) => p.id === ride.from_id),
    b = points.find((p) => p.id === ride.to_id),
    p = points.find((p) => p.id === fromId),
    q = points.find((p) => p.id === toId);
  if (!a || !b || !p || !q || p.id === q.id || !Number.isFinite(wantedAt))
    return null;
  const cos = Math.cos((p.lat * Math.PI) / 180),
    dx = (b.lng - a.lng) * cos,
    dy = b.lat - a.lat,
    px = (q.lng - p.lng) * cos,
    py = q.lat - p.lat;
  if (dx * px + dy * py <= 0) return null;
  const leg = (x, y) =>
    matrix.durations[matrix.ids.indexOf(x.id)]?.[matrix.ids.indexOf(y.id)];
  const base = leg(a, b),
    first = leg(a, p),
    shared = leg(p, q),
    last = leg(q, b);
  if (
    ![base, first, shared, last].every((v) => Number.isFinite(v) && v >= 0) ||
    base <= 0 ||
    shared <= 0
  )
    return null;
  const extra = Math.max(0, first + shared + last - base),
    pickupAt = ride.departure + first * 1000;
  if (
    extra > 600 ||
    extra > Math.max(180, base * 0.5) ||
    Math.abs(pickupAt - wantedAt) > 3600000 ||
    pickupAt <= Date.now()
  )
    return null;
  return {
    pickup: p,
    dropoff: q,
    pickupAt,
    extraMinutes: Math.ceil(extra / 60),
    rideMinutes: Math.ceil(shared / 60),
    source: "osrm",
    score: Math.abs(pickupAt - wantedAt) / 60000 + extra / 30,
  };
}
