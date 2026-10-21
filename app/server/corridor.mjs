import { matchMeetingStops } from "./meeting-stops.mjs";
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
export const corridorMatch = matchMeetingStops;
