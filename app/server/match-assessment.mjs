// Server-owned policy shared by discovery, pin previews and requests.
export function assessMatch(match, wantedAt, walkingLimit) {
  if (
    !match ||
    !Number.isFinite(wantedAt) ||
    ![5, 10, 15].includes(walkingLimit)
  )
    return null;
  const timeOffsetSeconds = (match.pickupAt - wantedAt) / 1000;
  const to = match.walkToSeconds ?? (match.walkToMinutes ?? 0) * 60;
  const from = match.walkFromSeconds ?? (match.walkFromMinutes ?? 0) * 60;
  if (
    ![timeOffsetSeconds, to, from].every(Number.isFinite) ||
    to < 0 ||
    from < 0 ||
    Math.abs(timeOffsetSeconds) > 3600 ||
    Math.max(to, from) > (walkingLimit + 5) * 60
  )
    return null;
  const fits =
    timeOffsetSeconds >= 0 &&
    timeOffsetSeconds <= 900 &&
    Math.max(to, from) <= walkingLimit * 60;
  return {
    category: fits
      ? "fits"
      : Math.abs(timeOffsetSeconds) <= 1800
        ? "maybe"
        : "more",
    timeOffsetSeconds,
    walkingLimit,
    walkToMinutes: Math.ceil(to / 60),
    walkFromMinutes: Math.ceil(from / 60),
  };
}
export const categoryOrder = { fits: 0, maybe: 1, more: 2, unverified: 3 };
