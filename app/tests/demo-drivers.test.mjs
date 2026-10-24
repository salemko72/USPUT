import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { handleApi } from "../server/api.mjs";
import { adaptSqlite } from "../server/db.mjs";
import { ensureDemoMeetingStops } from "../server/demo-meeting-stops.mjs";
import { validateVehicle } from "../server/vehicles.mjs";

let sqlite, env;
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  env = {
    DB: adaptSqlite(sqlite),
    secureCookies: false,
    OPENROUTESERVICE_API_KEY: "fixture-only",
    ROUTING_FETCH: async (_, options) => {
      const points = JSON.parse(options.body).coordinates;
      return Response.json({
        features: [
          {
            geometry: { coordinates: points },
            properties: {
              summary: {
                duration: (points.length - 1) * 200,
                distance: (points.length - 1) * 1000,
              },
              segments: points
                .slice(1)
                .map(() => ({ duration: 200, distance: 1000 })),
              way_points: points.map((_, i) => i),
            },
          },
        ],
      });
    },
  };
  for (const id of [
    "passenger",
    "other",
    "real-driver",
    "usput-demo-kerim-v1",
    "usput-demo-senad-v1",
    "usput-demo-vesna-v1",
  ])
    sqlite
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .run(id, id, id + "@test.invalid", Date.now());
});
afterEach(() => sqlite.close());
async function call(path, user = "passenger", method = "POST") {
  const token = "test-session-" + user;
  if (user)
    sqlite
      .prepare(
        "INSERT OR REPLACE INTO sessions(id,user_id,expires) VALUES(?,?,?)",
      )
      .run(
        createHash("sha256").update(token).digest("hex"),
        user,
        Date.now() + 600000,
      );
  const response = await handleApi(
    new Request("http://localhost:8787/api" + path, {
      method,
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        ...(user ? { Cookie: "usput_session=" + token } : {}),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    }),
    env,
  );
  return { status: response.status, data: await response.json() };
}
function offer(key = "senad", overrides = {}) {
  const date = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  const row = {
    id: `usput-demo-${key}-${date}`,
    driver_id: `usput-demo-${key}-v1`,
    status: "open",
    departure: Date.now() + 86400000 * 2,
    meeting_stops_json: "[]",
    ...overrides,
  };
  sqlite
    .prepare(
      "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,note,status,meeting_stops_json,created_at) VALUES(?,?,'cengic','marijin',?,'07:30',?,'Demo car','DEMO / TEST',?,?,?)",
    )
    .run(
      row.id,
      row.driver_id,
      date,
      row.departure,
      row.status,
      row.meeting_stops_json,
      Date.now(),
    );
  return row;
}
function booking(ride, id = "booking", user = "passenger", status = "pending") {
  sqlite
    .prepare(
      "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES(?,?,?,?,?)",
    )
    .run(id, ride.id, user, status, Date.now());
  return id;
}
test("only seeded driver plus exact demo ride identity is exposed as demo", async () => {
  for (const key of ["kerim", "senad", "vesna"]) {
    const ride = offer(key);
    assert.equal(
      (await call("/rides/" + ride.id, "passenger", "GET")).data.ride.demo,
      true,
    );
  }
  const spoof = offer("senad", {
    id: "regular-ride",
    driver_id: "real-driver",
  });
  assert.equal(
    (await call("/rides/" + spoof.id, "passenger", "GET")).data.ride.demo,
    false,
  );
});
test("owner manually accepts a seeded demo booking through the one-seat transition", async () => {
  const ride = offer(),
    id = booking(ride);
  booking(ride, "competing", "other");
  assert.equal((await call(`/bookings/${id}/simulate-accept`)).status, 200);
  assert.equal(
    sqlite.prepare("SELECT status FROM bookings WHERE id=?").get(id).status,
    "accepted",
  );
  assert.equal(
    sqlite.prepare("SELECT status FROM rides WHERE id=?").get(ride.id).status,
    "matched",
  );
  assert.equal(
    sqlite.prepare("SELECT status FROM bookings WHERE id='competing'").get()
      .status,
    "declined",
  );
  assert.equal((await call(`/bookings/${id}/simulate-accept`)).status, 409);
  assert.equal((await call(`/bookings/${id}/ready`)).status, 200);
  assert.equal((await call(`/bookings/${id}/complete`)).status, 403);
});
test("simulation does not grant access to a real ride, another passenger or ordinary driver accept", async () => {
  const demo = offer(),
    id = booking(demo);
  assert.equal(
    (await call(`/bookings/${id}/simulate-accept`, "other")).status,
    403,
  );
  assert.equal(
    (await call(`/bookings/${id}/simulate-accept`, demo.driver_id)).status,
    403,
  );
  assert.equal(
    (await call(`/bookings/${id}/simulate-accept`, null)).status,
    401,
  );
  assert.equal((await call(`/bookings/${id}/accept`)).status, 403);
  for (const [key, overrides] of [
    ["vesna", { driver_id: "real-driver" }],
    ["kerim", { id: "regular-id" }],
    ["senad", { id: "usput-demo-senad-not-a-date" }],
  ]) {
    const ride = offer(key, overrides),
      b = booking(ride, "b-" + key);
    assert.equal((await call(`/bookings/${b}/simulate-accept`)).status, 403);
    assert.equal(
      sqlite.prepare("SELECT status FROM bookings WHERE id=?").get(b).status,
      "pending",
    );
  }
});
test("manual demo acceptance cannot revive expired, cancelled or occupied offers", async () => {
  for (const [key, overrides] of [
    ["senad", { departure: Date.now() - 1000 }],
    ["vesna", { status: "cancelled" }],
    ["kerim", {}],
  ]) {
    const ride = offer(key, overrides),
      id = booking(ride, "b-" + key);
    if (key === "kerim") booking(ride, "occupied", "other", "accepted");
    assert.equal((await call(`/bookings/${id}/simulate-accept`)).status, 409);
    assert.equal(
      sqlite.prepare("SELECT status FROM bookings WHERE id=?").get(id).status,
      "pending",
    );
  }
});
test("demo route upgrade adds named stops to new drivers without contributing catalogue points", async () => {
  const row = offer("senad", { meeting_stops_json: null });
  await ensureDemoMeetingStops(env, row);
  const saved = sqlite.prepare("SELECT * FROM rides WHERE id=?").get(row.id);
  assert.ok(
    saved.route_json,
    "must calculate the actual provider route, not a straight-line match",
  );
  const stops = JSON.parse(saved.meeting_stops_json);
  assert.ok(stops.length >= 3);
  assert.match(stops[0].name, /Aleja lipa/);
  assert.match(stops.at(-1).name, /Obala Kulina bana/);
  assert.ok(stops.every((s) => s.name.startsWith("Demo — ") && !s.catalogId));
  assert.ok(stops.at(-1).travelSeconds > stops[0].travelSeconds);
  assert.equal(row.meeting_stops_json, saved.meeting_stops_json);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM meeting_points").get().n,
    0,
  );
});
test("route upgrades preserve existing participant agreements and do not invent an update if a booking races", async () => {
  const booked = offer("vesna", { meeting_stops_json: null });
  booking(booked);
  await ensureDemoMeetingStops(env, booked);
  assert.equal(booked.meeting_stops_json, null);
  const racing = offer("kerim", { meeting_stops_json: null });
  const originalFetch = env.ROUTING_FETCH;
  env.ROUTING_FETCH = async (...args) => {
    booking(racing, "racing");
    return originalFetch(...args);
  };
  await ensureDemoMeetingStops(env, racing);
  assert.equal(
    sqlite
      .prepare("SELECT meeting_stops_json FROM rides WHERE id=?")
      .get(racing.id).meeting_stops_json,
    null,
  );
  assert.equal(racing.meeting_stops_json, null);
});

async function seed() {
  const file = new URL("../scripts/seed-demo-drivers.mjs", import.meta.url);
  assert.ok(
    existsSync(file),
    "the reproducible Senad/Vesna seed generator must exist",
  );
  const { buildDemoSeed } = await import(file.href);
  return buildDemoSeed({ today: "2026-10-21", now: 1792576800000 });
}
test("seed supplies one year of daily Sarajevo 07:30 offers with correct street pins and vehicles", async () => {
  const { statements } = await seed();
  // Fixture accounts above intentionally use the same identities. Seed must be
  // safe to rerun against already present synthetic users.
  sqlite.exec(statements.join("\n"));
  for (const key of ["senad", "vesna"]) {
    const offers = sqlite
      .prepare("SELECT * FROM rides WHERE driver_id=? ORDER BY date")
      .all(`usput-demo-${key}-v1`);
    assert.equal(offers.length, 365);
    assert.equal(offers[0].date, "2026-10-22");
    assert.equal(offers.at(-1).date, "2027-10-21");
    assert.ok(
      offers.every((r) => r.time === "07:30" && r.note.includes("DEMO / TEST")),
    );
    assert.ok(
      offers.every(
        (r) =>
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Sarajevo",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(r.departure)) === "07:30",
      ),
    );
    const from = JSON.parse(offers[0].from_json),
      to = JSON.parse(offers[0].to_json);
    assert.equal(from.lat, key === "senad" ? 43.85107 : 43.83469);
    assert.equal(to.name, "Obala Kulina bana, Sarajevo");
    assert.equal(to.lng, 18.42585);
    const vehicle = sqlite
      .prepare("SELECT * FROM vehicles WHERE user_id=?")
      .get(`usput-demo-${key}-v1`);
    assert.equal(vehicle.color, key === "senad" ? "bijela" : "zlatna");
    assert.equal(
      validateVehicle({
        makeId: vehicle.make_id,
        model: vehicle.model,
        color: vehicle.color,
      }).color,
      vehicle.color,
    );
    assert.match(
      offers[0].car,
      key === "senad" ? /Škoda Kamiq · Bijela/ : /MINI Cooper · Zlatna/,
    );
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM meeting_points").get().n,
    0,
  );
});
test("reapplying a seed preserves booked ride snapshots and never creates usable synthetic logins", async () => {
  const { statements } = await seed();
  // Start this check without pre-created synthetic users to validate their auth fields.
  sqlite.exec("DELETE FROM users WHERE id LIKE 'usput-demo-%'");
  sqlite.exec(statements.join("\n"));
  const first = sqlite.prepare("SELECT * FROM rides ORDER BY id LIMIT 1").get();
  booking(first, "saved-agreement", "passenger", "accepted");
  sqlite
    .prepare(
      "UPDATE rides SET status='matched',meeting_stops_json='[\"original agreement\"]' WHERE id=?",
    )
    .run(first.id);
  sqlite.exec(statements.join("\n"));
  const saved = sqlite.prepare("SELECT * FROM rides WHERE id=?").get(first.id);
  assert.equal(saved.status, "matched");
  assert.equal(saved.meeting_stops_json, '["original agreement"]');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM rides").get().n, 730);
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM users WHERE id LIKE 'usput-demo-%' AND (password IS NOT NULL OR salt IS NOT NULL OR google_id IS NOT NULL)",
      )
      .get().n,
    0,
  );
});
test('three additional fictional drivers offer Asima Ferhatovića to Ilidža at 07:30 without accounts usable for login',async()=>{
  const {buildDemoSeed}=await import('../scripts/seed-demo-drivers.mjs');
  const result=buildDemoSeed({today:'2026-10-24',now:Date.now(),keys:['amar','lejla','damir']});
  sqlite.exec(result.statements.join('\n'));
  assert.equal(result.summary.length,3);
  assert.ok(result.summary.every(d=>d.offers===365));
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM rides WHERE time='07:30' AND from_json LIKE '%Asima Ferhatovića%' AND to_id='ilidza'").get().n,1095);
  assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT car) n FROM rides").get().n,3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM users WHERE id IN ('usput-demo-amar-v1','usput-demo-lejla-v1','usput-demo-damir-v1') AND password IS NULL AND google_id IS NULL").get().n,3);
});
