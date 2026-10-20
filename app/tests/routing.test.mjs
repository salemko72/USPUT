import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRoute, readRoadMatrix } from "../server/routing.mjs";
const points = [
  { id: "a", lat: 0, lng: 0 },
  { id: "p", lat: 0, lng: 0.01 },
  { id: "q", lat: 0, lng: 0.02 },
  { id: "b", lat: 0, lng: 0.03 },
];
const matrix = {
  ids: points.map((p) => p.id),
  durations: [
    [0, 180, 360, 540],
    [180, 0, 180, 360],
    [360, 180, 0, 180],
    [540, 360, 180, 0],
  ],
};
const start = Date.now() + 86400000;
const ride = { from_id: "a", to_id: "b", departure: start };
test("road match detects passenger along longer ride and uses pickup arrival time", () => {
  const m = matchRoute(ride, "p", "q", start + 180000, matrix, points);
  assert.equal(m.pickup.id, "p");
  assert.equal(m.dropoff.id, "q");
  assert.equal(m.pickupAt, start + 180000);
  assert.equal(m.extraMinutes, 0);
  assert.equal(m.source, "osrm");
});
test("road match rejects reverse, excessive detour, unreachable and late pickup", () => {
  assert.equal(matchRoute(ride, "q", "p", start, matrix, points), null);
  const detour = { ...matrix, durations: matrix.durations.map((r) => [...r]) };
  detour.durations[0][1] = 2000;
  assert.equal(matchRoute(ride, "p", "q", start, detour, points), null);
  detour.durations[0][1] = null;
  assert.equal(matchRoute(ride, "p", "q", start, detour, points), null);
  assert.equal(
    matchRoute(ride, "p", "q", start + 7200000, matrix, points),
    null,
  );
});
test("unconfigured routing does not call a third party", async () =>
  assert.equal(await readRoadMatrix({}), null));
