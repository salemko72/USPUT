import { projectOnRoute } from "./corridor.mjs";
import { matchMeetingStops } from "./meeting-stops.mjs";
import { readRoute } from "./route-provider.mjs";
// Coordinates are proposals only: the driver still decides where stopping is possible.
export async function proposalMatch(
  env,
  ride,
  from,
  to,
  wantedAt,
  walkMinutes,
  pickup,
  dropoff,
) {
  if (
    !from ||
    !to ||
    ![5, 10, 15].includes(walkMinutes) ||
    !Number.isFinite(wantedAt)
  )
    return null;
  const route = ride.route || (await readRoute(env, [ride.from, ride.to]));
  if (!route) return { unavailable: true };
  if (route.unreachable || !route.coordinates?.length) return null;
  const a = projectOnRoute(pickup || from, route.coordinates),
    b = projectOnRoute(dropoff || to, route.coordinates);
  if (
    !a ||
    !b ||
    a.along + 1 >= b.along ||
    (pickup && a.distance > 50) ||
    (dropoff && b.distance > 50)
  )
    return null;
  const total = route.coordinates.slice(1).reduce((sum, point, index) => {
    const previous = route.coordinates[index];
    return (
      sum +
      Math.hypot(
        (point[0] - previous[0]) *
          111195 *
          Math.cos((from.lat * Math.PI) / 180),
        (point[1] - previous[1]) * 111195,
      )
    );
  }, 0);
  if (!total) return null;
  function estimateTime(along) {
    if (!route.legs?.length) return (along / total) * route.duration;
    const distance = route.legs.reduce((sum, leg) => sum + leg.distance, 0);
    let remaining = (along / total) * distance,
      seconds = 0;
    for (const leg of route.legs) {
      if (remaining <= leg.distance && leg.distance > 0)
        return seconds + (remaining / leg.distance) * leg.duration;
      remaining -= leg.distance;
      seconds += leg.duration;
    }
    return route.duration;
  }
  const make = (point, projection, id) => ({
    ...(point || { lat: projection.lat, lng: projection.lng }),
    id,
    stopId: id,
    name: point?.name || "Predloženo mjesto susreta",
    city: ride.from.city || "",
    automaticName: !point?.name,
    detail: "Prijedlog uz trasu; vozač potvrđuje gdje može stati.",
    travelSeconds: Math.round(estimateTime(projection.along)),
  });
  const stops = [
    make(pickup, a, "proposed-pickup"),
    make(dropoff, b, "proposed-dropoff"),
  ];
  const result = await matchMeetingStops(
    env,
    { ...ride, route, meetingStops: stops },
    from,
    to,
    wantedAt,
    walkMinutes,
  );
  return result && !result.unavailable
    ? {
        ...result,
        fixedMeetingPoints: false,
        meetingProposal: true,
        exitOptional: !dropoff,
      }
    : result;
}
export async function proposalFromSearch(env, ride, q) {
  const { normalizeLocation } = await import("./route-provider.mjs");
  const { getPlace, departureMs } = await import("./places.mjs");
  if (q.date !== ride.date) return null;
  const pickup = q.pickupLocation
    ? normalizeLocation(q.pickupLocation)
    : undefined;
  const dropoff = q.dropoffLocation
    ? normalizeLocation(q.dropoffLocation)
    : undefined;
  if ((q.pickupLocation && !pickup) || (q.dropoffLocation && !dropoff))
    return null;
  const result = await proposalMatch(
    env,
    ride,
    normalizeLocation(q.fromLocation) || getPlace(q.from),
    normalizeLocation(q.toLocation) || getPlace(q.to),
    departureMs(q.date, q.time),
    Number(q.walkMinutes),
    pickup,
    dropoff,
  );
  return result && !result.unavailable && q.meetingPointOnly === "1"
    ? { ...result, pickupWalkUnknown: true }
    : result;
}
