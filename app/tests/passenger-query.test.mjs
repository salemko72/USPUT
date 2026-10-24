import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const output = ts.transpileModule(
  readFileSync(new URL("../src/passenger-query.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { preparePassengerQuery, completePassengerQuery, hasPassengerOrigin } =
  await import(
    "data:text/javascript;base64," + Buffer.from(output).toString("base64")
  );
const ride = {
  from: { id: "a", name: "Start", lat: 44, lng: 18 },
  to: { id: "b", name: "End", lat: 44, lng: 18.1 },
  date: "2026-10-25",
  time: "07:30",
};
test("opening an offer with empty source and destination creates a valid map request context", () => {
  const input = { from: "", to: "", date: ride.date, time: ride.time };
  assert.equal(completePassengerQuery(input), false);
  const query = preparePassengerQuery(input, ride);
  assert.equal(completePassengerQuery(query), true);
  assert.equal(query.from, "a");
  assert.equal(query.to, "b");
  assert.equal(query.walkMinutes, "10");
  assert.equal(query.meetingPointOnly, "1");
  assert.deepEqual(JSON.parse(query.fromLocation), ride.from);
  assert.equal(hasPassengerOrigin(input), false);
});
test("opening an offer without a search uses its date and departure", () => {
  const query = preparePassengerQuery(undefined, ride);
  assert.equal(query.date, ride.date);
  assert.equal(query.time, ride.time);
  assert.equal(completePassengerQuery(query), true);
});
test("an existing passenger address and walking choice are preserved", () => {
  const input = {
    from: "home",
    to: "work",
    fromLocation: JSON.stringify({
      id: "home",
      name: "Home",
      lat: 44.01,
      lng: 18,
    }),
    date: ride.date,
    time: "07:40",
    walkMinutes: "5",
  };
  const query = preparePassengerQuery(input, ride);
  assert.equal(query.fromLocation, input.fromLocation);
  assert.equal(query.from, "home");
  assert.equal(query.to, "work");
  assert.equal(query.walkMinutes, "5");
  assert.equal(query.time, "07:40");
});
