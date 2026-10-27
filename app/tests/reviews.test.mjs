import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { adaptSqlite } from "../server/db.mjs";
import { handleApi } from "../server/api.mjs";
let sql, env, now;
const DAY = 86400000,
  base = Date.parse("2026-10-27T09:00:00Z");
beforeEach(() => {
  now = base;
  mock.method(Date, "now", () => now);
  sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  env = { DB: adaptSqlite(sql) };
  for (const id of ["driver", "passenger", "other", "usput-demo-kerim-v1"]) {
    sql
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .run(id, id, id + "@test.invalid", base);
    sql
      .prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
      .run(createHash("sha256").update(id).digest("hex"), id, base + 90 * DAY);
  }
  sql
    .prepare(
      "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,status,created_at) VALUES('ride','driver','bascarsija','ilidza','2026-10-27','07:30',?,'Car','completed',?)",
    )
    .run(base - 3600000, base - DAY);
  sql.exec(
    "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES('booking','ride','passenger','completed',1)",
  );
});
afterEach(() => {
  mock.restoreAll();
  sql.close();
});
async function call(path, user = "passenger", body) {
  const response = await handleApi(
    new Request("https://test.invalid/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: "usput_session=" + user,
        Origin: "https://test.invalid",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
  return { status: response.status, body: await response.json() };
}
const review = (user, stars) =>
  call("/bookings/booking/review", user, { stars });
const rep = async (id = "driver") =>
  (await call("/users/" + id + "/reputation")).body;
test("one-sided review stays private until counterpart submits, then both role summaries publish", async () => {
  assert.equal((await review("passenger", 5)).status, 201);
  assert.deepEqual((await rep()).driver, { average: null, count: 0 });
  assert.equal((await call("/bookings/booking/review")).body.submittedStars, 5);
  const driverState = (await call("/bookings/booking/review", "driver")).body;
  assert.equal(driverState.submittedStars, null);
  assert.equal(JSON.stringify(driverState).includes('"stars":5'), false);
  assert.equal((await review("driver", 4)).status, 201);
  assert.deepEqual((await rep()).driver, { average: 5, count: 1 });
  assert.deepEqual((await rep("passenger")).passenger, {
    average: 4,
    count: 1,
  });
  assert.deepEqual((await rep("passenger")).driver, {
    average: null,
    count: 0,
  });
});
test("single review releases at 14-day boundary and late submissions are refused", async () => {
  assert.equal((await review("passenger", 2)).status, 201);
  const deadline = (await call("/bookings/booking/review")).body.closesAt;
  now = deadline - 1;
  assert.equal((await rep()).driver.count, 0);
  now = deadline;
  assert.equal((await rep()).driver.average, 2);
  assert.equal((await review("driver", 5)).status, 409);
});
test("only exact participants can submit and cannot forge target or role", async () => {
  assert.equal((await review("other", 5)).status, 403);
  assert.equal((await call("/bookings/booking/review", "other")).status, 403);
  const r = await call("/bookings/booking/review", "passenger", {
    stars: 3,
    targetId: "other",
    role: "passenger",
  });
  assert.equal(r.status, 400);
  assert.equal((await rep("other")).driver.count, 0);
});
test("rejects malformed stars and duplicate review without changing the original", async () => {
  for (const stars of [0, 6, 2.5, "5", null, true])
    assert.equal((await review("passenger", stars)).status, 400);
  const results = await Promise.all([
    review("passenger", 3),
    review("passenger", 5),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await call("/bookings/booking/review")).body.submittedStars, 3);
});
test("unfinished, cancelled, future and fictional rides cannot accumulate reputation", async () => {
  for (const status of [
    "pending",
    "accepted",
    "ready",
    "cancelled",
    "declined",
  ]) {
    sql.prepare("UPDATE bookings SET status=?").run(status);
    assert.equal((await review("passenger", 5)).status, 409);
  }
  sql.exec("UPDATE bookings SET status='completed'");
  sql.prepare("UPDATE rides SET departure=?").run(base + DAY);
  assert.equal((await review("passenger", 5)).status, 409);
  sql
    .prepare(
      "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,status,created_at) SELECT 'usput-demo-kerim-2026-10-27','usput-demo-kerim-v1',from_id,to_id,date,time,?,car,status,created_at FROM rides WHERE id='ride'",
    )
    .run(base - DAY);
  sql.exec("UPDATE bookings SET ride_id='usput-demo-kerim-2026-10-27'");
  assert.equal((await review("passenger", 5)).status, 409);
});
test("different passenger pairs cannot unlock or see each others reviews", async () => {
  sql.exec(
    "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES('booking2','ride','other','completed',1)",
  );
  await review("passenger", 5);
  await call("/bookings/booking2/review", "driver", { stars: 1 });
  assert.equal((await rep()).driver.count, 0);
  assert.equal(
    (await call("/bookings/booking2/review", "passenger")).status,
    403,
  );
  await review("driver", 4);
  assert.equal((await rep()).driver.count, 1);
  assert.equal((await rep("other")).passenger.count, 0);
});
test("server completion timestamp gives delayed completion a fresh review window", async () => {
  sql.exec(
    "UPDATE bookings SET status='accepted';UPDATE rides SET status='matched'",
  );
  now = base + 20 * DAY;
  assert.equal(
    (await call("/bookings/booking/complete", "driver", {})).status,
    200,
  );
  const state = (await call("/bookings/booking/review")).body;
  assert.equal(state.eligible, true);
  assert.equal(state.closesAt, now + 14 * DAY);
});
test("review endpoints require login and public score does not expose individual reviews", async () => {
  assert.equal((await call("/users/driver/reputation", "unknown")).status, 401);
  assert.equal((await call("/users/missing/reputation")).status, 404);
  await review("passenger", 5);
  await review("driver", 4);
  const result = await rep();
  assert.deepEqual(Object.keys(result).sort(), ["driver", "passenger"]);
});
test("cancelling remaining passengers cannot erase completed passenger reviews or block that pair", async () => {
  sql.exec(
    "UPDATE rides SET status='matched';INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES('booking2','ride','other','accepted',1)",
  );
  assert.equal((await review("passenger", 1)).status, 201);
  assert.equal((await review("driver", 5)).status, 201);
  assert.equal((await rep()).driver.average, 1);
  assert.equal((await call("/rides/ride/cancel", "driver", {})).status, 200);
  assert.deepEqual((await rep()).driver, { average: 1, count: 1 });
  assert.equal(
    (await call("/bookings/booking2/review", "other", { stars: 5 })).status,
    409,
  );
});
test("completed passenger may still submit after driver cancels remaining ride", async () => {
  sql.exec(
    "UPDATE rides SET status='matched';INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES('booking2','ride','other','accepted',1)",
  );
  await call("/rides/ride/cancel", "driver", {});
  assert.equal((await review("passenger", 2)).status, 201);
});
