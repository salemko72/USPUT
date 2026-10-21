import { normalizeLocation, readRoute } from "./route-provider.mjs";
const text = (v, n = 120) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f]/g, "")
        .trim()
        .slice(0, n)
    : "";
const metres = (a, b) =>
  Math.hypot(
    (a.lng - b.lng) * 111195 * Math.cos((a.lat * Math.PI) / 180),
    (a.lat - b.lat) * 111195,
  );
async function digest(s) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function normalizeMeetingStops(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 10)
    throw new TypeError("Potvrdi između 2 i 10 mjesta ulaska i izlaska.");
  const stops = raw.map((p, i) => {
    const point = normalizeLocation(p);
    if (!point)
      throw new TypeError("Svako mjesto susreta treba naziv i ispravan pin.");
    return {
      ...point,
      stopId: `stop_${point.id}`,
      approach: text(p.approach),
      side: text(p.side, 40),
      ...(text(p.catalogId, 100) ? { catalogId: text(p.catalogId, 100) } : {}),
    };
  });
  if (new Set(stops.map((p) => p.stopId)).size !== stops.length)
    throw new TypeError("Mjesta susreta trebaju imati različite pinove.");
  return stops;
}
export function proposeMeetingStops(route, from, to) {
  const coords = route.coordinates,
    lengths = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += metres(
      { lng: coords[i - 1][0], lat: coords[i - 1][1] },
      { lng: coords[i][0], lat: coords[i][1] },
    );
    lengths.push(total);
  }
  const stops = [{ ...from, stopId: `stop_${from.id}` }];
  if (total > 2) {
    for (const fraction of [1 / 2]) {
      const target = total * fraction;
      let i = lengths.findIndex((n) => n >= target);
      if (i < 1) i = 1;
      const ratio =
          (target - lengths[i - 1]) /
          Math.max(0.01, lengths[i] - lengths[i - 1]),
        a = coords[i - 1],
        b = coords[i];
      const p = normalizeLocation({
        lat: a[1] + ratio * (b[1] - a[1]),
        lng: a[0] + ratio * (b[0] - a[0]),
        name: "Mjesto susreta",
        city: from.city || to.city,
        detail:
          "Prijedlog uz trasu. Vozač treba provjeriti prilaz, imenovati mjesto i potvrditi gdje može stati.",
      });
      if (p && ![from, to].some((s) => metres(s, p) < 1))
        stops.push({ ...p, name: "", stopId: `stop_${p.id}` });
    }
  }
  stops.push({ ...to, stopId: `stop_${to.id}` });
  return stops;
}
function routePoints(from, to, stops) {
  const points = [from],
    indices = [];
  for (const stop of stops) {
    if (metres(points.at(-1), stop) > 1) points.push(stop);
    indices.push(points.length - 1);
  }
  if (metres(points.at(-1), to) > 1) points.push(to);
  return { points, indices };
}
const signature = (from, to, stops) =>
  JSON.stringify([
    normalizeLocation(from),
    normalizeLocation(to),
    normalizeMeetingStops(stops),
  ]);
export async function previewMeetingRoute(env, ownerId, from, to, rawStops) {
  const stops = normalizeMeetingStops(rawStops),
    { points, indices } = routePoints(from, to, stops);
  const route = await readRoute(env, points);
  if (!route || route.unreachable)
    throw new Error(
      "Cestovni proračun trenutno nije dostupan. Rutu još nije moguće potvrditi.",
    );
  const elapsed = [0];
  for (const leg of route.legs) elapsed.push(elapsed.at(-1) + leg.duration);
  const meetingStops = stops.map((stop, i) => ({
    ...stop,
    travelSeconds: elapsed[indices[i]],
  }));
  const previewToken = crypto.randomUUID() + crypto.randomUUID(),
    payload = {
      route,
      from,
      to,
      meetingStops,
      signature: signature(from, to, stops),
    };
  await env.DB.prepare("DELETE FROM meeting_route_previews WHERE expires<?")
    .bind(Date.now())
    .run();
  await env.DB.prepare(
    "INSERT INTO meeting_route_previews(id,owner_id,payload,expires) VALUES(?,?,?,?)",
  )
    .bind(
      await digest(previewToken),
      ownerId,
      JSON.stringify(payload),
      Date.now() + 600000,
    )
    .run();
  return { route, from, to, meetingStops, previewToken };
}
export async function consumeMeetingPreview(
  env,
  ownerId,
  token,
  from,
  to,
  stops,
) {
  if (typeof token !== "string" || token.length > 200)
    throw new TypeError("Ponovo pregledaj i potvrdi trasu s mjestima susreta.");
  const row = await env.DB.prepare(
    "SELECT payload FROM meeting_route_previews WHERE id=? AND owner_id=? AND expires>?",
  )
    .bind(await digest(token), ownerId, Date.now())
    .first();
  if (!row)
    throw new TypeError("Pregled rute je istekao. Ponovo potvrdi trasu.");
  const payload = JSON.parse(row.payload);
  if (payload.signature !== signature(from, to, stops))
    throw new TypeError(
      "Mjesta susreta su promijenjena. Ponovo proračunaj trasu.",
    );
  return payload;
}
export async function matchMeetingStops(
  env,
  ride,
  from,
  to,
  wantedAt,
  walkMinutes,
  preferred = {},
) {
  if (
    ![5, 10, 15].includes(walkMinutes) ||
    !Number.isFinite(wantedAt) ||
    metres(from, to) < 1
  )
    return null;
  const published = ride.meetingStops?.length
    ? ride.meetingStops
    : [ride.from, ride.to];
  if (
    !published.some((p) => metres(from, p) <= walkMinutes * 120) ||
    !published.some((p) => metres(to, p) <= walkMinutes * 120)
  )
    return null;
  const route = ride.route || (await readRoute(env, [ride.from, ride.to]));
  if (!route) return { unavailable: true };
  if (route.unreachable) return null;
  const stops = ride.meetingStops?.length
    ? ride.meetingStops
    : [
        { ...ride.from, stopId: `stop_${ride.from.id}`, travelSeconds: 0 },
        {
          ...ride.to,
          stopId: `stop_${ride.to.id}`,
          travelSeconds: route.duration,
        },
      ];
  async function reachable(point, exit) {
    const options = stops
      .map((p, index) => ({ point: p, index }))
      .filter(
        (c) =>
          (!preferred[exit ? "dropoffStopId" : "pickupStopId"] ||
            c.point.stopId ===
              preferred[exit ? "dropoffStopId" : "pickupStopId"]) &&
          metres(point, c.point) <= walkMinutes * 120 &&
          (exit ||
            Math.abs(
              ride.departure + c.point.travelSeconds * 1000 - wantedAt,
            ) <= 3600000),
      )
      .sort((a, b) => metres(point, a.point) - metres(point, b.point));
    const accepted = [];
    let unavailable = false;
    for (const c of options) {
      const foot = await readRoute(
        env,
        exit ? [c.point, point] : [point, c.point],
        "foot",
      );
      if (!foot) {
        unavailable = true;
        continue;
      }
      if (foot.unreachable || foot.duration > walkMinutes * 60) continue;
      accepted.push({ ...c, foot });
    }
    return { accepted, unavailable };
  }
  const starts = await reachable(from, false),
    ends = await reachable(to, true);
  let best = null;
  for (const start of starts.accepted)
    for (const end of ends.accepted) {
      if (start.index >= end.index) continue;
      const pickupAt = ride.departure + start.point.travelSeconds * 1000;
      if (
        !Number.isFinite(pickupAt) ||
        Math.abs(pickupAt - wantedAt) > 3600000 ||
        pickupAt < Date.now() + start.foot.duration * 1000
      )
        continue;
      const match = {
        pickup: start.point,
        dropoff: end.point,
        pickupAt,
        extraMinutes: 0,
        rideMinutes: Math.ceil(
          (end.point.travelSeconds - start.point.travelSeconds) / 60,
        ),
        walkToMinutes: Math.ceil(start.foot.duration / 60),
        walkFromMinutes: Math.ceil(end.foot.duration / 60),
        walkToMeters: Math.ceil(start.foot.distance),
        walkFromMeters: Math.ceil(end.foot.distance),
        walkingLimit: walkMinutes,
        source: "osrm-corridor",
        provider: route.provider || "osrm",
        geometry: route.coordinates.filter(
          (_, i) =>
            i % Math.max(1, Math.ceil(route.coordinates.length / 1500)) === 0 ||
            i === route.coordinates.length - 1,
        ),
        fixedMeetingPoints: true,
        score:
          Math.abs(pickupAt - wantedAt) / 60000 +
          (start.foot.duration + end.foot.duration) / 60,
      };
      if (!best || match.score < best.score) best = match;
    }
  return (
    best ||
    (starts.unavailable || ends.unavailable ? { unavailable: true } : null)
  );
}
