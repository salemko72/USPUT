const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const pinId = (p) =>
  `pin_${Number(p.lat).toFixed(5)}_${Number(p.lng).toFixed(5)}`;
export function normalizeLocation(raw) {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    !Number.isFinite(raw.lat) ||
    !Number.isFinite(raw.lng) ||
    Math.abs(raw.lat) > 85 ||
    Math.abs(raw.lng) > 180 ||
    typeof raw.name !== "string" ||
    raw.name.trim().length < 2
  )
    return null;
  const p = {
    lat: Math.round(raw.lat * 1e5) / 1e5,
    lng: Math.round(raw.lng * 1e5) / 1e5,
    name: raw.name
      .replace(/[\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 160),
    detail:
      typeof raw.detail === "string"
        ? raw.detail.slice(0, 200)
        : "Približna lokacija potvrđena na karti",
    city: typeof raw.city === "string" ? raw.city.slice(0, 80) : "",
    countryCode:
      typeof raw.countryCode === "string"
        ? raw.countryCode.slice(0, 2).toUpperCase()
        : "",
  };
  return { ...p, id: pinId(p) };
}
export async function providerGate(env) {
  const until = Math.min(Date.now() + 14000, env.ROUTING_DEADLINE || Infinity);
  do {
    const now = Date.now();
    const result = await env.DB.prepare(
      "INSERT INTO routing_cache(id,payload,expires) VALUES('osm-upstream-rate','null',?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires WHERE routing_cache.expires<=?",
    )
      .bind(now + (env.OPENROUTESERVICE_API_KEY ? 1600 : 1100), now)
      .run();
    if (result.meta.changes) return;
    const next = await env.DB.prepare(
      "SELECT expires FROM routing_cache WHERE id='osm-upstream-rate'",
    ).first();
    await pause(
      Math.min(
        2000,
        Math.max(50, (next?.expires || Date.now() + 1000) - Date.now() + 5),
      ),
    );
  } while (Date.now() < until);
  throw Error("ProviderBusy");
}
export async function health(env, id, status, detail = "") {
  const allowed =
    /^(UpstreamHTTP\d{3}|OpenRouteServiceHTTP\d{3}|ProviderBusy|RouteTooLarge|UpstreamTooLarge|InvalidRouteResponse|InvalidOpenRouteServiceResponse|InvalidRouteWaypoints|InvalidGeocoderResponse|Routing unavailable|Invalid matrix|Missing snaps|Oversized matrix|TimeoutError|AbortError)$/;
  detail = allowed.test(String(detail))
    ? String(detail)
    : status === "unavailable"
      ? "UpstreamRequestFailed"
      : "";

  await env.DB.prepare(
    "INSERT OR REPLACE INTO routing_health(id,status,detail,checked_at) VALUES(?,?,?,?)",
  )
    .bind(id, status, String(detail).slice(0, 120), Date.now())
    .run();
}
export async function cachedProvider(
  env,
  key,
  service,
  fetcher,
  ttl = 86400000,
) {
  const row = await env.DB.prepare(
    "SELECT payload,expires FROM routing_cache WHERE id=?",
  )
    .bind(key)
    .first();
  if (row && row.expires > Date.now()) return JSON.parse(row.payload);
  if (env.ROUTING_DEADLINE && Date.now() >= env.ROUTING_DEADLINE - 1000)
    return null;
  const now = Date.now();
  const claim = await env.DB.prepare(
    "INSERT INTO routing_cache(id,payload,expires) VALUES(?,'null',?) ON CONFLICT(id) DO UPDATE SET payload='null',expires=excluded.expires WHERE routing_cache.expires<=?",
  )
    .bind(key, now + 60000, now)
    .run();
  if (!claim.meta.changes) return null;
  try {
    await providerGate(env);
    const result = await fetcher();
    await env.DB.prepare(
      "INSERT OR REPLACE INTO routing_cache(id,payload,expires) VALUES(?,?,?)",
    )
      .bind(key, JSON.stringify(result), Date.now() + ttl)
      .run();
    await health(env, service, "ready");
    return result;
  } catch (e) {
    await health(env, service, "unavailable", e.message || e.name);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO routing_cache(id,payload,expires) VALUES(?,?,?)",
    )
      .bind(key, "null", Date.now() + 60000)
      .run();
    return null;
  }
}
export async function fetchJson(env, url) {
  const response = await (env.ROUTING_FETCH || fetch)(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: "application/json",
      "User-Agent": "USPUT-Beta/0.1 (+https://github.com/salemko72/USPUT)",
    },
  });
  if (!response.ok) throw Error("UpstreamHTTP" + response.status);
  const text = await response.text();
  if (text.length > 1500000) throw Error("UpstreamTooLarge");
  return JSON.parse(text);
}
export async function readRoute(env, points, mode = "driving") {
  if (points.length < 2 || points.some((p) => !p)) return null;
  if (
    points.every(
      (p) =>
        Math.abs(p.lat - points[0].lat) < 1e-6 &&
        Math.abs(p.lng - points[0].lng) < 1e-6,
    )
  )
    return {
      duration: 0,
      distance: 0,
      coordinates: points.map((p) => [p.lng, p.lat]),
      legs: points.slice(1).map(() => ({ duration: 0, distance: 0 })),
    };
  if (env.OPENROUTESERVICE_API_KEY) {
    const profile = mode === "foot" ? "foot-walking" : "driving-car";
    const coordinates = points.map((p) => [
      Number(p.lng.toFixed(5)),
      Number(p.lat.toFixed(5)),
    ]);
    return cachedProvider(
      env,
      "ors-v1:" + profile + ":" + JSON.stringify(coordinates),
      mode,
      async () => {
        const response = await (env.ROUTING_FETCH || fetch)(
          "https://api.openrouteservice.org/v2/directions/" +
            profile +
            "/geojson",
          {
            method: "POST",
            signal: AbortSignal.timeout(12000),
            headers: {
              "Content-Type": "application/json",
              Authorization: env.OPENROUTESERVICE_API_KEY.trim(),
            },
            body: JSON.stringify({ coordinates, instructions: false }),
          },
        );
        const text = await response.text();
        if (!response.ok) {
          let detail;
          try {
            detail = JSON.parse(text).error;
          } catch {}
          if ([2009, 2010].includes(detail?.code)) return { unreachable: true };
          throw Error("OpenRouteServiceHTTP" + response.status);
        }
        if (text.length > 1500000) throw Error("RouteTooLarge");
        const feature = JSON.parse(text).features?.[0],
          summary = feature?.properties?.summary,
          segments = feature?.properties?.segments;
        if (
          !summary ||
          !Number.isFinite(summary.duration) ||
          !Number.isFinite(summary.distance) ||
          !Array.isArray(feature.geometry?.coordinates) ||
          feature.geometry.coordinates.length < 2 ||
          feature.geometry.coordinates.length > 20000 ||
          !feature.geometry.coordinates.every(
            (p) =>
              p.length >= 2 &&
              Number.isFinite(p[0]) &&
              Number.isFinite(p[1]) &&
              Math.abs(p[0]) <= 180 &&
              Math.abs(p[1]) <= 85,
          ) ||
          !Array.isArray(segments) ||
          segments.length !== points.length - 1 ||
          segments.some((s) => !Number.isFinite(s.duration) || s.duration < 0)
        )
          throw Error("InvalidOpenRouteServiceResponse");
        const snaps = feature.properties.way_points;
        if (
          !Array.isArray(snaps) ||
          snaps.length !== points.length ||
          snaps.some(
            (i) => !Number.isInteger(i) || !feature.geometry.coordinates[i],
          )
        )
          throw Error("InvalidRouteWaypoints");
        if (
          snaps.some((index, i) => {
            const p = points[i],
              q = feature.geometry.coordinates[index];
            return (
              Math.hypot(
                (p.lng - q[0]) * 111195 * Math.cos((p.lat * Math.PI) / 180),
                (p.lat - q[1]) * 111195,
              ) > (mode === "foot" ? 30 : 200)
            );
          })
        )
          return { unreachable: true };
        return {
          provider: "openrouteservice",
          duration: summary.duration,
          distance: summary.distance,
          coordinates: feature.geometry.coordinates,
          legs: segments.map((s) => ({
            duration: s.duration,
            distance: s.distance,
          })),
        };
      },
      7 * 86400000,
    );
  }
  const root = mode === "foot" ? env.OSRM_FOOT_URL : env.OSRM_URL;
  if (!root) return null;
  const coordinates = points
    .map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`)
    .join(";");
  return cachedProvider(
    env,
    `route-v1:${root}:${mode}:${coordinates}`,
    mode,
    async () => {
      const url = new URL(
        `route/v1/driving/${coordinates}`,
        root.replace(/\/?$/, "/"),
      );
      url.searchParams.set("overview", "full");
      url.searchParams.set("geometries", "geojson");
      url.searchParams.set("steps", "false");
      const data = await fetchJson(env, url);
      const route = data.routes?.[0];
      if (["NoRoute", "NoSegment"].includes(data.code))
        return { unreachable: true };
      if (
        data.code !== "Ok" ||
        !route ||
        !Number.isFinite(route.duration) ||
        route.duration < 0 ||
        !Number.isFinite(route.distance) ||
        route.distance < 0 ||
        !Array.isArray(route.geometry?.coordinates) ||
        route.geometry.coordinates.length < 2 ||
        route.geometry.coordinates.length > 20000 ||
        !route.geometry.coordinates.every(
          (p) =>
            Array.isArray(p) &&
            p.length >= 2 &&
            Number.isFinite(p[0]) &&
            Number.isFinite(p[1]) &&
            Math.abs(p[0]) <= 180 &&
            Math.abs(p[1]) <= 85,
        ) ||
        !Array.isArray(route.legs) ||
        route.legs.length !== points.length - 1 ||
        route.legs.some((l) => !Number.isFinite(l.duration) || l.duration < 0)
      )
        throw Error("InvalidRouteResponse");
      if (
        !Array.isArray(data.waypoints) ||
        data.waypoints.length !== points.length ||
        data.waypoints.some(
          (p) =>
            !Number.isFinite(p.distance) ||
            p.distance > (mode === "foot" ? 30 : 200),
        )
      )
        return { unreachable: true };
      return {
        provider: "osrm",
        duration: route.duration,
        distance: route.distance,
        coordinates: route.geometry.coordinates,
        legs: route.legs.map((l) => ({
          duration: l.duration,
          distance: l.distance,
        })),
      };
    },
    7 * 86400000,
  );
}
