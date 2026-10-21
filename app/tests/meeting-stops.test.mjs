import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { adaptSqlite } from "../server/db.mjs";
import {
  previewMeetingRoute,
  consumeMeetingPreview,
  matchMeetingStops,
  proposeMeetingStops,
} from "../server/meeting-stops.mjs";
const point = (name, lng) => ({
  name,
  city: "Test City",
  detail: "Public meeting point",
  lat: 0,
  lng,
});
test("initial driver route offers one unnamed meeting point between the two route endpoints", () => {
  const from = point("Start", 0),
    to = point("Finish", 0.03);
  const stops = proposeMeetingStops(
    {
      coordinates: [
        [0, 0],
        [0.03, 0],
      ],
    },
    from,
    to,
  );
  assert.equal(stops.length, 3);
  assert.equal(stops[0].name, "Start");
  assert.equal(stops[1].name, "");
  assert.ok(stops[1].lng > from.lng && stops[1].lng < to.lng);
  assert.equal(stops[2].name, "Finish");
});
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  sqlite.exec(
    "INSERT INTO users(id,name,email,created_at) VALUES('driver','Driver','driver@test.invalid',0)",
  );
  const env = {
    DB: adaptSqlite(sqlite),
    OSRM_URL: "https://routing.test/",
    OSRM_FOOT_URL: "https://foot.test/",
  };
  env.ROUTING_FETCH = async (input) => {
    const u = new URL(input),
      coords = u.pathname
        .split("/")
        .at(-1)
        .split(";")
        .map((s) => s.split(",").map(Number));
    const legs = coords.slice(1).map((p, i) => ({
      distance: Math.abs(p[0] - coords[i][0]) * 100000,
      duration: Math.abs(p[0] - coords[i][0]) * 10000,
    }));
    return Response.json({
      code: "Ok",
      waypoints: coords.map((location) => ({ location, distance: 0 })),
      routes: [
        {
          distance: legs.reduce((n, l) => n + l.distance, 0),
          duration: legs.reduce((n, l) => n + l.duration, 0),
          legs,
          geometry: { type: "LineString", coordinates: coords },
        },
      ],
    });
  };
  return { sqlite, env };
}
test("confirmed driver preview is owner-bound, expires and cannot publish edited points", async () => {
  const { sqlite, env } = fixture();
  const from = point("Start", 0),
    to = point("End", 0.03),
    stops = [point("Parking A", 0.005), point("Parking B", 0.025)];
  const preview = await previewMeetingRoute(env, "driver", from, to, stops);
  assert.equal(preview.meetingStops.length, 2);
  assert.ok(
    preview.meetingStops[1].travelSeconds >
      preview.meetingStops[0].travelSeconds,
  );
  await assert.rejects(() =>
    consumeMeetingPreview(env, "other", preview.previewToken, from, to, stops),
  );
  await assert.rejects(() =>
    consumeMeetingPreview(env, "driver", preview.previewToken, from, to, [
      { ...stops[0], name: "Changed" },
      stops[1],
    ]),
  );
  const accepted = await consumeMeetingPreview(
    env,
    "driver",
    preview.previewToken,
    from,
    to,
    stops,
  );
  assert.equal(accepted.meetingStops[0].name, "Parking A");
  sqlite.prepare("UPDATE meeting_route_previews SET expires=0").run();
  await assert.rejects(() =>
    consumeMeetingPreview(env, "driver", preview.previewToken, from, to, stops),
  );
  sqlite.close();
});
test("passenger matches only fixed named stops; no private address insertion or extra driving request", async () => {
  const { sqlite, env } = fixture();
  const from = point("Driver start", 0),
    to = point("Driver end", 0.03),
    stops = [point("Named pickup", 0.005), point("Named exit", 0.025)];
  const preview = await previewMeetingRoute(env, "driver", from, to, stops);
  let drivingCalls = 0;
  const original = env.ROUTING_FETCH;
  env.ROUTING_FETCH = async (input) => {
    if (String(input).startsWith(env.OSRM_URL)) drivingCalls++;
    return original(input);
  };
  const departure = Date.now() + 3600000;
  const match = await matchMeetingStops(
    env,
    {
      from,
      to,
      route: preview.route,
      meetingStops: preview.meetingStops,
      departure,
    },
    point("Private home", 0.004),
    point("Private workplace", 0.026),
    departure + 50000,
    5,
  );
  assert.equal(match.pickup.name, "Named pickup");
  assert.equal(match.dropoff.name, "Named exit");
  assert.equal(match.extraMinutes, 0);
  assert.equal(drivingCalls, 0);
  assert.ok(!JSON.stringify(match).includes("Private home"));
  assert.equal(
    await matchMeetingStops(
      env,
      {
        from,
        to,
        route: preview.route,
        meetingStops: preview.meetingStops,
        departure,
      },
      point("Private home", 0.004),
      point("Private workplace", 0.026),
      departure + 50000,
      5,
      {
        pickupStopId: preview.meetingStops[1].stopId,
        dropoffStopId: preview.meetingStops[0].stopId,
      },
    ),
    null,
  );
  sqlite.close();
});

test("looping routes consider all published stops before choosing an ordered pair", async () => {
  const { sqlite, env } = fixture();
  const stops = [0.02, 0.021, 0.022, 0.005, 0.025, 0.01, 0.011, 0.012].map(
    (lng, i) => ({
      ...point("Stop " + i, lng),
      stopId: "stop-" + i,
      travelSeconds: i * 30,
    }),
  );
  const departure = Date.now() + 86400000;
  const match = await matchMeetingStops(
    env,
    {
      from: stops[0],
      to: stops.at(-1),
      departure,
      meetingStops: stops,
      route: {
        coordinates: stops.map((p) => [p.lng, p.lat]),
        duration: 300,
        distance: 10000,
      },
    },
    point("Private start", 0.01),
    point("Private end", 0.021),
    departure + 90000,
    5,
  );
  assert.ok(match && !match.unavailable);
  assert.ok(
    stops.findIndex((s) => s.stopId === match.pickup.stopId) <
      stops.findIndex((s) => s.stopId === match.dropoff.stopId),
  );
  sqlite.close();
});
