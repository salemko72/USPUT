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
    { name: "Google User", adult: true, terms: true },
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
