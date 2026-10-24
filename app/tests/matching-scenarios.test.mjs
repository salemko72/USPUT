// Synthetic city geometries + deterministic pedestrian provider, never live services.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { adaptSqlite } from "../server/db.mjs";
import { corridorMatch } from "../server/corridor.mjs";
const p = (id, x, y = 0) => ({
  id,
  name: id,
  city: "Virtualni grad",
  lng: 18 + x / 80000,
  lat: 44 + y / 111195,
});
const departure = Date.now() + 86400000;
const stops = [p("start", 0), p("A", 1500), p("B", 4500), p("end", 6000)].map(
  (p, i) => ({ ...p, stopId: p.id, travelSeconds: i * 300 }),
);
const base = {
  from: stops[0],
  to: stops.at(-1),
  departure,
  meetingStops: stops,
  route: {
    coordinates: stops.map((p) => [p.lng, p.lat]),
    duration: 900,
    distance: 6000,
  },
};
const cases = [
  {
    name: "segment inside a longer route",
    from: p("passenger", 1500),
    to: p("work", 4500),
    ok: true,
  },
  {
    name: "opposite direction",
    from: p("passenger", 4500),
    to: p("work", 1500),
    ok: false,
  },
  {
    name: "same meeting point cannot be both entry and exit",
    from: p("passenger", 1500, 10),
    to: p("work", 1500, -10),
    ok: false,
  },
  {
    name: "300 metres walking fits five minutes",
    from: p("passenger", 1500, 300),
    to: p("work", 4500),
    ok: true,
  },
  {
    name: "500 metres walking exceeds five minutes",
    from: p("passenger", 1500, 500),
    to: p("work", 4500),
    ok: false,
  },
  {
    name: "500 metres walking fits ten minutes",
    from: p("passenger", 1500, 500),
    to: p("work", 4500),
    walk: 10,
    ok: true,
  },
  {
    name: "remote neighbourhood",
    from: p("passenger", 1500, 2500),
    to: p("work", 4500),
    walk: 15,
    ok: false,
  },
  {
    name: "nearby on map but pedestrian detour across barrier",
    from: p("passenger", 1500, 60),
    to: p("work", 4500),
    factor: 30,
    ok: false,
  },
  {
    name: "no intermediate approved stops, despite overlapping route",
    from: p("passenger", 1500),
    to: p("work", 4500),
    ride: { ...base, meetingStops: [stops[0], stops[3]] },
    ok: false,
  },
  {
    name: "driver at pickup later than requested by 15 minutes",
    from: p("passenger", 1500),
    to: p("work", 4500),
    offset: -900,
    ok: true,
  },
  {
    name: "more than one hour outside requested pickup",
    from: p("passenger", 1500),
    to: p("work", 4500),
    offset: -3601000 / 1000,
    ok: false,
  },
  {
    name: "exact one-hour boundary remains a flexible candidate",
    from: p("passenger", 1500),
    to: p("work", 4500),
    offset: -3600,
    ok: true,
  },
  {
    name: "unavailable pedestrian provider is never a confirmed match",
    from: p("passenger", 1500, 60),
    to: p("work", 4500, 60),
    provider: "offline",
    unavailable: true,
  },
  {
    name: "unreachable pedestrian path",
    from: p("passenger", 1500, 60),
    to: p("work", 4500, 60),
    provider: "unreachable",
    ok: false,
  },
  {
    name: "explicit reversed selected meeting points",
    from: p("passenger", 1500),
    to: p("work", 4500),
    preferred: { pickupStopId: "B", dropoffStopId: "A" },
    ok: false,
  },
  {
    name: "unsupported walking limit",
    from: p("passenger", 1500),
    to: p("work", 4500),
    walk: 20,
    ok: false,
  },
  {
    name: "identical passenger endpoints",
    from: p("same", 1500),
    to: p("same", 1500),
    ok: false,
  },
];
async function run(c) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  const env = {
    DB: adaptSqlite(sqlite),
    OSRM_FOOT_URL: "https://foot.example.test/",
    ROUTING_FETCH: async (input) => {
      if (c.provider === "offline") return new Response("", { status: 503 });
      if (c.provider === "unreachable")
        return Response.json({ code: "NoRoute" });
      const coords = new URL(input).pathname
        .split("/")
        .at(-1)
        .split(";")
        .map((s) => s.split(",").map(Number));
      const [a, b] = coords;
      const distance =
        Math.hypot((a[0] - b[0]) * 80000, (a[1] - b[1]) * 111195) *
        (c.factor || 1);
      return Response.json({
        code: "Ok",
        waypoints: coords.map(() => ({ distance: 0 })),
        routes: [
          {
            distance,
            duration: Math.max(1, distance / 1.2),
            geometry: { coordinates: coords },
            legs: [{ distance, duration: Math.max(1, distance / 1.2) }],
          },
        ],
      });
    },
  };
  try {
    return await corridorMatch(
      env,
      c.ride || base,
      c.from,
      c.to,
      departure + 300000 + (c.offset || 0) * 1000,
      c.walk || 5,
      c.preferred || {},
    );
  } finally {
    sqlite.close();
  }
}
for (const c of cases)
  test("virtual matching: " + c.name, async () => {
    const result = await run(c);
    if (c.unavailable) {
      assert.equal(result?.unavailable, true);
      return;
    }
    assert.equal(!!result && !result.unavailable, c.ok, JSON.stringify(result));
    if (c.ok) {
      assert.ok(result.pickupAt >= departure);
      assert.ok(result.rideMinutes > 0);
      assert.ok(result.walkToMinutes <= (c.walk || 5));
      assert.ok(result.walkFromMinutes <= (c.walk || 5));
      assert.equal(result.extraMinutes, 0);
    }
  });
test("virtual matching: same rules work after rotation into eight city directions", async () => {
  for (let direction = 0; direction < 8; direction++) {
    const angle = (direction * Math.PI) / 4;
    const rotated = stops.map((s, i) => ({
      ...p(s.id, i * 1500 * Math.cos(angle), i * 1500 * Math.sin(angle)),
      stopId: s.stopId,
      travelSeconds: s.travelSeconds,
    }));
    const ride = {
      ...base,
      from: rotated[0],
      to: rotated[3],
      meetingStops: rotated,
      route: { ...base.route, coordinates: rotated.map((p) => [p.lng, p.lat]) },
    };
    assert.ok(await run({ ride, from: rotated[1], to: rotated[2] }));
    assert.equal(await run({ ride, from: rotated[2], to: rotated[1] }), null);
  }
});
test("virtual matching: U-shaped and closed-loop routes use ordered stops, not endpoint bearing", async () => {
  for (const xy of [
    [
      [0, 0],
      [0, 1500],
      [1500, 1500],
      [1500, 0],
    ],
    [
      [0, 0],
      [1500, 0],
      [1500, 1500],
      [0, 0],
    ],
  ]) {
    const bent = xy.map(([x, y], i) => ({
      ...p("b" + i, x, y),
      stopId: "b" + i,
      travelSeconds: i * 300,
    }));
    const ride = {
      ...base,
      from: bent[0],
      to: bent[3],
      meetingStops: bent,
      route: { ...base.route, coordinates: bent.map((p) => [p.lng, p.lat]) },
    };
    const result = await run({ ride, from: bent[1], to: bent[2] });
    assert.ok(result && !result.unavailable);
    assert.equal(result.pickup.stopId, "b1");
    assert.equal(result.dropoff.stopId, "b2");
    assert.equal(await run({ ride, from: bent[2], to: bent[1] }), null);
  }
});
