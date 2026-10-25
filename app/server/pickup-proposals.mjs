import { routeProjections } from "./route-projections.mjs";
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
  options = {},
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
  const radius = (walkMinutes + (options.flexible === true ? 5 : 0)) * 120;
  const starts = routeProjections(
    pickup || from,
    route.coordinates,
    pickup ? 50 : radius,
  );
  const ends = routeProjections(
    dropoff || to,
    route.coordinates,
    dropoff ? 50 : radius,
  );
  if (!starts.length || !ends.length) return null;
  const total = route.coordinates.slice(1).reduce((sum, point, index) => {
    const previous = route.coordinates[index];
    return (
      sum +
      Math.hypot(
        (point[0] - previous[0]) *
          111195 *
          Math.cos((route.coordinates[0][1] * Math.PI) / 180),
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
  const activeStarts = starts.filter(
    (a) =>
      ends.some((b) => a.along + 1 < b.along) &&
      Math.abs(
        ride.departure + Math.round(estimateTime(a.along)) * 1000 - wantedAt,
      ) <= 3600000,
  );
  const activeEnds = ends.filter((b) =>
    activeStarts.some((a) => a.along + 1 < b.along),
  );
  if (!activeStarts.length || !activeEnds.length) return null;
  // Pedestrian routes are calculated once per candidate, not once per pair of visits.
  const stops = [
    ...activeStarts.map((a, i) => ({
      ...make(pickup, a, `proposed-pickup-${i}`),
      along: a.along,
    })),
    ...activeEnds.map((b, i) => ({
      ...make(dropoff, b, `proposed-dropoff-${i}`),
      along: b.along,
    })),
  ].sort((a, b) => a.along - b.along);
  const result = await matchMeetingStops(
    env,
    { ...ride, route, meetingStops: stops },
    from,
    to,
    wantedAt,
    walkMinutes,
    {},
    {
      ...options,
      routeOrdered: true,
      pickupStopIds: stops
        .filter((p) => p.stopId.startsWith("proposed-pickup-"))
        .map((p) => p.stopId),
      dropoffStopIds: stops
        .filter((p) => p.stopId.startsWith("proposed-dropoff-"))
        .map((p) => p.stopId),
    },
  );
  return result?.unavailable
    ? { ...result, nearby: true }
    : result
      ? {
          ...result,
          fixedMeetingPoints: false,
          meetingProposal: true,
          exitOptional: !dropoff,
        }
      : null;
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
    { flexible: true },
  );
  return result && !result.unavailable && q.meetingPointOnly === "1"
    ? { ...result, pickupWalkUnknown: true }
    : result;
}
