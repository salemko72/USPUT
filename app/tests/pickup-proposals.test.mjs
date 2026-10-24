import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { adaptSqlite } from "../server/db.mjs";
import { proposalMatch } from "../server/pickup-proposals.mjs";
const p = (id, x, y = 0) => ({
  id,
  name: id,
  lng: 18 + x / 80000,
  lat: 44 + y / 111195,
});
async function setup(fn) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  const env = {
    DB: adaptSqlite(sqlite),
    OSRM_FOOT_URL: "https://foot.test/",
    ROUTING_FETCH: async (input) => {
      const coords = new URL(input).pathname
        .split("/")
        .at(-1)
        .split(";")
        .map((s) => s.split(",").map(Number));
      return Response.json({
        code: "Ok",
        waypoints: coords.map(() => ({ distance: 0 })),
        routes: [
          {
            duration: 120,
            distance: 120,
            geometry: { coordinates: coords },
            legs: [{ duration: 120, distance: 120 }],
          },
        ],
      });
    },
  };
  const from = p("start", 0),
    to = p("end", 6000),
    ride = {
      from,
      to,
      departure: Date.now() + 86400000,
      route: {
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
        distance: 6000,
        duration: 1200,
      },
    };
  try {
    await fn(env, ride);
  } finally {
    sqlite.close();
  }
}
test("automatic route projections propose intermediate meeting points without changing the driver geometry", () =>
  setup(async (env, ride) => {
    const result = await proposalMatch(
      env,
      ride,
      p("home", 1000, 100),
      p("work", 4000, 100),
      ride.departure + 200000,
      5,
    );
    assert.ok(result);
    assert.equal(result.meetingProposal, true);
    assert.equal(result.exitOptional, true);
    assert.equal(result.pickup.lat, 44);
    assert.equal(result.fixedMeetingPoints, false);
    assert.deepEqual(result.geometry, ride.route.coordinates);
  }));
test("proposed pickup must remain within 50 metres and before dropoff", () =>
  setup(async (env, ride) => {
    const args = [
      env,
      ride,
      p("home", 1000),
      p("work", 4000),
      ride.departure + 200000,
      5,
    ];
    assert.equal(await proposalMatch(...args, p("pin", 1000, 60)), null);
    assert.equal(await proposalMatch(...args, p("pin", 5000)), null);
    assert.ok(await proposalMatch(...args, p("pin", 1000, 40)));
  }));
test("opposite passenger direction cannot become a valid proposal", () =>
  setup(async (env, ride) => {
    assert.equal(
      await proposalMatch(
        env,
        ride,
        p("home", 4000),
        p("work", 1000),
        ride.departure,
        15,
      ),
      null,
    );
  }));
