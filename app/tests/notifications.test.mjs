import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { adaptSqlite } from "../server/db.mjs";
let sqlite, env, notifications;
beforeEach(async () => {
  const migration = new URL(
    "../server/migrations/0011_acceptance_notifications.sql",
    import.meta.url,
  );
  const module = new URL("../server/notifications.mjs", import.meta.url);
  assert.ok(existsSync(migration), "durable notification migration must exist");
  assert.ok(
    existsSync(module),
    "owner-private notification handler must exist",
  );
  notifications = await import(module.href);
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  sqlite.exec(readFileSync(migration, "utf8"));
  for (const id of ["driver", "passenger", "other"])
    sqlite
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,0)")
      .run(id, id, id + "@test.invalid");
  sqlite
    .prepare(
      "INSERT INTO sessions(id,user_id,expires) VALUES('session','passenger',?)",
    )
    .run(Date.now() + 86400000);
  sqlite
    .prepare(
      "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,status,created_at) VALUES('ride','driver','cengic','marijin','2027-01-01','07:30',?,'Test vehicle','matched',0)",
    )
    .run(Date.now() + 86400000);
  sqlite.exec(
    "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES('booking','ride','passenger','accepted',0)",
  );
  const vapid = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const recipient = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const raw = Buffer.from(
    await crypto.subtle.exportKey("raw", vapid.publicKey),
  ).toString("base64url");
  const p256dh = Buffer.from(
    await crypto.subtle.exportKey("raw", recipient.publicKey),
  ).toString("base64url");
  env = {
    DB: adaptSqlite(sqlite),
    VAPID_PUBLIC_KEY: raw,
    VAPID_PRIVATE_JWK: JSON.stringify(
      await crypto.subtle.exportKey("jwk", vapid.privateKey),
    ),
    PUSH_FETCH: async () => new Response(null, { status: 201 }),
    fixtureSubscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/fixture-token",
      keys: { p256dh, auth: Buffer.alloc(16, 5).toString("base64url") },
    },
  };
});
afterEach(() => sqlite?.close());
async function call(
  path,
  method = "GET",
  body = {},
  user = "passenger",
  session = "session",
) {
  const response = await notifications.handleNotificationApi(
    path,
    method,
    body,
    user ? { id: user } : null,
    env,
    session,
  );
  assert.ok(response, "notification route must be handled");
  return { status: response.status, data: await response.json() };
}
async function subscribe() {
  const result = await call("/push/subscribe", "POST", {
    subscription: env.fixtureSubscription,
    language: "bhs",
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
}
async function record() {
  await env.DB.batch(
    notifications.acceptanceNotificationStatements(
      env.DB,
      {
        id: "booking",
        ride_id: "ride",
        passenger_id: "passenger",
      },
      Date.now(),
    ),
  );
}
test("accepted event and device delivery are recorded once alongside the accepted booking", async () => {
  await subscribe();
  await record();
  await record();
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM notifications").get().n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM push_deliveries").get().n,
    1,
  );
  const listed = await call("/notifications");
  assert.equal(listed.data.notifications.length, 1);
  assert.equal(listed.data.notifications[0].rideId, "ride");
  assert.equal(listed.data.notifications[0].driverName, "driver");
  assert.equal(JSON.stringify(listed.data).includes("fixture-token"), false);
});
test("pending booking never creates an accepted notification", async () => {
  sqlite.exec("UPDATE bookings SET status='pending'");
  await record();
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM notifications").get().n,
    0,
  );
});
test("language migration retains existing subscription and delivery identities", async () => {
  await subscribe();
  await record();
  const before = sqlite
    .prepare("SELECT id,user_id,session_id,language FROM push_subscriptions")
    .all();
  const deliveries = sqlite
    .prepare("SELECT notification_id,subscription_id FROM push_deliveries")
    .all();
  sqlite.exec("ALTER TABLE push_subscriptions DROP COLUMN display_language");
  sqlite.exec(
    readFileSync(
      new URL(
        "../server/migrations/0013_push_display_language.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    sqlite
      .prepare("SELECT id,user_id,session_id,language FROM push_subscriptions")
      .all(),
    before,
  );
  assert.deepEqual(
    sqlite
      .prepare("SELECT notification_id,subscription_id FROM push_deliveries")
      .all(),
    deliveries,
  );
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
});
test("four notification language preferences persist without replacing a device or dropping its delivery", async () => {
  await subscribe();
  await record();
  const first = sqlite.prepare("SELECT id FROM push_subscriptions").get().id;
  for (const language of ["hr", "sr-Latn", "en", "bhs"]) {
    const result = await call("/push/subscribe", "POST", {
      subscription: env.fixtureSubscription,
      language,
    });
    assert.equal(result.status, 200);
    const row = sqlite.prepare("SELECT * FROM push_subscriptions").get();
    assert.equal(row.id, first);
    assert.equal(row.display_language, language);
    assert.equal(row.language, language === "en" ? "en" : "bhs");
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM push_deliveries").get().n,
      1,
    );
  }
});
test("notification detail, claim and listing are private to the authenticated passenger", async () => {
  await record();
  assert.equal(
    (await call("/notifications", "GET", {}, "other")).data.notifications
      .length,
    0,
  );
  assert.equal(
    (await call("/notifications/booking", "GET", {}, "other")).status,
    404,
  );
  assert.equal(
    (await call("/notifications/booking/seen", "POST", {}, "other")).status,
    404,
  );
  assert.equal((await call("/notifications", "GET", {}, null)).status, 401);
  assert.equal(
    (await call("/notifications/booking")).data.notification.bookingId,
    "booking",
  );
});
test("concurrent claims show a popup once and detail stays resolvable for a push click", async () => {
  await record();
  const claims = await Promise.all([
    call("/notifications/booking/seen", "POST"),
    call("/notifications/booking/seen", "POST"),
  ]);
  assert.deepEqual(claims.map((r) => r.data.claimed).sort(), [false, true]);
  assert.equal((await call("/notifications")).data.notifications.length, 0);
  assert.equal((await call("/notifications/booking")).status, 200);
});
test("cancelled, completed and expired bookings do not raise stale accepted popups", async () => {
  await record();
  for (const status of ["cancelled", "completed", "declined"]) {
    sqlite.prepare("UPDATE bookings SET status=?").run(status);
    assert.equal((await call("/notifications")).data.notifications.length, 0);
    assert.equal((await call("/notifications/booking")).status, 404);
  }
  sqlite.exec(
    "UPDATE bookings SET status='accepted';UPDATE rides SET departure=0",
  );
  assert.equal((await call("/notifications")).data.notifications.length, 0);
});
test("subscriptions bind to a real owner session and logout removes queued deliveries", async () => {
  assert.equal(
    (
      await call(
        "/push/subscribe",
        "POST",
        { subscription: env.fixtureSubscription },
        "passenger",
        "wrong-session",
      )
    ).status,
    401,
  );
  await subscribe();
  await record();
  sqlite.exec("DELETE FROM sessions WHERE id='session'");
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM push_deliveries").get().n,
    0,
  );
});
test("push settings require configured signing keys and never expose them", async () => {
  const configured = await call("/push/config");
  assert.equal(configured.data.enabled, true);
  assert.equal(configured.data.publicKey, env.VAPID_PUBLIC_KEY);
  assert.equal(JSON.stringify(configured.data).includes('"d"'), false);
  delete env.VAPID_PRIVATE_JWK;
  assert.equal((await call("/push/config")).data.enabled, false);
  assert.equal(
    (
      await call("/push/subscribe", "POST", {
        subscription: env.fixtureSubscription,
      })
    ).status,
    503,
  );
});
test("unsubscription is owner-bound and removes only the matching device", async () => {
  await subscribe();
  await record();
  await call(
    "/push/unsubscribe",
    "POST",
    { endpoint: env.fixtureSubscription.endpoint },
    "other",
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n,
    1,
  );
  await call("/push/unsubscribe", "POST", {
    endpoint: env.fixtureSubscription.endpoint,
  });
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n,
    0,
  );
});
test("push dispatcher claims one delivery across workers and sends no duplicate on success", async () => {
  await subscribe();
  await record();
  let sent = 0;
  env.PUSH_FETCH = async () => {
    sent++;
    return new Response(null, { status: 201 });
  };
  await Promise.all([
    notifications.deliverPushNotifications(env),
    notifications.deliverPushNotifications(env),
  ]);
  await notifications.deliverPushNotifications(env);
  assert.equal(sent, 1);
  assert.equal(
    sqlite.prepare("SELECT state FROM push_deliveries").get().state,
    "sent",
  );
});
test("temporary push failures retry finitely; gone subscriptions are removed", async () => {
  await subscribe();
  await record();
  env.PUSH_FETCH = async () => new Response(null, { status: 503 });
  for (let i = 0; i < 5; i++) {
    sqlite.exec("UPDATE push_deliveries SET next_attempt=0");
    await notifications.deliverPushNotifications(env);
  }
  assert.equal(
    sqlite.prepare("SELECT attempts,state FROM push_deliveries").get().attempts,
    5,
  );
  assert.equal(
    sqlite.prepare("SELECT state FROM push_deliveries").get().state,
    "failed",
  );
  sqlite.exec(
    "UPDATE push_deliveries SET state='pending',attempts=0,next_attempt=0",
  );
  env.PUSH_FETCH = async () => new Response(null, { status: 410 });
  await notifications.deliverPushNotifications(env);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n,
    0,
  );
});
test("cancelled ride or expired session cannot dispatch an old queued approval", async () => {
  await subscribe();
  await record();
  let sent = 0;
  env.PUSH_FETCH = async () => {
    sent++;
    return new Response(null, { status: 201 });
  };
  sqlite.exec("UPDATE rides SET status='cancelled'");
  await notifications.deliverPushNotifications(env);
  assert.equal(sent, 0);
  sqlite.exec(
    "UPDATE rides SET status='matched';UPDATE sessions SET expires=0",
  );
  await notifications.deliverPushNotifications(env);
  assert.equal(sent, 0);
});
