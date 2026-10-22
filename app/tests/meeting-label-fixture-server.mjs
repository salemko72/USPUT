// Disposable synthetic agreements and Nominatim replies; no production data.
import { createHash } from "node:crypto";
const { env } = await import("../server/local.mjs");
const now = Date.now(),
  departure = now + 86400000 * 2;
const date = new Date(departure).toISOString().slice(0, 10);
const pickup = {
  id: "pin_43.85107_18.38276",
  name: "Demo — Aleja lipa, Sarajevo",
  detail: "Probna tačka.",
  lat: 43.85107,
  lng: 18.38276,
  stopId: "pickup",
};
const middle = {
  id: "pin_43.85118_18.38276",
  name: "Mjesto susreta 1",
  detail: "",
  lat: 43.85118,
  lng: 18.38276,
  stopId: "middle",
  automaticName: true,
};
const dropoff = {
  id: "pin_43.85698_18.42585",
  name: "Demo — Obala Kulina bana, Sarajevo",
  detail: "Probna tačka.",
  lat: 43.85698,
  lng: 18.42585,
  stopId: "dropoff",
};
const from = {
  id: "driver-origin",
  name: "Driver origin street 1, Sarajevo",
  detail: "",
  lat: 43.84,
  lng: 18.37,
};
const to = {
  id: "driver-destination",
  name: "Driver destination street 2, Sarajevo",
  detail: "",
  lat: 43.87,
  lng: 18.44,
};
const match = {
  pickup,
  dropoff,
  pickupAt: departure + 300000,
  extraMinutes: 2,
  rideMinutes: 12,
  source: "osrm",
  provider: "openrouteservice",
  score: 1,
  geometry: [
    [pickup.lng, pickup.lat],
    [dropoff.lng, dropoff.lat],
  ],
};
for (const [id, name] of [
  ["usput-demo-senad-v1", "Senad (demo)"],
  ["label-passenger", "Passenger"],
])
  await env.DB.prepare(
    "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
  )
    .bind(id, name, id + "@example.test", now)
    .run();
await env.DB.prepare(
  "INSERT INTO sessions(id,user_id,expires) VALUES(?,'label-passenger',?)",
)
  .bind(
    createHash("sha256").update("meeting-label-browser-session").digest("hex"),
    now + 3600000,
  )
  .run();
await env.DB.prepare(
  "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,from_json,to_json,meeting_stops_json,created_at) VALUES(?,'usput-demo-senad-v1','cengic','marijin',?,'07:30',?,'Škoda Kamiq',?,?,?,?)",
)
  .bind(
    "usput-demo-senad-" + date,
    date,
    departure,
    JSON.stringify(from),
    JSON.stringify(to),
    JSON.stringify([pickup, middle, dropoff]),
    now,
  )
  .run();
await env.DB.prepare(
  "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES('label-booking',?,'label-passenger','accepted',?)",
)
  .bind("usput-demo-senad-" + date, now)
  .run();
await env.DB.prepare(
  "INSERT INTO booking_routes(booking_id,match_json) VALUES('label-booking',?)",
)
  .bind(JSON.stringify(match))
  .run();
env.GEOCODER_URL = "https://geocoder.example.test/";
env.ROUTING_FETCH = async (input) => {
  const url = new URL(input);
  if (!url.pathname.endsWith("/reverse"))
    throw Error("Only synthetic reverse lookups are expected");
  const lat = url.searchParams.get("lat");
  const road =
    lat === "43.85107"
      ? "Алеја липа"
      : lat === "43.85118"
        ? "Друга улица"
        : "Обала Кулина бана";
  return Response.json({
    lat: "43.9",
    lon: "18.5",
    address: { road, city: "Сарајево", house_number: "99" },
  });
};
