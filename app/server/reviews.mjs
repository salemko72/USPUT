import { demoDriverForRide } from "./demo-drivers.mjs";
const WINDOW = 14 * 86400000;
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const error = (status, message) => json({ error: message }, status);
export const completionWindowStatement = (db, bookingId, now) =>
  db
    .prepare(
      "INSERT INTO trip_review_windows(booking_id,completed_at) SELECT id,? FROM bookings WHERE id=? AND status='completed' ON CONFLICT(booking_id) DO NOTHING",
    )
    .bind(now, bookingId);
async function readState(db, bookingId, userId, now) {
  const b = await db
    .prepare(
      `SELECT b.*,r.driver_id,r.departure,r.status AS ride_status,u.name AS driver_name,p.name AS passenger_name,w.completed_at
    FROM bookings b JOIN rides r ON r.id=b.ride_id JOIN users u ON u.id=r.driver_id
    JOIN users p ON p.id=b.passenger_id LEFT JOIN trip_review_windows w ON w.booking_id=b.id WHERE b.id=?`,
    )
    .bind(bookingId)
    .first();
  if (!b) return { response: error(404, "Dogovor nije pronađen.") };
  if (userId !== b.driver_id && userId !== b.passenger_id)
    return { response: error(403, "Možeš ocijeniti samo svog saputnika.") };
  const driver = userId === b.driver_id;
  const target = {
    id: driver ? b.passenger_id : b.driver_id,
    name: driver ? b.passenger_name : b.driver_name,
    role: driver ? "passenger" : "driver",
  };
  const start = Math.max(b.completed_at ?? b.departure, b.departure),
    closesAt = start + WINDOW;
  const demo = !!demoDriverForRide({ id: b.ride_id, driver_id: b.driver_id });
  const own = await db
    .prepare(
      "SELECT stars,release_at FROM trip_reviews WHERE booking_id=? AND author_id=?",
    )
    .bind(bookingId, userId)
    .first();
  const counterpart = await db
    .prepare(
      "SELECT 1 AS present FROM trip_reviews WHERE booking_id=? AND author_id=? AND target_id=?",
    )
    .bind(bookingId, target.id, userId)
    .first();
  const completed = b.status === "completed";
  const eligible = completed && !demo && now >= start && now < closesAt && !own;
  return {
    b,
    state: {
      eligible,
      submittedStars: own?.stars ?? null,
      closesAt,
      target,
      demo,
      published: !!own && (now >= own.release_at || !!counterpart),
      reason: demo
        ? "demo"
        : !completed
          ? "unfinished"
          : now < start
            ? "future"
            : now >= closesAt
              ? "closed"
              : null,
    },
  };
}
export async function handleReviewApi(path, method, body, user, env) {
  const db = env.DB,
    now = Date.now();
  const reputation = /^\/users\/([^/]+)\/reputation$/.exec(path);
  if (reputation && method === "GET") {
    const targetId = reputation[1];
    if (
      !(await db
        .prepare("SELECT id FROM users WHERE id=?")
        .bind(targetId)
        .first())
    )
      return error(404, "Korisnik nije pronađen.");
    const rows = await db
      .prepare(
        `SELECT v.target_role AS role,AVG(v.stars) AS average,COUNT(*) AS count FROM trip_reviews v
      JOIN bookings b ON b.id=v.booking_id JOIN rides r ON r.id=b.ride_id
      WHERE v.target_id=? AND b.status='completed'
      AND (v.release_at<=? OR EXISTS(SELECT 1 FROM trip_reviews peer WHERE peer.booking_id=v.booking_id AND peer.author_id=v.target_id AND peer.target_id=v.author_id))
      GROUP BY v.target_role`,
      )
      .bind(targetId, now)
      .all();
    const summary = {
      driver: { average: null, count: 0 },
      passenger: { average: null, count: 0 },
    };
    for (const row of rows.results)
      summary[row.role] = { average: row.average, count: row.count };
    return json(summary);
  }
  const review = /^\/bookings\/([^/]+)\/review$/.exec(path);
  if (!review || !["GET", "POST"].includes(method)) return null;
  const result = await readState(db, review[1], user.id, now);
  if (result.response) return result.response;
  const { state, b } = result;
  if (method === "GET") return json(state);
  if (
    !body ||
    Object.keys(body).some((key) => key !== "stars") ||
    !Number.isInteger(body.stars) ||
    body.stars < 1 ||
    body.stars > 5
  )
    return error(400, "Odaberi ocjenu od 1 do 5 zvjezdica.");
  if (!state.eligible)
    return error(
      409,
      state.submittedStars
        ? "Ocjena je već sačuvana."
        : "Ocjena je moguća samo za završenu stvarnu vožnju u roku od 14 dana.",
    );
  const inserted = await db
    .prepare(
      `INSERT INTO trip_reviews(booking_id,author_id,target_id,target_role,stars,created_at,release_at)
    SELECT b.id,?,?,?,?,?,? FROM bookings b JOIN rides r ON r.id=b.ride_id
    WHERE b.id=? AND b.status='completed' AND r.driver_id=? AND b.passenger_id=?
    ON CONFLICT(booking_id,author_id) DO NOTHING`,
    )
    .bind(
      user.id,
      state.target.id,
      state.target.role,
      body.stars,
      now,
      state.closesAt,
      b.id,
      b.driver_id,
      b.passenger_id,
    )
    .run();
  if (!inserted.meta.changes)
    return error(409, "Ocjena je već sačuvana ili je dogovor promijenjen.");
  return json((await readState(db, b.id, user.id, now)).state, 201);
}
