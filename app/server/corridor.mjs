import { readRoute, pinId } from "./route-provider.mjs";
import { places } from "./places.mjs";
export function projectOnRoute(point, coordinates) {
  const k = 111195,
    cos = Math.cos((point.lat * Math.PI) / 180);
  let best = null,
    along = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1],
      b = coordinates[i],
      ax = (a[0] - point.lng) * k * cos,
      ay = (a[1] - point.lat) * k,
      bx = (b[0] - point.lng) * k * cos,
      by = (b[1] - point.lat) * k,
      dx = bx - ax,
      dy = by - ay,
      length = Math.hypot(dx, dy),
      ratio = length
        ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (length * length)))
        : 0,
      distance = Math.hypot(ax + ratio * dx, ay + ratio * dy);
    if (!best || distance < best.distance)
      best = {
        distance,
        along: along + ratio * length,
        lat: a[1] + ratio * (b[1] - a[1]),
        lng: a[0] + ratio * (b[0] - a[0]),
      };
    along += length;
  }
  return best;
}
const distance = (a, b) =>
  Math.hypot(
    (a.lng - b.lng) * 111195 * Math.cos((a.lat * Math.PI) / 180),
    (a.lat - b.lat) * 111195,
  );
const thin = (points, max = 1500) => {
  const step = Math.max(1, Math.ceil(points.length / max));
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
};
export async function corridorMatch(
  env,
  ride,
  from,
  to,
  wantedAt,
  walkMinutes,
) {
  if (
    ![5, 10, 15].includes(walkMinutes) ||
    !Number.isFinite(wantedAt) ||
    from.id === to.id
  )
    return null;
  const route = ride.route || (await readRoute(env, [ride.from, ride.to]));
  if (!route) return { unavailable: true };
  if (route.unreachable) return null;
  const origin = projectOnRoute(from, route.coordinates),
    destination = projectOnRoute(to, route.coordinates);
  // Ordered projections follow the actual polyline, including bends; no city-centre bearing shortcut.
  if (
    !origin ||
    !destination ||
    origin.along + 20 >= destination.along ||
    origin.distance > walkMinutes * 120 ||
    destination.distance > walkMinutes * 120
  )
    return null;
  async function candidates(point, projection, exit) {
    const projected = {
      lat: projection.lat,
      lng: projection.lng,
      name: exit ? "Predloženi izlazak" : "Predloženi susret",
      detail:
        "Pin uz trasu; zajedno potvrdite pješački prilaz i gdje se može stati.",
    };
    projected.id = pinId(projected);
    const samples = [];
    let traversed = 0,
      next = 0;
    for (let i = 1; i < route.coordinates.length; i++) {
      const a = route.coordinates[i - 1],
        b = route.coordinates[i],
        length = distance({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
      while (next <= traversed + length) {
        const f = length ? (next - traversed) / length : 0;
        const p = {
          lng: a[0] + f * (b[0] - a[0]),
          lat: a[1] + f * (b[1] - a[1]),
          name: projected.name,
          detail: projected.detail,
        };
        p.id = pinId(p);
        if (distance(p, point) <= walkMinutes * 120) samples.push(p);
        next += 200;
      }
      traversed += length;
    }
    const options = [
      ...(projection.distance <= 10 ? [point] : []),
      projected,
      ...samples,
      ...places,
    ]
      .map((p) => ({
        point: p,
        projection: projectOnRoute(p, route.coordinates),
      }))
      .filter(
        (c) =>
          c.projection &&
          c.projection.distance <= 500 &&
          distance(point, c.point) <= walkMinutes * 120,
      )
      .sort((a, b) => distance(point, a.point) - distance(point, b.point));
    const seen = new Set(),
      accepted = [];
    const attempted = [];
    for (const candidate of options) {
      if (seen.has(pinId(candidate.point))) continue;
      seen.add(pinId(candidate.point));
      if (attempted.some((p) => distance(p, candidate.point) < 100)) continue;
      attempted.push(candidate.point);
      if (attempted.length > 16) break;
      const foot = await readRoute(
        env,
        exit ? [candidate.point, point] : [point, candidate.point],
        "foot",
      );
      if (!foot) return accepted.length ? accepted : { unavailable: true };
      if (foot.unreachable) continue;
      if (foot.duration <= walkMinutes * 60)
        accepted.push({ ...candidate, foot });
      if (accepted.length === 2) break;
    }
    return accepted;
  }
  const starts = await candidates(from, origin, false);
  if (starts.unavailable) return starts;
  if (!starts.length) return null;
  const ends = await candidates(to, destination, true);
  if (ends.unavailable) return ends;
  for (const start of starts)
    for (const end of ends) {
      if (start.projection.along + 20 >= end.projection.along) continue;
      const via = await readRoute(env, [
        ride.from,
        start.point,
        end.point,
        ride.to,
      ]);
      if (!via) return { unavailable: true };
      if (via.unreachable) continue;
      const extra = Math.max(0, via.duration - route.duration),
        pickupAt = ride.departure + via.legs[0].duration * 1000;
      if (
        extra > 600 ||
        extra > Math.max(180, route.duration * 0.5) ||
        Math.abs(pickupAt - wantedAt) > 3600000 ||
        pickupAt < Date.now() + start.foot.duration * 1000
      )
        continue;
      return {
        pickup: start.point,
        dropoff: end.point,
        pickupAt,
        extraMinutes: Math.ceil(extra / 60),
        rideMinutes: Math.ceil(via.legs[1].duration / 60),
        walkToMinutes: Math.ceil(start.foot.duration / 60),
        walkFromMinutes: Math.ceil(end.foot.duration / 60),
        walkToMeters: Math.ceil(start.foot.distance),
        walkFromMeters: Math.ceil(end.foot.distance),
        walkingLimit: walkMinutes,
        corridorMeters: 500,
        source: "osrm-corridor",
        provider: route.provider || "osrm",
        geometry: thin(via.coordinates),

        score:
          Math.abs(pickupAt - wantedAt) / 60000 +
          extra / 30 +
          (start.foot.duration + end.foot.duration) / 60,
      };
    }
  return null;
}
