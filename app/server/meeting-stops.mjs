import { assessMatch, categoryOrder } from "./match-assessment.mjs";
import { normalizeLocation, readRoute } from "./route-provider.mjs";
import {
  normalizeRouteViaPoints,
  readDriverRoute,
  stopsOnShape,
} from "./route-shape.mjs";
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
    if (
      !p ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      (p.name != null && typeof p.name !== "string")
    )
      throw new TypeError("Svako mjesto susreta treba ispravan pin.");
    const name = text(p.name, 160);
    const automaticName =
      name.length < 2 ||
      /^Predložena tačka/.test(name) ||
      p.automaticName === true;
    const point = normalizeLocation({
      ...p,
      name:
        name.length < 2 || /^Predložena tačka/.test(name)
          ? `Mjesto susreta ${Math.max(1, i)}`
          : name,
    });
    if (!point) throw new TypeError("Svako mjesto susreta treba ispravan pin.");
    return {
      ...point,
      stopId: `stop_${point.id}`,
      ...(automaticName ? { automaticName: true } : {}),
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
  return [
    { ...from, stopId: `stop_${from.id}` },
    { ...to, stopId: `stop_${to.id}` },
  ];
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
const signature = (from, to, stops, via) =>
  JSON.stringify([
    normalizeLocation(from),
    normalizeLocation(to),
    normalizeMeetingStops(stops),
    ...(via === undefined ? [] : [normalizeRouteViaPoints(via)]),
  ]);
export async function previewMeetingRoute(
  env,
  ownerId,
  from,
  to,
  rawStops,
  rawVia,
) {
  const stops = normalizeMeetingStops(rawStops),
    { points, indices } = routePoints(from, to, stops);
  const route =
    rawVia === undefined
      ? await readRoute(env, points)
      : await readDriverRoute(env, from, to, rawVia);
  if (!route || route.unreachable)
    throw new Error(
      "Cestovni proračun trenutno nije dostupan. Rutu još nije moguće potvrditi.",
    );
  const elapsed = [0];
  for (const leg of route.legs) elapsed.push(elapsed.at(-1) + leg.duration);
  const meetingStops =
    rawVia === undefined
      ? stops.map((stop, i) => ({
          ...stop,
          travelSeconds: elapsed[indices[i]],
        }))
      : stopsOnShape(route, stops, from, to);
  const previewToken = crypto.randomUUID() + crypto.randomUUID(),
    payload = {
      route,
      from,
      to,
      meetingStops,
      signature: signature(from, to, stops, rawVia),
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
  return {
    route,
    from,
    to,
    meetingStops,
    previewToken,
    ...(rawVia === undefined ? {} : { routeViaPoints: route.viaPoints }),
  };
}
export async function consumeMeetingPreview(
  env,
  ownerId,
  token,
  from,
  to,
  stops,
  via,
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
  if (payload.signature !== signature(from, to, stops, via))
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
  options = {},
) {
  if (
    ![5, 10, 15].includes(walkMinutes) ||
    !Number.isFinite(wantedAt) ||
    metres(from, to) < 1
  )
    return null;
  const effectiveWalkingLimit =
    walkMinutes + (options.flexible === true ? 5 : 0);
  const published = ride.meetingStops?.length
    ? ride.meetingStops
    : [ride.from, ride.to];
  if (
    !published.some((p) => metres(from, p) <= effectiveWalkingLimit * 120) ||
    !published.some((p) => metres(to, p) <= effectiveWalkingLimit * 120)
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
    const candidates = stops
      .map((p, index) => ({ point: p, index }))
      .filter(
        (c) =>
          (!options[exit ? "dropoffStopIds" : "pickupStopIds"] ||
            options[exit ? "dropoffStopIds" : "pickupStopIds"].includes(
              c.point.stopId,
            )) &&
          (!preferred[exit ? "dropoffStopId" : "pickupStopId"] ||
            c.point.stopId ===
              preferred[exit ? "dropoffStopId" : "pickupStopId"]) &&
          metres(point, c.point) <= effectiveWalkingLimit * 120 &&
          (exit ||
            Math.abs(
              ride.departure + c.point.travelSeconds * 1000 - wantedAt,
            ) <= 3600000),
      )
      .sort((a, b) => metres(point, a.point) - metres(point, b.point));
    const accepted = [];
    let unavailable = false;
    for (const c of candidates) {
      const foot = await readRoute(
        env,
        exit ? [c.point, point] : [point, c.point],
        "foot",
      );
      if (!foot) {
        unavailable = true;
        continue;
      }
      if (foot.unreachable || foot.duration > effectiveWalkingLimit * 60)
        continue;
      accepted.push({ ...c, foot });
    }
    return { accepted, unavailable };
  }
  const starts = await reachable(from, false),
    ends = await reachable(to, true);
  let best = null;
  for (const start of starts.accepted)
    for (const end of ends.accepted) {
      if (
        start.index >= end.index ||
        (options.routeOrdered && start.point.along + 1 >= end.point.along)
      )
        continue;
      if (end.point.travelSeconds <= start.point.travelSeconds) continue;
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
        walkToSeconds: start.foot.duration,
        walkFromSeconds: end.foot.duration,
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
      match.assessment = assessMatch(match, wantedAt, walkMinutes);
      if (!match.assessment) continue;
      const rank = categoryOrder[match.assessment?.category] ?? 0,
        bestRank = categoryOrder[best?.assessment?.category] ?? 0;
      if (
        !best ||
        rank < bestRank ||
        (rank === bestRank &&
          (match.score < best.score ||
            (match.score === best.score &&
              match.rideMinutes < best.rideMinutes)))
      )
        best = match;
    }
  return (
    best ||
    (starts.unavailable || ends.unavailable ? { unavailable: true } : null)
  );
}
