import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { adaptSqlite } from "../server/db.mjs";
import { projectOnRoute, corridorMatch } from "../server/corridor.mjs";
import { normalizeLocation } from "../server/route-provider.mjs";
const point = (id, lng, lat) => ({ id, name: id, detail: id, lng, lat });
test("route corridor recognises Marijin Dvor→Nedžarići and excludes remote Koševo for a westbound city route", () => {
  const road = [
    [18.4314, 43.8598],
    [18.4056, 43.8553],
    [18.373, 43.8507],
    [18.3445, 43.8401],
    [18.3097, 43.8293],
  ];
  const a = projectOnRoute(point("marijin", 18.4056, 43.8553), road),
    b = projectOnRoute(point("nedzarici", 18.3445, 43.8401), road),
    k = projectOnRoute(point("kosevo", 18.407, 43.88), road),
    s = projectOnRoute(point("skenderija", 18.4151, 43.8531), road);
  assert.ok(a.distance < 1 && b.distance < 1 && a.along < b.along);
  assert.ok(k.distance > 1800);
  assert.ok(s.distance < 500);
});
test("ordered route projection handles a bend whose passenger direction opposes the start/end bearing", () => {
  const road = [
    [0, 0],
    [0, 0.02],
    [0.02, 0.02],
    [0.02, 0],
  ];
  const a = projectOnRoute(point("a", 0.02, 0.018), road),
    b = projectOnRoute(point("b", 0.02, 0.005), road);
  assert.ok(a.along < b.along && a.distance < 1 && b.distance < 1);
});
test("walking limit uses foot route time, not only a straight radius; reverse segment rejected", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  const env = {
    DB: adaptSqlite(sqlite),
    OSRM_URL: "https://driving.example.test/",
    OSRM_FOOT_URL: "https://foot.example.test/",
  };
  const road = [
      [0, 0],
      [0.03, 0],
    ],
    ride = {
      from: point("a", 0, 0),
      to: point("b", 0.03, 0),
      departure: Date.now() + 86400000,
      meetingStops: [
        { ...point("pickup", 0.01, 0), stopId: "pickup", travelSeconds: 200 },
        { ...point("exit", 0.02, 0), stopId: "exit", travelSeconds: 400 },
      ],
      route: { coordinates: road, duration: 600, distance: 3335 },
    };
  env.ROUTING_FETCH = async (input) => {
    const url = new URL(input),
      coords = url.pathname
        .split("/")
        .at(-1)
        .split(";")
        .map((c) => c.split(",").map(Number)),
      foot = url.hostname === "foot.example.test";
    return new Response(
      JSON.stringify({
        code: "Ok",
        waypoints: coords.map(() => ({ distance: 0 })),
        routes: [
          {
            duration: foot ? 400 : 600,
            distance: foot ? 500 : 3335,
            geometry: { coordinates: coords },
            legs: coords
              .slice(1)
              .map(() => ({ duration: foot ? 400 : 200, distance: 1000 })),
          },
        ],
      }),
    );
  };
  const start = point("p", 0.01, 0.001),
    end = point("q", 0.02, 0),
    wanted = ride.departure + 200000;
  assert.equal(await corridorMatch(env, ride, start, end, wanted, 5), null);
  const match = await corridorMatch(env, ride, start, end, wanted, 10);
  assert.ok(match && !match.unavailable);
  assert.equal(match.walkToMinutes, 7);
  assert.equal(match.walkingLimit, 10);
  assert.equal(
    await corridorMatch(env, ride, end, start, wanted, 15, {
      pickupStopId: "exit",
      dropoffStopId: "pickup",
    }),
    null,
  );
  sqlite.close();
});
test("confirmed street location validates coordinates and derives its ID instead of trusting client identifier", () => {
  assert.equal(normalizeLocation({ lat: 100, lng: 18, name: "Street" }), null);
  const p = normalizeLocation({
    id: "ilidza",
    lat: 43.85531,
    lng: 18.40562,
    name: "Example Street 10, Sarajevo",
  });
  assert.equal(p.id, "pin_43.85531_18.40562");
  assert.equal(p.name, "Example Street 10, Sarajevo");
});
