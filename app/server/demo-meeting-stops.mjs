import { places } from "./places.mjs";
import { previewMeetingRoute } from "./meeting-stops.mjs";
const DRIVER = "usput-demo-kerim-v1";
// This only upgrades fictional demo offers without existing participant agreements.
// These approximate labelled pins are not added to the public city catalogue.
export async function ensureDemoMeetingStops(env, row) {
  if (
    row.driver_id !== DRIVER ||
    row.meeting_stops_json ||
    row.status !== "open" ||
    !/^usput-demo-kerim-\d{4}-\d{2}-\d{2}$/.test(row.id)
  )
    return row;
  const booked = await env.DB.prepare(
    "SELECT id FROM bookings WHERE ride_id=? AND status IN ('pending','accepted','ready','completed') LIMIT 1",
  )
    .bind(row.id)
    .first();
  if (booked) return row;
  const from = places.find((p) => p.id === "bascarsija"),
    to = places.find((p) => p.id === "ilidza");
  const stops = ["bascarsija", "marijin", "cengic", "nedzarici", "ilidza"]
    .map((id) => places.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({
      ...p,
      name: "Demo — " + p.name,
      detail:
        "Isključivo testna tačka za izmišljenu vožnju. Nije provjereno mjesto za zaustavljanje.",
    }));
  try {
    const preview = await previewMeetingRoute(env, DRIVER, from, to, stops);
    const routeJSON = JSON.stringify(preview.route),
      stopsJSON = JSON.stringify(preview.meetingStops);
    await env.DB.prepare(
      "UPDATE rides SET route_json=?,meeting_stops_json=? WHERE driver_id=? AND id LIKE 'usput-demo-kerim-%' AND status='open' AND meeting_stops_json IS NULL AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.ride_id=rides.id AND b.status IN ('pending','accepted','ready','completed'))",
    )
      .bind(routeJSON, stopsJSON, DRIVER)
      .run();
    row.route_json = routeJSON;
    row.meeting_stops_json = stopsJSON;
  } catch {
    /* Provider failures remain explicit in the ordinary search path. */
  }
  return row;
}
