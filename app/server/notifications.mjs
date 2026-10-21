import {
  normalizePushSubscription,
  pushConfigured,
  sendWebPush,
} from "./web-push.mjs";

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
const error = (status, message) => json({ error: message }, status);
const active =
  "b.passenger_id=n.user_id AND b.status IN ('accepted','ready') AND r.status IN ('open','matched') AND r.departure>?";
const select =
  "SELECT n.id,n.booking_id,b.ride_id,n.type,n.created_at,u.name AS driver_name,r.date,r.time FROM notifications n JOIN bookings b ON b.id=n.booking_id JOIN rides r ON r.id=b.ride_id JOIN users u ON u.id=r.driver_id";
const view = (row) => ({
  id: row.id,
  bookingId: row.booking_id,
  rideId: row.ride_id,
  type: row.type,
  createdAt: row.created_at,
  driverName: row.driver_name,
  date: row.date,
  time: row.time,
});
const digest = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");

// Append these statements to the same D1 batch that accepts a booking. Their
// predicates require that booking to actually have reached the accepted state.
export function acceptanceNotificationStatements(
  db,
  booking,
  now = Date.now(),
) {
  return [
    db
      .prepare(
        "INSERT INTO notifications(id,user_id,booking_id,type,created_at) SELECT ?,?,?,'booking-accepted',? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND passenger_id=? AND status='accepted') ON CONFLICT(booking_id) DO NOTHING",
      )
      .bind(
        booking.id,
        booking.passenger_id,
        booking.id,
        now,
        booking.id,
        booking.passenger_id,
      ),
    db
      .prepare(
        "INSERT INTO push_deliveries(notification_id,subscription_id,state,attempts,next_attempt,created_at) SELECT n.id,s.id,'pending',0,?,? FROM notifications n JOIN push_subscriptions s ON s.user_id=n.user_id JOIN sessions ss ON ss.id=s.session_id WHERE n.id=? AND ss.expires>? ON CONFLICT(notification_id,subscription_id) DO NOTHING",
      )
      .bind(now, now, booking.id, now),
  ];
}

export function queuePushNotifications(env) {
  if (!pushConfigured(env)) return Promise.resolve();
  const task = deliverPushNotifications(env).catch(() => {});
  if (env.waitUntil) {
    env.waitUntil(task);
    return Promise.resolve();
  }
  return task;
}

export async function handleNotificationApi(
  path,
  method,
  body,
  user,
  env,
  sessionId,
) {
  if (!path.startsWith("/notifications") && !path.startsWith("/push/"))
    return null;
  if (!user) return error(401, "Prijavi se da nastaviš.");
  const db = env.DB;
  if (path === "/push/config" && method === "GET") {
    const enabled = pushConfigured(env);
    return json({
      userId: user.id,
      enabled,
      publicKey: enabled ? env.VAPID_PUBLIC_KEY : null,
    });
  }
  if (path === "/push/subscribe" && method === "POST") {
    if (!pushConfigured(env))
      return error(503, "Obavijesti se još pripremaju. Pokušaj kasnije.");
    const session = await db
      .prepare("SELECT id FROM sessions WHERE id=? AND user_id=? AND expires>?")
      .bind(sessionId || "", user.id, Date.now())
      .first();
    if (!session) return error(401, "Prijavi se da nastaviš.");
    let subscription;
    try {
      subscription = await normalizePushSubscription(body.subscription);
    } catch {
      return error(400, "Neispravna postavka obavijesti.");
    }
    const id = await digest(subscription.endpoint),
      now = Date.now();
    const count = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=? AND id<>?",
      )
      .bind(user.id, id)
      .first();
    if (count.n >= 8)
      return error(409, "Obavijesti su već uključene na osam uređaja.");
    await db.batch([
      db
        .prepare(
          "DELETE FROM push_deliveries WHERE subscription_id=? AND notification_id IN (SELECT id FROM notifications WHERE user_id<>?)",
        )
        .bind(id, user.id),
      db
        .prepare(
          "INSERT INTO push_subscriptions(id,user_id,session_id,endpoint,p256dh,auth,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth,language=excluded.language,updated_at=excluded.updated_at",
        )
        .bind(
          id,
          user.id,
          sessionId,
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth,
          body.language === "en" ? "en" : "bhs",
          now,
          now,
        ),
      db
        .prepare(
          "INSERT INTO push_deliveries(notification_id,subscription_id,state,attempts,next_attempt,created_at) SELECT n.id,?,'pending',0,?,? FROM notifications n JOIN bookings b ON b.id=n.booking_id JOIN rides r ON r.id=b.ride_id WHERE n.user_id=? AND n.seen_at IS NULL AND n.created_at>? AND " +
            active +
            " ON CONFLICT(notification_id,subscription_id) DO NOTHING",
        )
        .bind(id, now, now, user.id, now - 86400000, now),
    ]);
    await queuePushNotifications(env);
    return json({ userId: user.id, ok: true });
  }
  if (path === "/push/unsubscribe" && method === "POST") {
    if (typeof body.endpoint !== "string" || body.endpoint.length > 2048)
      return error(400, "Neispravna postavka obavijesti.");
    await db
      .prepare("DELETE FROM push_subscriptions WHERE user_id=? AND id=?")
      .bind(user.id, await digest(body.endpoint))
      .run();
    return json({ userId: user.id, ok: true });
  }
  if (path === "/notifications" && method === "GET") {
    const rows = await db
      .prepare(
        select +
          " WHERE n.user_id=? AND n.seen_at IS NULL AND " +
          active +
          " ORDER BY n.created_at,n.id LIMIT 20",
      )
      .bind(user.id, Date.now())
      .all();
    return json({ userId: user.id, notifications: rows.results.map(view) });
  }
  const match = path.match(/^\/notifications\/([^/]+)(\/seen)?$/);
  if (match) {
    const row = await db
      .prepare(select + " WHERE n.id=? AND n.user_id=? AND " + active)
      .bind(match[1], user.id, Date.now())
      .first();
    if (!row) return error(404, "Obavijest nije dostupna.");
    if (method === "GET" && !match[2])
      return json({ userId: user.id, notification: view(row) });
    if (method === "POST" && match[2]) {
      const result = await db
        .prepare(
          "UPDATE notifications SET seen_at=? WHERE id=? AND user_id=? AND seen_at IS NULL AND EXISTS(SELECT 1 FROM bookings b JOIN rides r ON r.id=b.ride_id WHERE b.id=notifications.booking_id AND b.passenger_id=? AND b.status IN ('accepted','ready') AND r.status IN ('open','matched') AND r.departure>?)",
        )
        .bind(Date.now(), row.id, user.id, user.id, Date.now())
        .run();
      return json({ userId: user.id, claimed: !!result.meta.changes });
    }
  }
  return error(404, "Stranica nije pronađena.");
}

export async function deliverPushNotifications(env) {
  if (!pushConfigured(env)) return;
  const now = Date.now();
  const rows = await env.DB.prepare(
    "SELECT d.*,s.endpoint,s.p256dh,s.auth,s.language,n.user_id,b.ride_id FROM push_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN push_subscriptions s ON s.id=d.subscription_id AND s.user_id=n.user_id JOIN sessions ss ON ss.id=s.session_id AND ss.user_id=s.user_id JOIN bookings b ON b.id=n.booking_id JOIN rides r ON r.id=b.ride_id WHERE d.attempts<5 AND d.next_attempt<=? AND (d.state='pending' OR (d.state='sending' AND d.lease_until<=?)) AND n.created_at>? AND ss.expires>? AND b.passenger_id=n.user_id AND b.status IN ('accepted','ready') AND r.status IN ('open','matched') AND r.departure>? ORDER BY d.created_at LIMIT 5",
  )
    .bind(now, now, now - 86400000, now, now)
    .all();
  for (const row of rows.results) {
    const claim = crypto.randomUUID(),
      lease = Date.now() + 30000;
    const claimed = await env.DB.prepare(
      "UPDATE push_deliveries SET state='sending',attempts=attempts+1,lease_until=?,claim_token=? WHERE notification_id=? AND subscription_id=? AND attempts<5 AND next_attempt<=? AND (state='pending' OR (state='sending' AND lease_until<=?))",
    )
      .bind(
        lease,
        claim,
        row.notification_id,
        row.subscription_id,
        Date.now(),
        Date.now(),
      )
      .run();
    if (!claimed.meta.changes) continue;
    // Lock-screen copy intentionally contains neither names nor private pins.
    const english = row.language === "en";
    let result;
    try {
      result = await sendWebPush(
        env,
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        {
          id: row.notification_id,
          type: "booking-accepted",
          title: english
            ? "Your request was accepted"
            : "Vaš zahtjev je prihvaćen",
          body: english
            ? "Open USPUT to view your ride."
            : "Otvori USPUT i pogledaj dogovorenu vožnju.",
          url: "#ride/" + encodeURIComponent(row.ride_id),
        },
      );
    } catch {
      result = { ok: false };
    }
    if (result.gone) {
      await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?")
        .bind(row.subscription_id)
        .run();
      continue;
    }
    const attempts = row.attempts + 1;
    const state = result.ok ? "sent" : attempts >= 5 ? "failed" : "pending";
    const wait = Math.min(
      3600,
      Math.max(60 * 2 ** (attempts - 1), Number(result.retryAfter) || 0),
    );
    await env.DB.prepare(
      "UPDATE push_deliveries SET state=?,next_attempt=?,lease_until=NULL,claim_token=NULL WHERE notification_id=? AND subscription_id=? AND claim_token=?",
    )
      .bind(
        state,
        Date.now() + wait * 1000,
        row.notification_id,
        row.subscription_id,
        claim,
      )
      .run();
  }
}

export async function cleanupNotifications(env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM push_subscriptions WHERE session_id IN (SELECT id FROM sessions WHERE expires<=?)",
    ).bind(now),
    env.DB.prepare("DELETE FROM notifications WHERE created_at<?").bind(
      now - 30 * 86400000,
    ),
  ]);
}
