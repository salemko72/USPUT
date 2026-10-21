import { demoDriverForRide } from "./demo-drivers.mjs";
import { previewMeetingRoute } from "./meeting-stops.mjs";
// This only upgrades fictional demo offers without existing participant agreements.
// These approximate labelled pins are not added to the public city catalogue.
export async function ensureDemoMeetingStops(env, row) {
  const driver = demoDriverForRide(row);
  if (!driver || row.meeting_stops_json || row.status !== "open") return row;
  const booked = await env.DB.prepare(
    "SELECT id FROM bookings WHERE ride_id=? AND status IN ('pending','accepted','ready','completed') LIMIT 1",
  )
    .bind(row.id)
    .first();
  if (booked) return row;
  try {
    const preview = await previewMeetingRoute(
      env,
      driver.driverId,
      driver.from,
      driver.to,
      driver.stops,
    );
    const routeJSON = JSON.stringify(preview.route),
      stopsJSON = JSON.stringify(preview.meetingStops);
    await env.DB.prepare(
      // D1 limits LIKE/GLOB patterns to 50 bytes. Check the stable prefix and
      // date separately instead of appending a 42-byte date pattern to it.
      "UPDATE rides SET route_json=?,meeting_stops_json=? WHERE driver_id=? AND id=? || date AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND status='open' AND meeting_stops_json IS NULL AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.ride_id=rides.id AND b.status IN ('pending','accepted','ready','completed'))",
    )
      .bind(
        routeJSON,
        stopsJSON,
        driver.driverId,
        driver.ridePrefix,
      )
      .run();
    // A request can arrive while the provider is working. Read what the guarded
    // UPDATE actually saved, preserving that participant's original agreement.
    const saved = await env.DB.prepare(
      "SELECT route_json,meeting_stops_json FROM rides WHERE id=?",
    )
      .bind(row.id)
      .first();
    if (saved) Object.assign(row, saved);
  } catch {
    /* Provider failures remain explicit in the ordinary search path. */
  }
  return row;
}
