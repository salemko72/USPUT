import type { Ride, Search } from "./types";
export function hasPassengerOrigin(query?: Partial<Search>) {
  return !!(query?.from?.trim() || query?.fromLocation);
}
export function hasPassengerDestination(query?: Partial<Search>) {
  return !!(query?.to?.trim() || query?.toLocation);
}
export function completePassengerQuery(query?: Search) {
  return !!(
    hasPassengerOrigin(query) &&
    hasPassengerDestination(query) &&
    query?.date &&
    query?.time &&
    ["5", "10", "15"].includes(query?.walkMinutes || "")
  );
}
export function preparePassengerQuery(
  query: Partial<Search> | undefined,
  ride: Ride,
): Search {
  return {
    ...query,
    ...(!hasPassengerOrigin(query) ? { meetingPointOnly: "1" } : {}),
    ...(!hasPassengerOrigin(query)
      ? { from: ride.from.id, fromLocation: JSON.stringify(ride.from) }
      : {}),
    ...(!hasPassengerDestination(query)
      ? { to: ride.to.id, toLocation: JSON.stringify(ride.to) }
      : {}),
    from: query?.from?.trim() || ride.from.id,
    to: query?.to?.trim() || ride.to.id,
    date: query?.date || ride.date,
    time: query?.time || ride.time,
    walkMinutes: ["5", "10", "15"].includes(query?.walkMinutes || "")
      ? query!.walkMinutes
      : "10",
    meetingProposal: "1",
  };
}
