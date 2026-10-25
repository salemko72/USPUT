import { test } from "node:test";
import assert from "node:assert/strict";
import { assessMatch } from "../server/match-assessment.mjs";
const wanted = 2000000000000;
for (const [seconds, category] of [
  [-3601, null],
  [-3600, "more"],
  [-1801, "more"],
  [-1800, "maybe"],
  [-1, "maybe"],
  [0, "fits"],
  [900, "fits"],
  [901, "maybe"],
  [1800, "maybe"],
  [1801, "more"],
  [3600, "more"],
  [3601, null],
]) {
  test(`match category at time offset ${seconds}s`, () =>
    assert.equal(
      assessMatch(
        {
          pickupAt: wanted + seconds * 1000,
          walkToSeconds: 300,
          walkFromSeconds: 300,
        },
        wanted,
        10,
      )?.category ?? null,
      category,
    ));
}
for (const [seconds, category] of [
  [600, "fits"],
  [601, "maybe"],
  [900, "maybe"],
  [901, null],
]) {
  test(`match category with ${seconds}s walking against 10min choice`, () =>
    assert.equal(
      assessMatch(
        { pickupAt: wanted, walkToSeconds: seconds, walkFromSeconds: 0 },
        wanted,
        10,
      )?.category ?? null,
      category,
    ));
}
test("both walking ends are checked and original limit stays visible", () => {
  const result = assessMatch(
    { pickupAt: wanted, walkToSeconds: 0, walkFromSeconds: 720 },
    wanted,
    10,
  );
  assert.equal(result.category, "maybe");
  assert.equal(result.walkingLimit, 10);
  assert.equal(result.walkFromMinutes, 12);
  assert.equal(
    assessMatch(
      { pickupAt: wanted, walkToSeconds: 0, walkFromSeconds: 901 },
      wanted,
      10,
    ),
    null,
  );
});
