const LEASE = 60000,
  FIX_TTL = 90000,
  MAX_WINDOW = 6 * 3600000;
const PICKUP = "COALESCE(json_extract(br.match_json,'$.pickupAt'),r.departure)";
const ACTIVE = `SELECT 1 FROM bookings b JOIN rides r ON r.id=b.ride_id LEFT JOIN booking_routes br ON br.booking_id=b.id WHERE b.id=? AND b.status IN ('accepted','ready') AND r.status IN ('open','matched') AND ?>=(${PICKUP}-300000) AND ?<(${PICKUP}+21600000)`;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
class LocationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new LocationError(status, message);
};
async function context(db, id, userId, now) {
  const row = await db
    .prepare(
      `SELECT b.id,b.passenger_id,b.status,r.driver_id,r.status AS ride_status,${PICKUP} AS pickup_at FROM bookings b JOIN rides r ON r.id=b.ride_id LEFT JOIN booking_routes br ON br.booking_id=b.id WHERE b.id=?`,
    )
    .bind(id)
    .first();
  if (!row) fail(404, "Dogovor nije pronađen.");
  if (![row.driver_id, row.passenger_id].includes(userId))
    fail(403, "Ovaj dogovor nije tvoj.");
  const pickup = Number(row.pickup_at),
    opensAt = pickup - 300000,
    endsAt = pickup + MAX_WINDOW;
  const available =
    Number.isFinite(pickup) &&
    ["accepted", "ready"].includes(row.status) &&
    ["open", "matched"].includes(row.ride_status) &&
    now >= opensAt &&
    now < endsAt;
  return {
    ...row,
    opensAt,
    endsAt,
    available,
    peerId: row.driver_id === userId ? row.passenger_id : row.driver_id,
  };
}
export async function cleanupLiveLocations(env, now = Date.now()) {
  const active = ACTIVE.replace("b.id=?", "b.id=location_shares.booking_id");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM location_fixes WHERE expires_at<=?").bind(now),
    env.DB.prepare(
      `DELETE FROM location_shares WHERE lease_until<=? OR NOT EXISTS(${active})`,
    ).bind(now, now, now),
  ]);
}
export async function handleLocationApi(
  request,
  env,
  user,
  path,
  body = {},
  rateLimit,
) {
  const match = path.match(
    /^\/bookings\/([^/]+)\/(location|location-sharing)$/,
  );
  if (!match) return null;
  try {
    const db = env.DB,
      now = Date.now(),
      c = await context(db, match[1], user.id, now);
    if (match[2] === "location-sharing" && request.method === "POST") {
      if (typeof body.enabled !== "boolean")
        fail(400, "Odaberi uključivanje ili prekid dijeljenja.");
      if (!body.enabled) {
        const token =
          typeof body.sharingId === "string" ? body.sharingId : null;
        await db
          .prepare(
            "DELETE FROM location_shares WHERE booking_id=? AND user_id=? AND (? IS NULL OR token=?)",
          )
          .bind(c.id, user.id, token, token)
          .run();
        return json({ ok: true });
      }
      if (!c.available)
        fail(
          409,
          "Lokacija se dijeli od pet minuta prije susreta do završetka dogovora.",
        );
      const expected = body.expectedSharingId ?? null;
      if (
        expected !== null &&
        (typeof expected !== "string" || expected.length > 100)
      )
        fail(400, "Podaci nisu ispravni.");
      if (rateLimit) await rateLimit(db, "location-start:" + user.id, 60);
      const token = crypto.randomUUID(),
        until = Math.min(now + LEASE, c.endsAt);
      const result = await db.batch([
        db
          .prepare(
            `INSERT INTO location_shares(booking_id,user_id,token,lease_until,window_end,started_at) SELECT ?,?,?,?,?,? WHERE EXISTS(${ACTIVE}) ON CONFLICT(booking_id,user_id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until,window_end=excluded.window_end,started_at=excluded.started_at WHERE location_shares.token=? OR location_shares.lease_until<=?`,
          )
          .bind(
            c.id,
            user.id,
            token,
            until,
            c.endsAt,
            now,
            c.id,
            now,
            now,
            expected,
            now,
          ),
        db
          .prepare(
            "DELETE FROM location_fixes WHERE booking_id=? AND user_id=? AND EXISTS(SELECT 1 FROM location_shares WHERE booking_id=? AND user_id=? AND token=?)",
          )
          .bind(c.id, user.id, c.id, user.id, token),
      ]);
      if (!result[0].meta.changes)
        fail(409, "Uključivanje lokacije se promijenilo. Pokušaj ponovo.");
      return json({
        sharingId: token,
        opensAt: c.opensAt,
        endsAt: c.endsAt,
        serverNow: now,
      });
    }
    if (match[2] !== "location") fail(405, "Radnja nije podržana.");
    if (request.method === "GET") {
      if (!c.available)
        return json({
          available: false,
          opensAt: c.opensAt,
          endsAt: c.endsAt,
          serverNow: now,
          ownSharing: false,
          peerSharing: false,
          ownLocation: null,
          peerLocation: null,
        });
      const rows = (
        await db
          .prepare(
            `SELECT s.user_id,s.token,s.lease_until,f.lat,f.lng,f.accuracy,f.captured_at,f.received_at,f.expires_at FROM location_shares s LEFT JOIN location_fixes f ON f.booking_id=s.booking_id AND f.user_id=s.user_id AND f.token=s.token WHERE s.booking_id=? AND s.user_id IN (?,?) AND s.lease_until>? AND EXISTS(${ACTIVE})`,
          )
          .bind(c.id, user.id, c.peerId, now, c.id, now, now)
          .all()
      ).results;
      const own = rows.find((r) => r.user_id === user.id),
        peer = rows.find((r) => r.user_id === c.peerId);
      const fix = (r) =>
        r && r.lat !== null && r.expires_at > now
          ? {
              userId: r.user_id,
              lat: r.lat,
              lng: r.lng,
              accuracy: r.accuracy,
              capturedAt: r.captured_at,
              receivedAt: r.received_at,
            }
          : null;
      return json({
        available: true,
        opensAt: c.opensAt,
        endsAt: c.endsAt,
        serverNow: now,
        ownSharing: !!own,
        peerSharing: !!peer,
        ownSharingId: own?.token,
        ownLocation: fix(own),
        peerLocation: fix(peer),
      });
    }
    if (request.method !== "POST") fail(405, "Radnja nije podržana.");
    if (!c.available)
      fail(
        409,
        "Lokacija se dijeli od pet minuta prije susreta do završetka dogovora.",
      );
    const { lat, lng, accuracy, capturedAt, sharingId } = body;
    if (
      !Number.isFinite(lat) ||
      Math.abs(lat) > 85 ||
      !Number.isFinite(lng) ||
      Math.abs(lng) > 180 ||
      !Number.isFinite(accuracy) ||
      accuracy < 0 ||
      accuracy > 50000 ||
      !Number.isSafeInteger(capturedAt) ||
      capturedAt < now - FIX_TTL ||
      capturedAt > now + 30000 ||
      typeof sharingId !== "string" ||
      sharingId.length > 100
    )
      fail(400, "GPS lokacija nije ispravna ili je zastarjela.");
    if (rateLimit) await rateLimit(db, "location-fix:" + user.id, 600);
    const until = Math.min(now + LEASE, c.endsAt),
      expires = Math.min(capturedAt + FIX_TTL, c.endsAt);
    const result = await db.batch([
      db
        .prepare(
          `INSERT INTO location_fixes(booking_id,user_id,token,lat,lng,accuracy,captured_at,received_at,expires_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM location_shares WHERE booking_id=? AND user_id=? AND token=? AND lease_until>?) AND EXISTS(${ACTIVE}) ON CONFLICT(booking_id,user_id) DO UPDATE SET token=excluded.token,lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,captured_at=excluded.captured_at,received_at=excluded.received_at,expires_at=excluded.expires_at WHERE excluded.captured_at>=location_fixes.captured_at`,
        )
        .bind(
          c.id,
          user.id,
          sharingId,
          lat,
          lng,
          accuracy,
          capturedAt,
          now,
          expires,
          c.id,
          user.id,
          sharingId,
          now,
          c.id,
          now,
          now,
        ),
      db
        .prepare(
          "UPDATE location_shares SET lease_until=? WHERE booking_id=? AND user_id=? AND token=? AND EXISTS(SELECT 1 FROM location_fixes WHERE booking_id=? AND user_id=? AND token=? AND captured_at=? AND received_at=?)",
        )
        .bind(
          until,
          c.id,
          user.id,
          sharingId,
          c.id,
          user.id,
          sharingId,
          capturedAt,
          now,
        ),
    ]);
    if (!result[0].meta.changes)
      fail(
        409,
        "Dijeljenje lokacije nije aktivno ili je pristigla novija lokacija.",
      );
    return json({ ok: true, serverNow: now });
  } catch (error) {
    if (error instanceof LocationError || error.status === 429)
      return json({ error: error.message }, error.status);
    console.error("Location service unavailable:", error.name);
    return json({ error: "Dijeljenje lokacije trenutno nije dostupno." }, 503);
  }
}
