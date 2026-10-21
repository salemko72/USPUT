import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { adaptSqlite } from "../server/db.mjs";
import * as catalog from "../server/meeting-catalog.mjs";

let sqlite, env;
const admin = {
  id: "editor",
  email: "Editor@usput.test",
  google_id: "google-editor",
};
const driver = { id: "driver", email: "driver@usput.test" };
const passenger = { id: "passenger", email: "passenger@usput.test" };
const outsider = { id: "outsider", email: "outsider@usput.test" };
const base = {
  name: "Alta",
  city: "Sarajevo",
  lat: 43.855,
  lng: 18.407,
  detail: "Ulaz uz glavnu ulicu",
  approach: "istok",
  side: "sjever",
};

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  const migration = new URL(
    "../server/migrations/0010_meeting_catalog.sql",
    import.meta.url,
  );
  sqlite.exec(readFileSync(migration, "utf8"));
  env = {
    DB: adaptSqlite(sqlite),
    ADMIN_EMAILS: "other@usput.test, editor@usput.test",
  };
  for (const u of [admin, driver, passenger, outsider])
    sqlite
      .prepare(
        "INSERT INTO users(id,name,email,google_id,created_at) VALUES(?,?,?,?,?)",
      )
      .run(u.id, u.id, u.email, u.google_id || null, 1);
});
afterEach(() => sqlite.close());

async function call(
  path,
  body,
  user = admin,
  method = body === undefined ? "GET" : "POST",
) {
  assert.equal(
    typeof catalog.handleMeetingCatalogApi,
    "function",
    "catalogue API must exist",
  );
  const response = await catalog.handleMeetingCatalogApi(
    path,
    method,
    body || {},
    user,
    env,
  );
  assert.ok(response instanceof Response);
  return { status: response.status, data: await response.json() };
}
async function create(patch = {}) {
  const r = await call("/admin/meeting-points", { ...base, ...patch });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.point;
}
async function publicPoints(query = "") {
  return call("/meeting-points?city=Sarajevo" + query, undefined, passenger);
}
function booking(id, pickup, dropoff, status = "completed") {
  const rideId = "ride-" + id;
  sqlite
    .prepare(
      "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      rideId,
      driver.id,
      "start",
      "end",
      "2026-10-20",
      "07:30",
      1,
      "Test",
      status === "completed" ? "completed" : "matched",
      1,
    );
  sqlite
    .prepare(
      "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES(?,?,?,?,?)",
    )
    .run(id, rideId, passenger.id, status, 1);
  const match = JSON.stringify({
    pickup: { ...base, catalogId: pickup },
    dropoff: { ...base, catalogId: dropoff },
  });
  sqlite
    .prepare("INSERT INTO booking_routes(booking_id,match_json) VALUES(?,?)")
    .run(id, match);
  return match;
}

test("editor access requires an exact allowlisted email and Google-linked account; empty denies all", () => {
  assert.equal(
    typeof catalog.isMeetingAdmin,
    "function",
    "Google-linked allowlist guard must exist",
  );
  assert.equal(catalog.isMeetingAdmin(admin, env), true);
  assert.equal(catalog.isMeetingAdmin(admin, { ADMIN_EMAILS: "" }), false);
  assert.equal(
    catalog.isMeetingAdmin({ ...admin, google_id: undefined }, env),
    false,
  );
  assert.equal(
    catalog.isMeetingAdmin({ ...admin, email: "other-editor@usput.test" }, env),
    false,
  );
  assert.equal(catalog.isMeetingAdmin(null, env), false);
});

test("authenticated public search filters city, candidates and unavailable points, including kod Alte alias", async () => {
  const active = await create({
    availability: "active",
    aliases: ["kod Alte"],
  });
  await create({ name: "Candidate" });
  await create({ name: "Unavailable", availability: "inactive" });
  await create({ name: "Alta", city: "Mostar", availability: "active" });
  const result = await publicPoints("&query=kod%20Alte");
  assert.equal(result.status, 200);
  assert.equal(result.data.points.length, 1);
  assert.equal(result.data.points[0].catalogId, active.id);
  assert.equal(result.data.points[0].lat, base.lat);
  assert.ok(result.data.points[0].aliases.includes("kod Alte"));
  assert.equal(result.data.points[0].createdBy, undefined);
  assert.equal(
    (await call("/meeting-points?city=Sarajevo", undefined, null)).status,
    401,
  );
});

test("every administrative endpoint rejects ordinary accounts and unlinked allowlisted email", async () => {
  const point = await create();
  for (const user of [driver, { ...admin, google_id: undefined }]) {
    for (const [path, body] of [
      ["/admin/meeting-points", undefined],
      ["/admin/meeting-points/access", undefined],
      ["/admin/meeting-points", base],
      [`/admin/meeting-points/${point.id}`, { name: "Changed" }],
      [
        `/admin/meeting-points/${point.id}/availability`,
        { availability: "active" },
      ],
      [`/admin/meeting-points/${point.id}/merge`, { targetId: point.id }],
      ["/admin/meeting-points/merges/made-up/undo", {}],
    ])
      assert.equal((await call(path, body, user)).status, 403, path);
  }
  assert.equal(
    (await call("/admin/meeting-points/access", undefined, null)).status,
    401,
  );
});

test("opt-in contributions only reuse a point when distance, name, city and explicit approach plus side agree", async () => {
  const active = await create({
    availability: "active",
    aliases: ["kod Alte"],
  });
  const exact = await catalog.registerMeetingPoint(env, driver, {
    ...base,
    name: "kod Alte",
    lat: base.lat + 0.00004,
  });
  assert.equal(exact.catalogId, active.id);
  const opposite = await catalog.registerMeetingPoint(env, driver, {
    ...base,
    side: "jug",
  });
  const unknown = await catalog.registerMeetingPoint(env, driver, {
    ...base,
    side: "",
  });
  const noApproach = await catalog.registerMeetingPoint(env, driver, {
    ...base,
    approach: "",
  });
  const far = await catalog.registerMeetingPoint(env, driver, {
    ...base,
    lat: base.lat + 0.00025,
  });
  const otherCity = await catalog.registerMeetingPoint(env, driver, {
    ...base,
    city: "Mostar",
  });
  assert.equal(
    new Set([
      active.id,
      opposite.catalogId,
      unknown.catalogId,
      noApproach.catalogId,
      far.catalogId,
      otherCity.catalogId,
    ]).size,
    6,
  );
  const points = (await publicPoints()).data.points;
  assert.equal(points.length, 1);
  assert.equal(
    points[0].lat,
    base.lat,
    "matching must never average pin locations",
  );
  assert.equal(
    (await call("/admin/meeting-points?city=Sarajevo")).data.points.filter(
      (p) => p.availability === "candidate",
    ).length,
    4,
  );
});

test("selected catalogue IDs resolve only for active matching snapshots", async () => {
  const active = await create({ availability: "active" });
  const candidate = await create({ name: "Review" });
  const resolve = (point) => catalog.resolveCatalogMeetingPoint(env, point);
  assert.equal(
    (await resolve({ ...base, catalogId: active.id })).catalogId,
    active.id,
  );
  for (const patch of [
    { lat: base.lat + 0.0001 },
    { city: "Mostar" },
    { side: "jug" },
    { side: "" },
    { approach: "zapad" },
    { approach: "" },
    { catalogId: candidate.id },
  ])
    assert.equal(
      await resolve({ ...base, catalogId: active.id, ...patch }),
      null,
    );
});

test("manual merging rejects opposite roadside, conflicting approach, wrong city and points beyond 40m", async () => {
  const target = await create({ availability: "active" });
  for (const patch of [
    { side: "jug" },
    { approach: "zapad" },
    { city: "Mostar" },
    { lat: base.lat + 0.0005 },
  ]) {
    const source = await create(patch);
    const response = await call(`/admin/meeting-points/${source.id}/merge`, {
      targetId: target.id,
    });
    assert.equal(response.status, 409, JSON.stringify(patch));
  }
});

test("merge preserves source identity and immutable booking snapshots; undo restores separate points and aliases", async () => {
  const target = await create({ availability: "active" });
  const source = await create({
    name: "Alta ulaz",
    side: "",
    approach: "",
    lat: base.lat + 0.0001,
    availability: "active",
    aliases: ["kod Alte"],
  });
  const originalMatch = booking("original", source.id, target.id);
  const response = await call(`/admin/meeting-points/${source.id}/merge`, {
    targetId: target.id,
  });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  const points = (await publicPoints()).data.points;
  assert.equal(points.length, 1);
  assert.equal(points[0].id, target.id);
  assert.ok(points[0].aliases.includes("Alta ulaz"));
  assert.equal(points[0].lat, base.lat);
  assert.equal(
    sqlite
      .prepare(
        "SELECT match_json FROM booking_routes WHERE booking_id='original'",
      )
      .get().match_json,
    originalMatch,
  );
  assert.equal(
    (await call(`/admin/meeting-points/${source.id}`)).data.point.redirectId,
    target.id,
  );
  assert.equal(
    (
      await call(
        `/admin/meeting-points/merges/${response.data.merge.id}/undo`,
        {},
      )
    ).status,
    200,
  );
  const restored = (await publicPoints()).data.points;
  assert.equal(restored.length, 2);
  assert.ok(
    !restored.find((p) => p.id === target.id).aliases.includes("Alta ulaz"),
  );
  assert.equal(restored.find((p) => p.id === source.id).lat, source.lat);
  assert.equal(
    (
      await call(
        `/admin/meeting-points/merges/${response.data.merge.id}/undo`,
        {},
      )
    ).status,
    409,
  );
});

test("catalogue edits preserve earlier names and reject stale editor versions", async () => {
  const point = await create({ availability: "active" });
  const updated = await call(`/admin/meeting-points/${point.id}`, {
    name: "Novi ulaz",
    lat: base.lat + 0.00001,
    version: point.version,
  });
  assert.equal(updated.status, 200);
  assert.ok(updated.data.point.aliases.includes("Alta"));
  assert.equal(
    (
      await call(`/admin/meeting-points/${point.id}`, {
        name: "Stale",
        version: point.version,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`/admin/meeting-points/${point.id}/availability`, {
        availability: "inactive",
      })
    ).status,
    200,
  );
  assert.equal((await publicPoints()).data.points.length, 0);
});

test("feedback rejects unfinished bookings, unrelated users and unreferenced points", async () => {
  const pickup = await create({ availability: "active" });
  const dropoff = await create({
    name: "Drugi",
    lat: base.lat + 0.01,
    availability: "active",
  });
  const unrelated = await create({ name: "Treći", availability: "active" });
  booking("finished", pickup.id, dropoff.id);
  booking("pending", pickup.id, dropoff.id, "accepted");
  for (const [point, body, user, expected] of [
    [pickup.id, { bookingId: "pending", rating: 1 }, passenger, 403],
    [pickup.id, { bookingId: "finished", rating: 1 }, outsider, 403],
    [unrelated.id, { bookingId: "finished", rating: 1 }, passenger, 403],
    [pickup.id, { bookingId: "nonexistent", rating: 1 }, passenger, 403],
    [pickup.id, { bookingId: "finished", rating: 0 }, passenger, 400],
  ])
    assert.equal(
      (await call(`/meeting-points/${point}/feedback`, body, user)).status,
      expected,
    );
});

test("feedback upserts votes and reports distinct participants and completed bookings without exposing notes", async () => {
  const point = await create({ availability: "active" });
  booking("first", point.id, point.id);
  booking("second", point.id, point.id);
  const vote = (bookingId, rating, user = passenger) =>
    call(
      `/meeting-points/${point.id}/feedback`,
      { bookingId, rating, note: "Privatna bilješka" },
      user,
    );
  assert.equal((await vote("first", 1)).status, 200);
  assert.equal((await vote("first", -1)).status, 200);
  assert.equal((await vote("second", -1)).status, 200);
  assert.equal((await vote("first", 1, driver)).status, 200);
  const feedback = (await publicPoints()).data.points[0].feedback;
  assert.equal(feedback.participants, 2);
  assert.equal(feedback.completedBookings, 2);
  assert.equal(feedback.positive, 1);
  assert.equal(feedback.negative, 1);
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM meeting_point_feedback").get()
      .count,
    3,
  );
  assert.equal(
    JSON.stringify((await publicPoints()).data).includes("Privatna bilješka"),
    false,
  );
});

test("feedback keeps its original referenced identity through a merge and undo", async () => {
  const target = await create({ availability: "active" });
  const source = await create({
    name: "Ulaz",
    availability: "active",
    side: "",
    approach: "",
  });
  booking("merged-trip", source.id, source.id);
  const merged = await call(`/admin/meeting-points/${source.id}/merge`, {
    targetId: target.id,
  });
  assert.equal(
    (
      await call(
        `/meeting-points/${target.id}/feedback`,
        { bookingId: "merged-trip", rating: 1 },
        passenger,
      )
    ).status,
    200,
  );
  assert.equal((await publicPoints()).data.points[0].feedback.participants, 1);
  await call(`/admin/meeting-points/merges/${merged.data.merge.id}/undo`, {});
  const points = (await publicPoints()).data.points;
  assert.equal(points.find((p) => p.id === source.id).feedback.participants, 1);
  assert.equal(points.find((p) => p.id === target.id).feedback.participants, 0);
});

test("feedback for a merged booking endpoint prefers the exact referenced identity", async () => {
  const target = await create({ availability: "active" });
  const source = await create({
    name: "Ulaz",
    availability: "active",
    side: "",
    approach: "",
  });
  booking("both-points", source.id, target.id);
  const merged = await call(`/admin/meeting-points/${source.id}/merge`, {
    targetId: target.id,
  });
  assert.equal(
    (
      await call(
        `/meeting-points/${target.id}/feedback`,
        { bookingId: "both-points", rating: 1 },
        passenger,
      )
    ).status,
    200,
  );
  await call(`/admin/meeting-points/merges/${merged.data.merge.id}/undo`, {});
  const points = (await publicPoints()).data.points;
  assert.equal(points.find((p) => p.id === target.id).feedback.participants, 1);
  assert.equal(points.find((p) => p.id === source.id).feedback.participants, 0);
});

test("manual merge rejects stale snapshots supplied by the editor", async () => {
  const source = await create();
  const target = await create({ name: "Drugi ulaz" });
  await call(`/admin/meeting-points/${target.id}`, {
    detail: "Promijenjen prilaz",
  });
  assert.equal(
    (
      await call(`/admin/meeting-points/${source.id}/merge`, {
        targetId: target.id,
        version: source.version,
        targetVersion: target.version,
      })
    ).status,
    409,
  );
});

test("concurrent reverse merges cannot create a redirect cycle", async () => {
  const a = await create();
  const b = await create({ name: "Drugi ulaz" });
  const results = await Promise.all([
    call(`/admin/meeting-points/${a.id}/merge`, { targetId: b.id }),
    call(`/admin/meeting-points/${b.id}/merge`, { targetId: a.id }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const rows = sqlite
    .prepare("SELECT id,redirect_id FROM meeting_points")
    .all();
  assert.equal(rows.filter((p) => p.redirect_id === null).length, 1);
});

test("route suggestions follow the actual polyline across cities and retain separate roadside identities", async () => {
  const coordinates = [
    [18.4, 43.85],
    [18.41, 43.85],
    [18.41, 43.86],
  ];
  const second = await create({
    name: "Drugi",
    city: "Ilidža",
    lat: 43.855,
    lng: 18.4102,
    availability: "active",
  });
  const first = await create({
    name: "Isti naziv",
    lat: 43.8501,
    lng: 18.405,
    availability: "active",
    side: "sjever",
  });
  const opposite = await create({
    name: "Isti naziv",
    lat: 43.8499,
    lng: 18.405,
    availability: "active",
    side: "jug",
  });
  await create({
    name: "Samo unutar okvira",
    lat: 43.855,
    lng: 18.405,
    availability: "active",
  });
  await create({
    name: "Daleki grad",
    city: "Mostar",
    lat: 43.34,
    lng: 17.81,
    availability: "active",
  });
  await create({ name: "Nepregledan kandidat", lat: 43.85, lng: 18.405 });
  await create({
    name: "Nedostupan",
    lat: 43.85,
    lng: 18.405,
    availability: "inactive",
  });
  assert.equal(
    typeof catalog.suggestMeetingPointsForRoute,
    "function",
    "route catalogue suggestions must exist",
  );
  const points = await catalog.suggestMeetingPointsForRoute(env, coordinates);
  assert.equal(points.length, 3);
  assert.deepEqual(
    new Set(points.slice(0, 2).map((p) => p.id)),
    new Set([first.id, opposite.id]),
  );
  assert.equal(points[2].id, second.id);
  assert.ok(
    points.every(
      (p) => Array.isArray(p.aliases) && p.feedback.participants === 0,
    ),
  );
  assert.equal(
    (await catalog.suggestMeetingPointsForRoute(env, coordinates, 1)).length,
    1,
  );
  assert.deepEqual(await catalog.suggestMeetingPointsForRoute(env, []), []);
});
