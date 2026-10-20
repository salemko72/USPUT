import { test } from "node:test";
import assert from "node:assert/strict";
import { departureMs } from "../server/places.mjs";
test("Sarajevo departure resolves winter and summer offsets", () => {
  assert.equal(
    new Date(departureMs("2026-12-01", "07:30")).toISOString(),
    "2026-12-01T06:30:00.000Z",
  );
  assert.equal(
    new Date(departureMs("2026-07-01", "07:30")).toISOString(),
    "2026-07-01T05:30:00.000Z",
  );
});
test("nonexistent DST time and invalid calendar date are rejected", () => {
  assert.ok(Number.isNaN(departureMs("2026-03-29", "02:30")));
  assert.ok(Number.isNaN(departureMs("2026-02-30", "07:30")));
});
