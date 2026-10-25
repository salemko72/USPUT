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

test("return journey uses a later pass instead of rejecting the passenger direction", () =>
  setup(async (env, ride) => {
    const loop = {
      ...ride,
      to: ride.from,
      route: {
        coordinates: [...ride.route.coordinates, ride.route.coordinates[0]],
        distance: 12000,
        duration: 2400,
      },
    };
    const result = await proposalMatch(
      env,
      loop,
      p("home", 4000),
      p("work", 2000),
      ride.departure + 1600000,
      5,
    );
    assert.ok(result, "a return segment is a valid offer");
    assert.equal(result.pickupAt, ride.departure + 1600000);
    assert.equal(result.rideMinutes, 7);
    assert.deepEqual(result.geometry, loop.route.coordinates);
  }));
test("flexible proposal allows five extra minutes without changing the chosen walking limit", () =>
  setup(async (env, ride) => {
    env.ROUTING_FETCH = async (input) => {
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
            duration: 601,
            distance: 721,
            geometry: { coordinates: coords },
            legs: [{ duration: 601, distance: 721 }],
          },
        ],
      });
    };
    const args = [
      env,
      ride,
      p("home", 1000, 100),
      p("work", 4000, 100),
      ride.departure + 200000,
      10,
    ];
    assert.equal(await proposalMatch(...args), null);
    const result = await proposalMatch(...args, undefined, undefined, {
      flexible: true,
    });
    assert.ok(result);
    assert.equal(result.walkingLimit, 10);
    assert.equal(result.walkToMinutes, 11);
    assert.equal(result.assessment.category, "maybe");
  }));
test("a fitting later pass outranks a closer-time earlier maybe offer", () =>
  setup(async (env, ride) => {
    const loop = {
      ...ride,
      to: ride.from,
      route: {
        coordinates: [...ride.route.coordinates, ride.route.coordinates[0]],
        distance: 12000,
        duration: 2400,
      },
    };
    const result = await proposalMatch(
      env,
      loop,
      p("home", 4000),
      p("work", 2000),
      ride.departure + 801000,
      5,
    );
    assert.ok(result);
    assert.equal(result.assessment.category, "fits");
    assert.equal(result.pickupAt, ride.departure + 1600000);
  }));
test("three repeated visits cannot pair the same along-position as a zero-length ride", () =>
  setup(async (env, ride) => {
    const loop = {
      ...ride,
      route: {
        coordinates: [
          ride.route.coordinates[0],
          ride.route.coordinates[1],
          ride.route.coordinates[0],
          ride.route.coordinates[1],
        ],
        distance: 18000,
        duration: 3600,
      },
    };
    const pin = p("same-meeting", 3000);
    const result = await proposalMatch(
      env,
      loop,
      p("home", 2900),
      p("work", 3100),
      ride.departure + 1800000,
      5,
      pin,
      pin,
    );
    assert.ok(result);
    assert.ok(result.pickup.travelSeconds < result.dropoff.travelSeconds);
    assert.equal(result.rideMinutes, 20);
  }));
