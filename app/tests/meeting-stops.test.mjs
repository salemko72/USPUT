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
test("initial driver route has only endpoints, never an automatic middle meeting stop", () => {
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
  assert.equal(stops.length, 2);
  assert.equal(stops[0].name, "Start");
  assert.equal(stops[1].name, "Finish");
});

test("transit controls are signed separately and never offered as meeting stops", async () => {
  const { sqlite, env } = fixture();
  try {
    const from = point("Start", 0),
      to = point("End", 0.03);
    const via = [{ lat: 0, lng: 0.01 }];
    const preview = await previewMeetingRoute(
      env,
      "driver",
      from,
      to,
      [from, to],
      via,
    );
    assert.equal(preview.meetingStops.length, 2);
    assert.deepEqual(preview.route.viaPoints, via);
    assert.ok(preview.route.coordinates.some(([lng]) => lng === 0.01));
    await assert.rejects(() =>
      consumeMeetingPreview(
        env,
        "driver",
        preview.previewToken,
        from,
        to,
        [from, to],
        [],
      ),
    );
    await assert.rejects(() =>
      consumeMeetingPreview(env, "driver", preview.previewToken, from, to, [
        from,
        to,
      ]),
    );
    const bound = await consumeMeetingPreview(
      env,
      "driver",
      preview.previewToken,
      from,
      to,
      [from, to],
      via,
    );
    assert.deepEqual(bound.route.viaPoints, via);
  } finally {
    sqlite.close();
  }
});

test("meeting edits reuse the chosen shape and reject off-route pins or reversed stops", async () => {
  const { sqlite, env } = fixture();
  try {
    const from = point("Start", 0),
      to = point("End", 0.03);
    const via = [{ lat: 0, lng: 0.01 }];
    const base = await previewMeetingRoute(
      env,
      "driver",
      from,
      to,
      [from, to],
      via,
    );
    let calls = 0;
    const fetcher = env.ROUTING_FETCH;
    env.ROUTING_FETCH = (...args) => {
      calls++;
      return fetcher(...args);
    };
    const result = await previewMeetingRoute(
      env,
      "driver",
      from,
      to,
      [from, point("Stop", 0.015), to],
      via,
    );
    assert.deepEqual(result.route.coordinates, base.route.coordinates);
    assert.equal(calls, 0);
    assert.equal(result.meetingStops[1].travelSeconds, 150);
    await assert.rejects(() =>
      previewMeetingRoute(
        env,
        "driver",
        from,
        to,
        [from, { ...point("Far", 0.015), lat: 0.01 }, to],
        via,
      ),
    );
    await assert.rejects(() =>
      previewMeetingRoute(
        env,
        "driver",
        from,
        to,
        [from, point("Later", 0.02), point("Earlier", 0.005), to],
        via,
      ),
    );
    await assert.rejects(() =>
      previewMeetingRoute(
        env,
        "driver",
        from,
        to,
        [from, point("Later", 0.015), point("Just behind", 0.0149), to],
        via,
      ),
    );
    for (const invalid of [
      null,
      {},
      [{ lat: NaN, lng: 1 }],
      Array(9).fill({ lat: 0, lng: 0.01 }),
      [
        { lat: 0, lng: 0.01 },
        { lat: 0, lng: 0.01 },
      ],
    ]) {
      await assert.rejects(() =>
        previewMeetingRoute(env, "driver", from, to, [from, to], invalid),
      );
    }
  } finally {
    sqlite.close();
  }
});

test("ordered meeting places can use a later pass on a looping shaped route", async () => {
  const { sqlite, env } = fixture();
  try {
    const from = point("Start", 0),
      to = point("End", 0.03);
    const result = await previewMeetingRoute(
      env,
      "driver",
      from,
      to,
      [from, point("First", 0.018), point("Later pass", 0.005), to],
      [
        { lat: 0, lng: 0.02 },
        { lat: 0, lng: 0.001 },
      ],
    );
    assert.ok(
      result.meetingStops[2].travelSeconds >
        result.meetingStops[1].travelSeconds,
    );
    assert.ok(result.meetingStops[2].travelSeconds < result.route.duration);
  } finally {
    sqlite.close();
  }
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
test("a valid unnamed meeting pin gets an automatic label and remains preview-bound", async () => {
  const { sqlite, env } = fixture();
  try {
    const from = point("Start", 0),
      to = point("Finish", 0.03),
      pin = point("", 0.015);
    const raw = [from, pin, to];
    const preview = await previewMeetingRoute(env, "driver", from, to, raw);
    assert.equal(preview.meetingStops[1].name, "Mjesto susreta 1");
    assert.equal(preview.meetingStops[1].automaticName, true);
    assert.equal(preview.meetingStops[1].lng, 0.015);
    const consumed = await consumeMeetingPreview(
      env,
      "driver",
      preview.previewToken,
      from,
      to,
      raw,
    );
    assert.equal(consumed.meetingStops[1].name, "Mjesto susreta 1");
  } finally {
    sqlite.close();
  }
});
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
