import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { handleApi } from "../server/api.mjs";
import { adaptSqlite } from "../server/db.mjs";
import { cleanupLiveLocations } from "../server/live-location.mjs";
let sqlite, env, clock, originalNow;
beforeEach(() => {
  originalNow = Date.now;
  clock = originalNow();
  Date.now = () => clock;
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  env = { DB: adaptSqlite(sqlite) };
  for (const id of ["driver", "one", "two", "stranger"]) {
    sqlite
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .run(id, id, id + "@test.invalid", clock);
    sqlite
      .prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
      .run(
        createHash("sha256")
          .update("session-" + id)
          .digest("hex"),
        id,
        clock + 86400000,
      );
  }
  sqlite
    .prepare(
      "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,seats,status,created_at) VALUES('ride','driver','cengic','ilidza','2026-10-24','07:30',?,'Car',3,'open',?)",
    )
    .run(clock + 240000, clock);
  for (const [id, user] of [
    ["b1", "one"],
    ["b2", "two"],
  ])
    sqlite
      .prepare(
        "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES(?,'ride',?,'accepted',?)",
      )
      .run(id, user, clock);
});
afterEach(() => {
  sqlite.close();
  Date.now = originalNow;
});
async function call(path, user = "one", body) {
  const r = await handleApi(
    new Request("http://localhost/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
        ...(user ? { Cookie: "usput_session=session-" + user } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
  return { status: r.status, data: await r.json(), headers: r.headers };
}
const enable = async (user = "one", booking = "b1") => {
  const current = await call("/bookings/" + booking + "/location", user);
  return call("/bookings/" + booking + "/location-sharing", user, {
    enabled: true,
    expectedSharingId: current.data.ownSharingId || null,
  });
};
const fix = (token, patch = {}) => ({
  sharingId: token,
  lat: 43.85,
  lng: 18.4,
  accuracy: 12,
  capturedAt: clock,
  ...patch,
});
const upload = (token, user = "one", booking = "b1", patch = {}) =>
  call("/bookings/" + booking + "/location", user, fix(token, patch));
const read = (user = "driver", booking = "b1") =>
  call("/bookings/" + booking + "/location", user);

test("GPS is opt-in, pair-scoped and does not require reciprocal sharing", async () => {
  assert.equal((await upload("none")).status, 409);
  const start = await enable();
  assert.equal(start.status, 200);
  assert.ok(start.data.sharingId);
  assert.equal((await upload(start.data.sharingId)).status, 200);
  const state = await read();
  assert.equal(state.data.ownSharing, false);
  assert.equal(state.data.peerSharing, true);
  assert.equal(state.data.peerLocation.lat, 43.85);
  assert.equal(state.data.ownSharingId, undefined);
  assert.match(state.headers.get("cache-control"), /private, no-store/);
  assert.equal((await read("stranger")).status, 403);
  assert.equal((await read("two")).status, 403);
  assert.equal((await read("one", "b2")).status, 403);
  assert.equal((await read(null)).status, 401);
  assert.equal((await read("driver", "b2")).data.peerLocation, null);
});
test("opens exactly five minutes before agreed pickup, not driver departure", async () => {
  const pickup = clock + 600000;
  sqlite
    .prepare("INSERT INTO booking_routes(booking_id,match_json) VALUES(?,?)")
    .run("b1", JSON.stringify({ pickupAt: pickup }));
  assert.equal((await read()).data.available, false);
  assert.equal((await enable()).status, 409);
  clock = pickup - 300001;
  assert.equal((await enable()).status, 409);
  clock++;
  assert.equal((await enable()).status, 200);
});
test("pending, declined and terminal bookings never expose or accept GPS", async () => {
  const token = (await enable()).data.sharingId;
  await upload(token);
  for (const status of ["pending", "declined", "cancelled", "completed"]) {
    sqlite.prepare("UPDATE bookings SET status=? WHERE id=?").run(status, "b1");
    assert.equal((await read()).data.peerLocation, null);
    assert.equal((await read()).data.available, false);
    assert.equal((await upload(token)).status, 409);
    assert.equal((await enable()).status, 409);
  }
});
test("revocation deletes last fix and a late upload cannot recreate it", async () => {
  const token = (await enable()).data.sharingId;
  await upload(token);
  assert.equal(
    (
      await call("/bookings/b1/location-sharing", "one", {
        enabled: false,
        sharingId: token,
      })
    ).status,
    200,
  );
  assert.equal((await upload(token)).status, 409);
  assert.equal((await read()).data.peerLocation, null);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM location_fixes").get().n,
    0,
  );
});
test("restarting rotates tokens and old cleanup cannot stop the new session", async () => {
  const old = (await enable()).data.sharingId;
  await upload(old);
  const next = (await enable()).data.sharingId;
  assert.notEqual(old, next);
  assert.equal((await read()).data.peerLocation, null);
  assert.equal((await upload(old)).status, 409);
  await call("/bookings/b1/location-sharing", "one", {
    enabled: false,
    sharingId: old,
  });
  assert.equal((await upload(next)).status, 200);
});
test("consent lease expires, stale pins disappear, cleanup retains no history", async () => {
  const token = (await enable()).data.sharingId;
  const capturedAt = clock;
  await upload(token);
  clock += 45000;
  assert.equal((await upload(token, "one", "b1", { capturedAt })).status, 200);
  clock = capturedAt + 90001;
  assert.equal((await read()).data.peerLocation, null);
  await cleanupLiveLocations(env);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM location_fixes").get().n,
    0,
  );
  clock += 20000;
  assert.equal((await read()).data.peerSharing, false);
  assert.equal((await upload(token)).status, 409);
  await cleanupLiveLocations(env);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM location_shares").get().n,
    0,
  );
});
test("invalid, stale and future device fixes are rejected without storing coordinates", async () => {
  const token = (await enable()).data.sharingId;
  for (const patch of [
    { lat: 90 },
    { lng: 181 },
    { accuracy: -1 },
    { accuracy: 50001 },
    { capturedAt: clock - 90001 },
    { capturedAt: clock + 30001 },
    { lat: "43.85" },
    { capturedAt: null },
  ])
    assert.equal(
      (await upload(token, "one", "b1", patch)).status,
      400,
      JSON.stringify(patch),
    );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM location_fixes").get().n,
    0,
  );
});
test("older asynchronous fixes cannot overwrite a newer location", async () => {
  const token = (await enable()).data.sharingId;
  await upload(token);
  clock += 1000;
  await upload(token, "one", "b1", { lat: 43.86 });
  assert.equal(
    (await upload(token, "one", "b1", { lat: 43.84, capturedAt: clock - 500 }))
      .status,
    409,
  );
  assert.equal((await read()).data.peerLocation.lat, 43.86);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM location_fixes").get().n,
    1,
  );
});
test("six-hour failsafe closes an unfinished agreement without extending GPS", async () => {
  const start = await enable();
  const token = start.data.sharingId;
  clock = start.data.endsAt - 1;
  const fresh = (await enable()).data.sharingId;
  await upload(fresh);
  clock++;
  assert.equal((await read()).data.available, false);
  assert.equal((await upload(token)).status, 409);
  await cleanupLiveLocations(env);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM location_fixes").get().n,
    0,
  );
});
test("finishing one passenger deletes only that agreement location, preserving others", async () => {
  const one = (await enable()).data.sharingId,
    two = (await enable("two", "b2")).data.sharingId;
  await upload(one);
  await upload(two, "two", "b2");
  assert.equal((await call("/bookings/b1/complete", "driver", {})).status, 200);
  assert.equal((await read()).data.peerLocation, null);
  assert.equal((await read("driver", "b2")).data.peerLocation.userId, "two");
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) n FROM location_shares WHERE booking_id='b1'")
      .get().n,
    0,
  );
});
test("driver cancellation revokes all participant fixes immediately", async () => {
  const token = (await enable()).data.sharingId;
  await upload(token);
  assert.equal((await call("/rides/ride/cancel", "driver", {})).status, 200);
  assert.equal((await read()).data.peerLocation, null);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM location_fixes").get().n,
    0,
  );
});
test("in-flight upload loses to a concurrent cancellation", async () => {
  const token = (await enable()).data.sharingId;
  let release, arrive;
  const reached = new Promise((r) => (arrive = r)),
    gate = new Promise((r) => (release = r)),
    batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async (statements) => {
    if (statements[0]._sql.startsWith("INSERT INTO location_fixes")) {
      arrive();
      await gate;
    }
    return batch(statements);
  };
  const pending = upload(token);
  await reached;
  await call("/bookings/b1/cancel", "one", {});
  release();
  assert.equal((await pending).status, 409);
  assert.equal((await read()).data.peerLocation, null);
});
test("logout revokes all of that account GPS shares without touching another account", async () => {
  const token = (await enable()).data.sharingId;
  await upload(token);
  const other = (await enable("two", "b2")).data.sharingId;
  await upload(other, "two", "b2");
  assert.equal((await call("/auth/logout", "one", {})).status, 200);
  assert.equal((await read()).data.peerLocation, null);
  assert.equal((await read("driver", "b2")).data.peerLocation.userId, "two");
});

test("a delayed superseded enable cannot rotate the replacement sharing token", async () => {
  const replacement = (await enable()).data.sharingId;
  await upload(replacement);
  const delayed = await call("/bookings/b1/location-sharing", "one", {
    enabled: true,
    expectedSharingId: null,
  });
  assert.equal(delayed.status, 409);
  const current = await read("one");
  assert.equal(current.data.ownSharingId, replacement);
  assert.equal(current.data.ownLocation.lat, 43.85);
});

test("GPS profile preference is explicit, persistent, and opting out revokes all own shares", async () => {
  let r = await call("/auth/me");
  assert.equal(r.data.user.gpsAuto, null);
  r = await call("/profile/location-sharing", "one", { enabled: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.gpsAuto, true);
  assert.equal((await enable("one", "b1")).status, 200);
  r = await call("/profile/location-sharing", "one", { enabled: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.gpsAuto, false);
  assert.equal(
    sqlite
      .prepare("SELECT count(*) n FROM location_shares WHERE user_id='one'")
      .get().n,
    0,
  );
  assert.equal((await call("/auth/me")).data.user.gpsAuto, false);
  assert.equal(
    (await call("/profile/location-sharing", "one", { enabled: "yes" })).status,
    400,
  );
});
test("automatic GPS discovery is scoped to own accepted agreements in the active window", async () => {
  await call("/profile/location-sharing", "one", { enabled: true });
  let r = await call("/location-agreements");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.bookingIds, ["b1"]);
  sqlite.prepare("UPDATE rides SET departure=?").run(clock + 3600000);
  assert.deepEqual((await call("/location-agreements")).data.bookingIds, []);
  sqlite.prepare("UPDATE rides SET departure=?").run(clock + 120000);
  sqlite.prepare("UPDATE bookings SET status='completed' WHERE id='b1'").run();
  assert.deepEqual((await call("/location-agreements")).data.bookingIds, []);
});
test("automatic start requires current saved consent, including after preference changes", async () => {
  assert.equal(
    (
      await call("/bookings/b1/location-sharing", "one", {
        enabled: true,
        automatic: true,
      })
    ).status,
    403,
  );
  await call("/profile/location-sharing", "one", { enabled: true });
  assert.equal(
    (
      await call("/bookings/b1/location-sharing", "one", {
        enabled: true,
        automatic: true,
      })
    ).status,
    200,
  );
  await call("/profile/location-sharing", "one", { enabled: false });
  assert.equal(
    (
      await call("/bookings/b1/location-sharing", "one", {
        enabled: true,
        automatic: true,
      })
    ).status,
    403,
  );
});

test('registration keeps automatic GPS off unless explicitly chosen',async()=>{
 for(const [email,gpsAuto] of [['no@test.invalid',false],['yes@test.invalid',true]]){
  const result=await call('/auth/register',null,{name:'Test Person',city:'Sarajevo',email,password:'long-fixture-password',adult:true,terms:true,...(gpsAuto?{gpsAuto:true}:{})});
  assert.equal(result.status,201);assert.equal(result.data.user.gpsAuto,gpsAuto);
  assert.equal(sqlite.prepare('SELECT gps_auto FROM users WHERE email=?').get(email).gps_auto,gpsAuto?1:0);
 }
});
test('a profile opt-out wins against an already in-flight automatic enable',async()=>{
 await call('/profile/location-sharing','one',{enabled:true});
 const batch=env.DB.batch.bind(env.DB);let release,arrive;
 const gate=new Promise(r=>release=r),reached=new Promise(r=>arrive=r);
 env.DB.batch=async statements=>{
  if(statements[0]._sql.startsWith('INSERT INTO location_shares')){arrive();await gate;}
  return batch(statements);
 };
 const pending=call('/bookings/b1/location-sharing','one',{enabled:true,automatic:true});
 await reached;await call('/profile/location-sharing','one',{enabled:false});release();
 assert.equal((await pending).status,409);assert.equal((await read()).data.ownSharing,false);
});
