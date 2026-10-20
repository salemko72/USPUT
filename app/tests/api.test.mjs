import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleApi } from "../server/api.mjs";
import { adaptSqlite } from "../server/db.mjs";
let sqlite, env;
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  env = { DB: adaptSqlite(sqlite), secureCookies: false };
});
afterEach(() => sqlite.close());
async function call(
  path,
  body,
  cookie = "",
  method = body ? "POST" : "GET",
  origin = "http://localhost:8787",
) {
  const r = await handleApi(
    new Request("http://localhost:8787/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function signup(name = "Lejla", email = "lejla@example.test") {
  return call("/auth/register", {
    name,
    email,
    password: "sigurna-lozinka-123",
    city: "Sarajevo",
    adult: true,
    terms: true,
  });
}
function ride() {
  const d = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  return {
    from: "cengic",
    to: "marijin",
    date: d,
    time: "07:30",
    car: "VW Golf · sivi",
    note: "Bez pušenja",
  };
}
test("registration creates a session without exposing password and supports logout", async () => {
  const r = await signup();
  assert.equal(r.status, 201);
  assert.equal(r.data.user.name, "Lejla");
  assert.ok(r.cookie);
  assert.equal(r.data.user.password, undefined);
  assert.equal(
    (await call("/auth/me", null, r.cookie)).data.user.email,
    "lejla@example.test",
  );
  await call("/auth/logout", {}, r.cookie);
  assert.equal((await call("/auth/me", null, r.cookie)).status, 401);
});
test("login rejects wrong password, normalizes email and rejects duplicate registration", async () => {
  await signup();
  assert.equal((await signup("Other", "LEJLA@example.test")).status, 409);
  assert.equal(
    (
      await call("/auth/login", {
        email: "lejla@example.test",
        password: "wrong",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/auth/login", {
        email: " LEJLA@example.test ",
        password: "sigurna-lozinka-123",
      })
    ).status,
    200,
  );
});
test("registration validates adult, terms, email, name and password", async () => {
  for (const patch of [
    { adult: false },
    { terms: false },
    { email: "wrong" },
    { password: "short" },
    { name: "" },
  ]) {
    assert.equal(
      (
        await call("/auth/register", {
          name: "Ana",
          email: "a@example.test",
          password: "sigurna-lozinka-123",
          city: "Sarajevo",
          adult: true,
          terms: true,
          ...patch,
        })
      ).status,
      400,
    );
  }
});
test("state changes reject cross-origin requests and anonymous ride creation", async () => {
  assert.equal((await call("/rides", ride())).status, 401);
  assert.equal(
    (await call("/auth/login", {}, "", "POST", "https://evil.example")).status,
    403,
  );
});
test("driver publishes and passenger requests; only driver can confirm; one seat enforced", async () => {
  const a = await signup("Amar", "amar@example.test"),
    b = await signup(),
    c = await signup("Sara", "sara@example.test");
  const r = await call("/rides", ride(), a.cookie);
  assert.equal(r.status, 201);
  const id = r.data.ride.id;
  const found = await call(
    "/rides?from=cengic&to=marijin&date=" + ride().date + "&time=07:30",
    null,
    b.cookie,
  );
  assert.equal(found.data.rides.length, 1);
  assert.equal(found.data.rides[0].driver.email, undefined);
  assert.equal((await call(`/rides/${id}/request`, {}, a.cookie)).status, 400);
  const request = await call(`/rides/${id}/request`, {}, b.cookie);
  assert.equal(request.status, 201);
  assert.equal((await call(`/rides/${id}/request`, {}, b.cookie)).status, 409);
  const second = await call(`/rides/${id}/request`, {}, c.cookie);
  assert.equal(second.status, 201);
  assert.equal(
    (await call(`/bookings/${request.data.booking.id}/accept`, {}, b.cookie))
      .status,
    403,
  );
  assert.equal(
    (await call(`/bookings/${request.data.booking.id}/accept`, {}, a.cookie))
      .status,
    200,
  );
  assert.equal(
    (await call(`/bookings/${second.data.booking.id}/accept`, {}, a.cookie))
      .status,
    409,
  );
  assert.equal(
    (await call(`/bookings/${request.data.booking.id}/ready`, {}, b.cookie))
      .status,
    200,
  );
  const mine = await call("/my-rides", null, b.cookie);
  assert.equal(mine.data.bookings[0].status, "ready");
  assert.equal(
    (await call(`/bookings/${request.data.booking.id}/cancel`, {}, c.cookie))
      .status,
    403,
  );
  assert.equal(
    (await call(`/bookings/${request.data.booking.id}/complete`, {}, a.cookie))
      .status,
    200,
  );
  assert.equal(
    (await call(`/bookings/${request.data.booking.id}/ready`, {}, b.cookie))
      .status,
    409,
  );
});
test("invalid or past routes rejected; cancellation makes requests unavailable", async () => {
  const a = await signup("Amar", "amar@example.test"),
    b = await signup();
  for (const patch of [
    { to: "cengic" },
    { from: "unknown" },
    { date: "2000-01-01" },
    { time: "99:99" },
    { car: "" },
  ])
    assert.equal(
      (await call("/rides", { ...ride(), ...patch }, a.cookie)).status,
      400,
    );
  const r = await call("/rides", ride(), a.cookie);
  assert.equal(
    (await call(`/rides/${r.data.ride.id}/cancel`, {}, b.cookie)).status,
    403,
  );
  assert.equal(
    (await call(`/rides/${r.data.ride.id}/cancel`, {}, a.cookie)).status,
    200,
  );
  assert.equal(
    (await call(`/rides/${r.data.ride.id}/request`, {}, b.cookie)).status,
    409,
  );
});
test("private details require login; unavailable Google auth returns explicit configuration status", async () => {
  assert.equal((await call("/my-rides")).status, 401);
  const r = await call("/auth/config");
  assert.equal(r.data.google, false);
  assert.equal((await call("/auth/google")).status, 503);
});
test("concurrent SQLite batches each commit without transaction overlap", async () => {
  const results = await Promise.allSettled([
    env.DB.batch([
      env.DB.prepare(
        "INSERT INTO rate_limits(id,count,expires) VALUES('first',1,0)",
      ),
    ]),
    env.DB.batch([
      env.DB.prepare(
        "INSERT INTO rate_limits(id,count,expires) VALUES('second',1,0)",
      ),
    ]),
  ]);
  assert.ok(results.every((r) => r.status === "fulfilled"));
});
async function acceptedBooking() {
  const driver = await signup("Amar", "amar@example.test"),
    passenger = await signup();
  const r = await call("/rides", ride(), driver.cookie);
  const b = await call(
    `/rides/${r.data.ride.id}/request`,
    {},
    passenger.cookie,
  );
  await call(`/bookings/${b.data.booking.id}/accept`, {}, driver.cookie);
  return { driver, passenger, ride: r.data.ride, booking: b.data.booking };
}
function pauseBatch(match) {
  const original = env.DB.batch.bind(env.DB);
  let release, arrive;
  const gate = new Promise((r) => (release = r)),
    reached = new Promise((r) => (arrive = r));
  env.DB.batch = async (stmts) => {
    if (match(stmts)) {
      arrive();
      await gate;
    }
    return original(stmts);
  };
  return { reached, release };
}
test("stale driver cancellation cannot overwrite a completed ride", async () => {
  const { driver, ride: r, booking: b } = await acceptedBooking();
  const gate = pauseBatch((s) =>
    s[0]._sql.includes("rides SET status='cancelled'"),
  );
  const cancel = call(`/rides/${r.id}/cancel`, {}, driver.cookie);
  await gate.reached;
  assert.equal(
    (await call(`/bookings/${b.id}/complete`, {}, driver.cookie)).status,
    200,
  );
  gate.release();
  assert.equal((await cancel).status, 409);
  assert.equal(
    sqlite.prepare("SELECT status FROM rides WHERE id=?").get(r.id).status,
    "completed",
  );
  assert.equal(
    sqlite.prepare("SELECT status FROM bookings WHERE id=?").get(b.id).status,
    "completed",
  );
});
test("stale completion cannot claim success after driver cancellation", async () => {
  const { driver, ride: r, booking: b } = await acceptedBooking();
  const gate = pauseBatch((s) =>
    s[0]._sql.includes("bookings SET status='completed'"),
  );
  const complete = call(`/bookings/${b.id}/complete`, {}, driver.cookie);
  await gate.reached;
  assert.equal(
    (await call(`/rides/${r.id}/cancel`, {}, driver.cookie)).status,
    200,
  );
  gate.release();
  assert.equal((await complete).status, 409);
  assert.equal(
    sqlite.prepare("SELECT status FROM rides WHERE id=?").get(r.id).status,
    "cancelled",
  );
});
test("simultaneous passenger acceptances result in exactly one confirmed seat", async () => {
  const driver = await signup("Amar", "amar@example.test"),
    a = await signup(),
    b = await signup("Sara", "sara@example.test");
  const r = await call("/rides", ride(), driver.cookie);
  const requests = await Promise.all([
    call(`/rides/${r.data.ride.id}/request`, {}, a.cookie),
    call(`/rides/${r.data.ride.id}/request`, {}, b.cookie),
  ]);
  const accepted = await Promise.all(
    requests.map((q) =>
      call(`/bookings/${q.data.booking.id}/accept`, {}, driver.cookie),
    ),
  );
  assert.deepEqual(accepted.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='accepted'")
      .get().n,
    1,
  );
});
test("search filters the time window before limiting results", async () => {
  const driver = await signup("Amar", "amar@example.test"),
    passenger = await signup();
  const d = ride().date;
  const insert = sqlite.prepare(
    "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
  );
  for (let i = 0; i < 65; i++)
    insert.run(
      "early" + i,
      driver.data.user.id,
      "cengic",
      "marijin",
      d,
      "05:00",
      Date.now() + 86400000,
      "VW Golf",
      "",
      Date.now(),
    );
  insert.run(
    "late",
    driver.data.user.id,
    "cengic",
    "marijin",
    d,
    "18:30",
    Date.now() + 90000000,
    "VW Golf",
    "",
    Date.now(),
  );
  const r = await call(
    "/rides?from=cengic&to=marijin&date=" + d + "&time=18:30",
    null,
    passenger.cookie,
  );
  assert.equal(r.data.rides.length, 1);
  assert.equal(r.data.rides[0].id, "late");
});
test("sessions use HttpOnly cookie and expiration is enforced", async () => {
  const r = await handleApi(
    new Request("https://usput.example/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "https://usput.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Lejla",
        email: "lejla@example.test",
        password: "sigurna-lozinka-123",
        city: "Sarajevo",
        adult: true,
        terms: true,
      }),
    }),
    env,
  );
  assert.equal(r.status, 201);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(
    sqlite.prepare("SELECT length(id) AS n FROM sessions").get().n,
    64,
  );
  sqlite.prepare("UPDATE sessions SET expires=0").run();
  assert.equal(
    (await call("/auth/me", null, cookie.split(";")[0])).status,
    401,
  );
});
test("unrelated user cannot see other users booking details", async () => {
  const { driver, passenger, booking } = await acceptedBooking();
  const other = await signup("Other", "other@example.test");
  const mine = await call("/my-rides", null, other.cookie);
  assert.equal(mine.data.bookings.length, 0);
  assert.equal(mine.data.rides.length, 0);
  const participant = await call("/my-rides", null, driver.cookie);
  assert.equal(participant.data.bookings[0].passenger.email, undefined);
  assert.equal(
    (await call(`/bookings/${booking.id}/decline`, {}, other.cookie)).status,
    403,
  );
});
test("invalid JSON and oversized input fail without storing a user", async () => {
  for (const body of ["{", "[]", '"bad"', "x".repeat(17000)]) {
    const r = await handleApi(
      new Request("http://localhost:8787/api/auth/register", {
        method: "POST",
        headers: {
          Origin: "http://localhost:8787",
          "Content-Type": "application/json",
        },
        body,
      }),
      env,
    );
    assert.ok([400, 413].includes(r.status));
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
});
test("Google OAuth validates state and PKCE, requires consent and reuses a Google account", async (t) => {
  env.GOOGLE_CLIENT_ID = "test-client-id";
  env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  let exchanges = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) === "https://oauth2.googleapis.com/token") {
      const f = new URLSearchParams(options.body);
      assert.equal(f.get("client_id"), "test-client-id");
      assert.equal(f.get("client_secret"), "test-client-secret");
      assert.ok(f.get("code_verifier").length >= 43);
      assert.equal(
        f.get("redirect_uri"),
        "http://localhost:8787/api/auth/google/callback",
      );
      exchanges++;
      return new Response(
        JSON.stringify({ access_token: "test-access-token" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    assert.equal(
      String(url),
      "https://openidconnect.googleapis.com/v1/userinfo",
    );
    assert.equal(options.headers.Authorization, "Bearer test-access-token");
    return new Response(
      JSON.stringify({
        sub: "google-subject-123",
        email: "google@example.test",
        email_verified: true,
        name: "Google User",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  async function start() {
    const r = await handleApi(
      new Request("http://localhost:8787/api/auth/google"),
      env,
    );
    assert.equal(r.status, 302);
    const target = new URL(r.headers.get("Location"));
    assert.equal(target.hostname, "accounts.google.com");
    assert.equal(target.searchParams.get("code_challenge_method"), "S256");
    return {
      state: target.searchParams.get("state"),
      cookie: r.headers.get("set-cookie").split(";")[0],
    };
  }
  const a = await start();
  const wrong = await handleApi(
    new Request(
      "http://localhost:8787/api/auth/google/callback?state=wrong&code=abc",
      { headers: { Cookie: a.cookie } },
    ),
    env,
  );
  assert.equal(wrong.status, 400);
  assert.equal(exchanges, 0);
  const r = await handleApi(
    new Request(
      "http://localhost:8787/api/auth/google/callback?state=" +
        a.state +
        "&code=abc",
      { headers: { Cookie: a.cookie } },
    ),
    env,
  );
  assert.equal(r.status, 302);
  assert.match(r.headers.get("Location"), /google=onboard/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
  const enroll = r.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await call(
        "/auth/google/enroll",
        { name: "Google User", adult: false, terms: true },
        enroll,
      )
    ).status,
    400,
  );
  const created = await call(
    "/auth/google/enroll",
    { name: "Google User", city: "Sarajevo", adult: true, terms: true },
    enroll,
  );
  assert.equal(created.status, 201);
  assert.equal(created.data.user.provider, "google");
  assert.equal(
    sqlite.prepare("SELECT password FROM users").get().password,
    null,
  );
  const b = await start();
  const existing = await handleApi(
    new Request(
      "http://localhost:8787/api/auth/google/callback?state=" +
        b.state +
        "&code=abc",
      { headers: { Cookie: b.cookie } },
    ),
    env,
  );
  assert.equal(existing.status, 302);
  assert.match(existing.headers.get("set-cookie"), /usput_session=/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
  assert.equal(exchanges, 2);
  const replay = await handleApi(
    new Request(
      "http://localhost:8787/api/auth/google/callback?state=" +
        b.state +
        "&code=abc",
      { headers: { Cookie: b.cookie } },
    ),
    env,
  );
  assert.equal(replay.status, 400);
});
test("vehicle save validates catalogue, persists on own profile and updates one vehicle", async () => {
  const u = await signup();
  const input = { makeId: "volkswagen", model: "Golf", color: "siva" };
  const r = await call("/vehicle", input, u.cookie);
  assert.equal(r.status, 200);
  assert.equal(r.data.vehicle.make, "Volkswagen");
  assert.equal(r.data.vehicle.model.toLowerCase(), "golf");
  assert.equal(
    (await call("/vehicle", null, u.cookie)).data.vehicle.id,
    r.data.vehicle.id,
  );
  const changed = await call("/vehicle", { ...input, color: "crna" }, u.cookie);
  assert.equal(changed.data.vehicle.id, r.data.vehicle.id);
  assert.equal(changed.data.vehicle.color, "crna");
  const other = await signup("Other", "other@example.test");
  assert.equal((await call("/vehicle", null, other.cookie)).data.vehicle, null);
  assert.equal((await call("/vehicle", input)).status, 401);
});
test("vehicle validation rejects unknown catalogue values and allows explicit manual fallback", async () => {
  const u = await signup();
  for (const patch of [
    { makeId: "not-real" },
    { model: "not-real" },
    { color: "invisible" },
    { model: "" },
  ])
    assert.equal(
      (
        await call(
          "/vehicle",
          { makeId: "volkswagen", model: "Golf", color: "siva", ...patch },
          u.cookie,
        )
      ).status,
      400,
    );
  const r = await call(
    "/vehicle",
    {
      makeId: "other",
      make: "Moja marka",
      model: "Poseban model",
      manualModel: true,
      color: "plava",
    },
    u.cookie,
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.vehicle.make, "Moja marka");
});
test("saved vehicle is owner-authorized when publishing and ride retains its snapshot", async () => {
  const driver = await signup("Amar", "amar@example.test"),
    other = await signup();
  const v = await call(
    "/vehicle",
    { makeId: "volkswagen", model: "Golf", color: "siva" },
    driver.cookie,
  );
  const published = await call(
    "/rides",
    { ...ride(), vehicleId: v.data.vehicle?.id, car: "FORGED" },
    driver.cookie,
  );
  assert.equal(published.status, 201);
  assert.match(published.data.ride.car, /Volkswagen/i);
  assert.equal(
    (
      await call(
        "/rides",
        { ...ride(), vehicleId: v.data.vehicle.id },
        other.cookie,
      )
    ).status,
    403,
  );
  await call(
    "/vehicle",
    { makeId: "volkswagen", model: "Golf", color: "crna" },
    driver.cookie,
  );
  const r = await call("/rides/" + published.data.ride.id, null, other.cookie);
  assert.equal(r.data.ride.car, published.data.ride.car);
});
// Structurally valid WebP header fixture for storage/access tests; browser tests use real encoded images.
function webpFixture(width = 320, height = 320) {
  const data = new Uint8Array(30);
  const view = new DataView(data.buffer);
  data.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 22, true);
  data.set(new TextEncoder().encode("WEBPVP8L"), 8);
  view.setUint32(16, 10, true);
  data[20] = 0x2f;
  view.setUint32(21, ((height - 1) << 14) | (width - 1), true);
  return data;
}
function photoStore() {
  const files = new Map();
  return {
    files,
    async put(key, bytes) {
      files.set(key, new Uint8Array(bytes));
    },
    async get(key) {
      const bytes = files.get(key);
      return bytes ? { body: bytes } : null;
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) files.delete(key);
    },
  };
}
async function upload(
  kind,
  cookie,
  bytes = webpFixture(),
  origin = "http://localhost:8787",
) {
  const r = await handleApi(
    new Request("http://localhost:8787/api/photos/" + kind, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin, "Content-Type": "image/webp" },
      body: bytes,
    }),
    env,
  );
  return { status: r.status, data: await r.json() };
}
async function imageGet(id, cookie = "") {
  return handleApi(
    new Request("http://localhost:8787/api/photos/" + id, {
      headers: { Cookie: cookie },
    }),
    env,
  );
}
test("private photo uploads require login and valid WebP; metadata only stored in SQL", async () => {
  env.PHOTOS = photoStore();
  const u = await signup();
  assert.equal((await upload("avatar", "")).status, 401);
  assert.equal(
    (await upload("avatar", u.cookie, new Uint8Array([1, 2, 3]))).status,
    400,
  );
  assert.equal(
    (await upload("avatar", u.cookie, webpFixture(), "https://evil.test"))
      .status,
    403,
  );
  const r = await upload("avatar", u.cookie);
  assert.equal(r.status, 201);
  assert.equal(r.data.photo.bytes, 30);
  const img = await imageGet(r.data.photo.id, u.cookie);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("Content-Type"), "image/webp");
  assert.match(img.headers.get("Cache-Control"), /no-store/);
  assert.equal(env.PHOTOS.files.size, 1);
  assert.equal((await imageGet(r.data.photo.id)).status, 401);
});
test("photo access starts only after driver acceptance and is revoked on cancellation", async () => {
  env.PHOTOS = photoStore();
  const driver = await signup("Amar", "amar@example.test"),
    passenger = await signup(),
    other = await signup("Other", "other@example.test");
  const photo = await upload("avatar", driver.cookie);
  const r = await call("/rides", ride(), driver.cookie);
  const b = await call(
    `/rides/${r.data.ride.id}/request`,
    {},
    passenger.cookie,
  );
  assert.equal(
    (await imageGet(photo.data.photo.id, passenger.cookie)).status,
    404,
  );
  await call(`/bookings/${b.data.booking.id}/accept`, {}, driver.cookie);
  assert.equal(
    (await imageGet(photo.data.photo.id, passenger.cookie)).status,
    200,
  );
  assert.equal((await imageGet(photo.data.photo.id, other.cookie)).status, 404);
  await call(`/bookings/${b.data.booking.id}/cancel`, {}, passenger.cookie);
  assert.equal(
    (await imageGet(photo.data.photo.id, passenger.cookie)).status,
    404,
  );
});
test("photo replacement and deletion revoke old IDs and clean object storage", async () => {
  env.PHOTOS = photoStore();
  const u = await signup();
  const a = await upload("avatar", u.cookie),
    b = await upload("avatar", u.cookie);
  assert.equal((await imageGet(a.data.photo.id, u.cookie)).status, 404);
  assert.equal(env.PHOTOS.files.size, 1);
  assert.equal(
    (await call("/photos/me", null, u.cookie)).data.avatar.id,
    b.data.photo.id,
  );
  assert.equal((await call("/photos/avatar/remove", {}, u.cookie)).status, 200);
  assert.equal((await imageGet(b.data.photo.id, u.cookie)).status, 404);
  assert.equal(env.PHOTOS.files.size, 0);
});
test("failed storage upload preserves existing active photo", async () => {
  env.PHOTOS = photoStore();
  const u = await signup();
  const a = await upload("avatar", u.cookie);
  env.PHOTOS.put = async () => {
    throw Error("storage unavailable");
  };
  assert.equal((await upload("avatar", u.cookie)).status, 503);
  assert.equal((await imageGet(a.data.photo.id, u.cookie)).status, 200);
});
test("vehicle photo is not shared for a different saved vehicle description", async () => {
  env.PHOTOS = photoStore();
  const driver = await signup("Amar", "amar@example.test"),
    passenger = await signup();
  assert.equal((await upload("vehicle", driver.cookie)).status, 400);
  const v = await call(
    "/vehicle",
    { makeId: "volkswagen", model: "Golf", color: "siva" },
    driver.cookie,
  );
  const p = await upload("vehicle", driver.cookie, webpFixture(800, 600));
  assert.equal(p.status, 201);
  const r = await call(
    "/rides",
    { ...ride(), vehicleId: v.data.vehicle.id },
    driver.cookie,
  );
  const b = await call(
    `/rides/${r.data.ride.id}/request`,
    {},
    passenger.cookie,
  );
  await call(`/bookings/${b.data.booking.id}/accept`, {}, driver.cookie);
  assert.equal((await imageGet(p.data.photo.id, passenger.cookie)).status, 200);
  await call(
    "/vehicle",
    { makeId: "volkswagen", model: "Golf", color: "crna" },
    driver.cookie,
  );
  const next = await upload("vehicle", driver.cookie, webpFixture(800, 600));
  assert.equal(
    (await imageGet(next.data.photo.id, passenger.cookie)).status,
    404,
  );
});
test("removing while upload is in flight prevents later republishing or orphan object", async () => {
  env.PHOTOS = photoStore();
  const u = await signup();
  let release, arrive;
  const gate = new Promise((r) => (release = r)),
    reached = new Promise((r) => (arrive = r));
  const original = env.PHOTOS.put;
  env.PHOTOS.put = async (...args) => {
    arrive();
    await gate;
    return original(...args);
  };
  const pending = upload("avatar", u.cookie);
  await reached;
  assert.equal((await call("/photos/avatar/remove", {}, u.cookie)).status, 200);
  release();
  assert.equal((await pending).status, 409);
  assert.equal((await call("/photos/me", null, u.cookie)).data.avatar, null);
  assert.equal(env.PHOTOS.files.size, 0);
});
test("cleanup claims stale pending upload before deleting so it cannot become active", async () => {
  const { cleanupPhotos } = await import("../server/photos.mjs");
  env.PHOTOS = photoStore();
  const u = await signup();
  let release, arrive;
  const gate = new Promise((r) => (release = r)),
    reached = new Promise((r) => (arrive = r));
  const original = env.PHOTOS.put;
  env.PHOTOS.put = async (...args) => {
    arrive();
    await gate;
    return original(...args);
  };
  const pending = upload("avatar", u.cookie);
  await reached;
  sqlite.prepare("UPDATE photos SET created_at=?").run(Date.now() - 7200000);
  await cleanupPhotos(env);
  release();
  assert.equal((await pending).status, 409);
  assert.equal((await call("/photos/me", null, u.cookie)).data.avatar, null);
  assert.equal(env.PHOTOS.files.size, 0);
});

test("road search finds an intermediate pickup and saves the same agreement for both users", async () => {
  const { places } = await import("../server/places.mjs");
  let requests = 0;
  env.OSRM_URL = "https://routing.example.test/";
  env.ROUTING_FETCH = async () => {
    requests++;
    return new Response(
      JSON.stringify({
        code: "Ok",
        sources: places.map(() => ({ distance: 1 })),
        destinations: places.map(() => ({ distance: 1 })),
        durations: places.map((_, i) =>
          places.map((_, j) => Math.abs(i - j) * 120),
        ),
      }),
    );
  };
  const driver = await signup("Driver", "road-driver@example.test"),
    passenger = await signup();
  const offer = { ...ride(), from: "ilidza", to: "centar" };
  const published = await call("/rides", offer, driver.cookie);
  assert.equal(published.status, 201);
  // Earlier unrelated offers must not truncate away the compatible route.
  for (let i = 0; i < 205; i++)
    sqlite
      .prepare(
        "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,note,created_at) SELECT ?,driver_id,'centar','ilidza',date,'05:00',departure-7200000,car,note,created_at FROM rides WHERE id=?",
      )
      .run("unrelated-" + i, published.data.ride.id);
  const search = {
    from: "otoka",
    to: "marijin",
    date: offer.date,
    time: offer.time,
  };
  const results = await call(
    "/rides?" + new URLSearchParams(search),
    null,
    passenger.cookie,
  );
  assert.equal(results.data.rides.length, 1);
  const match = results.data.rides[0].match;
  assert.equal(match.pickup.id, "otoka");
  assert.equal(match.dropoff.id, "marijin");
  assert.equal(match.extraMinutes, 0);
  const booking = await call(
    "/rides/" + published.data.ride.id + "/request",
    { search },
    passenger.cookie,
  );
  assert.equal(booking.status, 201);
  for (const cookie of [driver.cookie, passenger.cookie]) {
    const mine = await call("/my-rides", null, cookie);
    assert.deepEqual(mine.data.bookings[0].match, match);
  }
  assert.equal(requests, 1, "search and booking reuse the cached road matrix");
});

test("routing failure falls back to exact locations and refuses an unconfirmed intermediate pickup", async () => {
  env.OSRM_URL = "https://routing.example.test/";
  let requests = 0;
  env.ROUTING_FETCH = async () => {
    requests++;
    throw Error("offline");
  };
  const driver = await signup("Driver", "offline-driver@example.test"),
    passenger = await signup();
  const offer = ride(),
    published = await call("/rides", offer, driver.cookie);
  const results = await call(
    "/rides?" + new URLSearchParams(offer),
    null,
    passenger.cookie,
  );
  assert.equal(results.data.rides.length, 1);
  assert.equal(results.data.rides[0].match, undefined);
  const rejected = await call(
    "/rides/" + published.data.ride.id + "/request",
    { search: { ...offer, from: "otoka" } },
    passenger.cookie,
  );
  assert.equal(rejected.status, 409);
  assert.equal(requests, 1, "outage is negatively cached");
});

test("cost-sharing flag defaults to false, persists true and rejects non-booleans", async () => {
  const driver = await signup("Driver", "cost-driver@example.test"),
    passenger = await signup();
  for (const value of [undefined, false, true]) {
    const offer = {
      ...ride(),
      ...(value === undefined ? {} : { costSharing: value }),
    };
    const result = await call("/rides", offer, driver.cookie);
    assert.equal(result.status, 201);
    assert.equal(result.data.ride.costSharing, value === true);
    const detail = await call(
      "/rides/" + result.data.ride.id,
      null,
      passenger.cookie,
    );
    assert.equal(detail.data.ride.costSharing, value === true);
  }
  for (const invalid of ["true", "false", 1, null])
    assert.equal(
      (await call("/rides", { ...ride(), costSharing: invalid }, driver.cookie))
        .status,
      400,
    );
});

test("street coordinates require route confirmation and corridor agreement persists for both participants", async () => {
  env.OPENROUTESERVICE_API_KEY = "fixture-only";
  env.ROUTING_FETCH = async (url, options) => {
    const points = JSON.parse(options.body).coordinates,
      legs = points.slice(1).map(() => ({ duration: 200, distance: 1000 }));
    return new Response(
      JSON.stringify({
        features: [
          {
            geometry: { coordinates: points },
            properties: {
              summary: { duration: 600, distance: 3335 },
              segments: legs,
              way_points: points.map((_, i) => i),
            },
          },
        ],
      }),
    );
  };
  const driver = await signup("Driver", "street-driver@example.test"),
    passenger = await signup();
  const fromLocation = JSON.stringify({
      name: "Example Street 1, Test City",
      lat: 0,
      lng: 0,
    }),
    toLocation = JSON.stringify({
      name: "Example Street 30, Test City",
      lat: 0,
      lng: 0.03,
    });
  const input = { ...ride(), fromLocation, toLocation };
  assert.equal((await call("/rides", input, driver.cookie)).status, 400);
  const preview = await call("/routes/preview", input, driver.cookie);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.route.coordinates.length, 2);
  const published = await call(
    "/rides",
    { ...input, routeConfirmed: true },
    driver.cookie,
  );
  assert.equal(published.status, 201);
  assert.equal(published.data.ride.from.name, "Example Street 1, Test City");
  const search = {
    ...ride(),
    fromLocation: JSON.stringify({
      name: "Street 10, Test City",
      lat: 0,
      lng: 0.01,
    }),
    toLocation: JSON.stringify({
      name: "Street 20, Test City",
      lat: 0,
      lng: 0.02,
    }),
    walkMinutes: "5",
  };
  const results = await call("/rides/search", search, passenger.cookie);
  assert.equal(results.status, 200);
  assert.equal(results.data.rides.length, 1);
  assert.equal(results.data.rides[0].match.source, "osrm-corridor");
  const booked = await call(
    "/rides/" + published.data.ride.id + "/request",
    { search },
    passenger.cookie,
  );
  assert.equal(booked.status, 201);
  delete env.OPENROUTESERVICE_API_KEY;
  for (const cookie of [driver.cookie, passenger.cookie]) {
    const mine = await call("/my-rides", null, cookie);
    assert.equal(mine.data.bookings[0].match.walkingLimit, 5);
    assert.equal(mine.data.bookings[0].match.source, "osrm-corridor");
  }
});

test("explicit geocoding rejects coarse city results and keeps street/number, without exposing credentials", async () => {
  env.GEOCODER_URL = "https://geocoder.example.test/";
  env.ROUTING_FETCH = async () =>
    new Response(
      JSON.stringify([
        { lat: "43.85", lon: "18.4", address: { city: "Sarajevo" } },
        {
          lat: "43.85",
          lon: "18.4",
          display_name: "Example street 10, Sarajevo",
          address: {
            road: "Example street",
            house_number: "10",
            city: "Sarajevo",
            country_code: "ba",
          },
        },
      ]),
    );
  const user = await signup();
  assert.equal(
    (await call("/locations/search", { query: "Street 10 Sarajevo" })).status,
    401,
  );
  const result = await call(
    "/locations/search",
    { query: "Street 10 Sarajevo" },
    user.cookie,
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.locations.length, 1);
  assert.equal(result.data.locations[0].name, "Example street 10, Sarajevo");
  assert.equal(result.data.locations[0].countryCode, "BA");
});

test("corridor outage is explicit, retains a whole-trip exact offer, and does not invent intermediate matches", async () => {
  const driver = await signup("Driver", "outage-corridor@example.test"),
    passenger = await signup();
  const offer = ride();
  await call("/rides", offer, driver.cookie);
  const exact = await call(
    "/rides/search",
    { ...offer, walkMinutes: "5" },
    passenger.cookie,
  );
  assert.equal(exact.data.routingUnavailable, true);
  assert.equal(exact.data.rides.length, 1);
  assert.equal(exact.data.rides[0].match, undefined);
  const intermediate = await call(
    "/rides/search",
    { ...offer, from: "otoka", walkMinutes: "15" },
    passenger.cookie,
  );
  assert.equal(intermediate.data.routingUnavailable, true);
  assert.equal(intermediate.data.rides.length, 0);
});

test("routing health never persists a provider exception containing credentials", async () => {
  env.OPENROUTESERVICE_API_KEY = "fixture-secret";
  env.ROUTING_FETCH = async () => {
    throw Error("Authorization: fixture-secret\ninvalid header");
  };
  const user = await signup();
  const response = await call("/routes/preview", ride(), user.cookie);
  assert.equal(response.status, 503);
  const health = sqlite.prepare("SELECT detail FROM routing_health").all();
  assert.equal(health.length, 1);
  assert.equal(health[0].detail, "UpstreamRequestFailed");
  assert.ok(!JSON.stringify(health).includes("fixture-secret"));
});

test("city-aware street search bounds GPS results, isolates scope caches and rejects invalid coordinates", async () => {
  env.GEOCODER_URL = "https://geocoder.example.test/";
  const seen = [];
  env.ROUTING_FETCH = async (input) => {
    const url = new URL(input);
    seen.push(url);
    if (url.pathname.endsWith("/reverse"))
      return new Response(JSON.stringify({ address: { city: "Sarajevo" } }));
    return new Response(
      JSON.stringify([
        {
          lat: "43.85",
          lon: "18.4",
          address: { road: "Ista ulica", city: "Sarajevo" },
        },
        {
          lat: "45.81",
          lon: "15.97",
          address: { road: "Ista ulica", city: "Zagreb" },
        },
      ]),
    );
  };
  const user = await signup();
  const near = await call(
    "/locations/city",
    { lat: 43.856, lng: 18.413 },
    user.cookie,
  );
  assert.equal(near.status, 200);
  assert.equal(near.data.city, "Sarajevo");
  const result = await call(
    "/locations/search",
    {
      query: "Ista ulica",
      scope: { city: "Sarajevo", lat: 43.856, lng: 18.413 },
    },
    user.cookie,
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.locations.length, 1);
  assert.equal(result.data.locations[0].city, "Sarajevo");
  const search = seen.find((u) => u.pathname.endsWith("/search"));
  assert.equal(search.searchParams.get("bounded"), "1");
  assert.ok(search.searchParams.get("viewbox"));
  assert.match(search.searchParams.get("q"), /Sarajevo/);
  const other = await call(
    "/locations/search",
    { query: "Ista ulica", scope: { city: "Zagreb" } },
    user.cookie,
  );
  assert.equal(other.data.locations.length, 1);
  assert.equal(other.data.locations[0].city, "Zagreb");
  assert.equal(
    (await call("/locations/city", { lat: 999, lng: 0 }, user.cookie)).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/locations/search",
        {
          query: "Ista ulica",
          scope: { city: "Sarajevo", lat: "43", lng: 18 },
        },
        user.cookie,
      )
    ).status,
    400,
  );
});

test("registration city is required, survives login/profile and stays private in public user data", async () => {
  const missing = await call("/auth/register", {
    name: "City User",
    email: "missing-city@example.test",
    password: "testna-lozinka",
    adult: true,
    terms: true,
  });
  assert.equal(missing.status, 400);
  const created = await signup();
  assert.equal(created.data.user.city, "Sarajevo");
  const edited = await call(
    "/profile",
    { name: "City User", city: "Zagreb" },
    created.cookie,
  );
  assert.equal(edited.data.user.city, "Zagreb");
  const me = await call("/auth/me", null, created.cookie);
  assert.equal(me.data.user.city, "Zagreb");
});
