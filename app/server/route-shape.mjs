import { readRoute } from "./route-provider.mjs";

export function normalizeRouteViaPoints(raw) {
  if (!Array.isArray(raw) || raw.length > 8)
    throw new TypeError("Odaberi najviše 8 prolaznih tačaka.");
  const points = raw.map((p) => {
    if (
      !p ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      Math.abs(p.lat) > 85 ||
      Math.abs(p.lng) > 180
    )
      throw new TypeError("Prolazna tačka treba ispravan pin.");
    return {
      lat: Math.round(p.lat * 1e5) / 1e5,
      lng: Math.round(p.lng * 1e5) / 1e5,
    };
  });
  if (new Set(points.map((p) => `${p.lat},${p.lng}`)).size !== points.length)
    throw new TypeError("Prolazne tačke trebaju imati različite pinove.");
  return points;
}

export async function readDriverRoute(env, from, to, rawVia = []) {
  const viaPoints = normalizeRouteViaPoints(rawVia);
  if (
    viaPoints.some((p) =>
      [from, to].some((q) => p.lat === q.lat && p.lng === q.lng),
    )
  )
    throw new TypeError(
      "Prolazna tačka treba biti između polazišta i odredišta.",
    );
  const route = await readRoute(env, [from, ...viaPoints, to]);
  if (
    !route ||
    route.unreachable ||
    !route.legs?.length ||
    route.legs.some((leg) => !Number.isFinite(leg.distance) || leg.distance < 0)
  )
    throw new Error(
      "Cestovni proračun trenutno nije dostupan. Rutu još nije moguće potvrditi.",
    );
  return { ...route, viaPoints };
}

// Project onto the confirmed geometry, in travel order. Intermediate meeting
// pins never request another driving route or become transit controls.
export function stopsOnShape(route, stops, from, to) {
  const coordinates = route.coordinates;
  const scale = Math.cos((from.lat * Math.PI) / 180) * 111195;
  const segments = [];
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1],
      b = coordinates[i];
    const dx = (b[0] - a[0]) * scale,
      dy = (b[1] - a[1]) * 111195;
    const length = Math.hypot(dx, dy);
    if (length) segments.push({ a, dx, dy, length, start: total });
    total += length;
  }
  const same = (a, b) =>
    Math.hypot((a.lng - b.lng) * scale, (a.lat - b.lat) * 111195) < 1;
  if (!same(stops[0], from) || !same(stops.at(-1), to) || !total)
    throw new TypeError("Potvrdi polazište i završnu tačku odabrane trase.");
  const legDistance = route.legs.reduce((n, leg) => n + leg.distance, 0);
  const estimateTime = (along) => {
    let remaining = total ? (along / total) * legDistance : 0,
      seconds = 0;
    for (const leg of route.legs) {
      if (remaining <= leg.distance && leg.distance > 0)
        return seconds + (leg.duration * remaining) / leg.distance;
      remaining -= leg.distance;
      seconds += leg.duration;
    }
    return route.duration;
  };
  let previous = -1;
  return stops.map((stop, index) => {
    let along;
    if (index === 0) along = 0;
    else if (index === stops.length - 1) along = total;
    else {
      let best,
        nearest = Infinity;
      for (const segment of segments) {
        const x = (stop.lng - segment.a[0]) * scale,
          y = (stop.lat - segment.a[1]) * 111195;
        const ratio = Math.max(
          0,
          Math.min(1, (x * segment.dx + y * segment.dy) / segment.length ** 2),
        );
        const distance = Math.hypot(
          x - ratio * segment.dx,
          y - ratio * segment.dy,
        );
        const position = segment.start + ratio * segment.length;
        nearest = Math.min(nearest, distance);
        if (position > previous + 1 && (!best || distance < best.distance))
          best = { distance, along: position };
      }
      if (nearest > 50)
        throw new TypeError(
          "Mjesto susreta nije uz odabranu trasu. Pomjeri pin bliže trasi ili prvo promijeni trasu.",
        );
      if (!best || best.distance > nearest + 2)
        throw new TypeError("Poredaj mjesta susreta u smjeru odabrane trase.");
      along = best.along;
    }
    if (along <= previous || (index < stops.length - 1 && along >= total))
      throw new TypeError("Poredaj mjesta susreta u smjeru odabrane trase.");
    previous = along;
    return {
      ...stop,
      travelSeconds:
        index === 0
          ? 0
          : index === stops.length - 1
            ? route.duration
            : Math.round(estimateTime(along)),
    };
  });
}
