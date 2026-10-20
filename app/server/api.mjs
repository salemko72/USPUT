import { places, getPlace, departureMs } from "./places.mjs";
const encoder = new TextEncoder();
const hex = (b) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (s) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new ApiError(status, message);
};
const publicUser = (u) => ({ id: u.id, name: u.name });
const selfUser = (u) => ({
  ...publicUser(u),
  email: u.email,
  provider: u.google_id ? "google" : "email",
});
const cookieValue = (request, name) =>
  request.headers
    .get("Cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
const safeText = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
async function rateLimit(db, key, max) {
  const id = await hash(key),
    now = Date.now();
  await db
    .prepare(
      "INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END",
    )
    .bind(id, now + 900000, now, now)
    .run();
  const r = await db
    .prepare("SELECT count FROM rate_limits WHERE id=?")
    .bind(id)
    .first();
  if (r.count > max)
    fail(429, "Previše pokušaja. Pokušaj ponovo za 15 minuta.");
}
async function session(request, env) {
  const token = cookieValue(request, "usput_session");
  if (!token) return null;
  return env.DB.prepare(
    "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.id=? AND s.expires>?",
  )
    .bind(await hash(token), Date.now())
    .first();
}
async function newSession(user, request, env) {
  const token = random();
  const expires = Date.now() + 14 * 86400000;
  await env.DB.prepare("DELETE FROM sessions WHERE expires<?")
    .bind(Date.now())
    .run();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
    .bind(await hash(token), user.id, expires)
    .run();
  return `usput_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
const rideView = (r) => ({
  id: r.id,
  from: getPlace(r.from_id),
  to: getPlace(r.to_id),
  date: r.date,
  time: r.time,
  departure: r.departure,
  car: r.car,
  note: r.note,
  status: r.status,
  driver: { id: r.driver_id, name: r.driver_name },
  createdAt: r.created_at,
});
const rideSelect =
  "SELECT r.*,u.name AS driver_name FROM rides r JOIN users u ON u.id=r.driver_id";
async function readRide(db, id) {
  return db
    .prepare(rideSelect + " WHERE r.id=?")
    .bind(id)
    .first();
}
async function readBooking(db, id) {
  return db
    .prepare(
      "SELECT b.*,r.driver_id,r.status AS ride_status,r.departure FROM bookings b JOIN rides r ON r.id=b.ride_id WHERE b.id=?",
    )
    .bind(id)
    .first();
}
export async function handleApi(request, env) {
  const url = new URL(request.url),
    path = url.pathname.replace(/^\/api/, "");
  const db = env.DB;
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      if (request.headers.get("Origin") !== url.origin)
        fail(403, "Zahtjev nije dozvoljen s ove stranice.");
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        fail(415, "Očekujemo JSON podatke.");
      if (Number(request.headers.get("Content-Length") ?? 0) > 16384)
        fail(413, "Prevelik zahtjev.");
    }
    let body = {};
    if (!["GET", "HEAD"].includes(request.method)) {
      const raw = await request.text();
      if (raw.length > 16384) fail(413, "Prevelik zahtjev.");
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        fail(400, "Podaci nisu ispravni.");
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        fail(400, "Podaci nisu ispravni.");
    }
    const method = request.method;
    if (path === "/places" && method === "GET") return json({ places });
    if (path === "/auth/config" && method === "GET")
      return json({
        google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      });
    if (path === "/auth/google" && method === "GET") {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
        fail(
          503,
          "Google prijava čeka povezivanje OAuth podataka. Email prijava i demo su dostupni.",
        );
      const state = random(),
        verifier = random();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(verifier),
      );
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      const redirectUri = url.origin + "/api/auth/google/callback";
      await db
        .prepare("DELETE FROM oauth_states WHERE expires<?")
        .bind(Date.now())
        .run();
      await db
        .prepare(
          "INSERT INTO oauth_states(id,verifier,redirect_uri,expires) VALUES(?,?,?,?)",
        )
        .bind(await hash(state), verifier, redirectUri, Date.now() + 600000)
        .run();
      const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      target.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return new Response(null, {
        status: 302,
        headers: {
          Location: target.toString(),
          "Set-Cookie": `usput_oauth=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === "https:" ? "; Secure" : ""}`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "/auth/google/callback" && method === "GET") {
      const state = url.searchParams.get("state");
      if (!state || state !== cookieValue(request, "usput_oauth"))
        fail(400, "Google prijava je istekla. Pokušaj ponovo.");
      const stored = await db
        .prepare("SELECT * FROM oauth_states WHERE id=? AND expires>?")
        .bind(await hash(state), Date.now())
        .first();
      if (!stored) fail(400, "Google prijava je istekla.");
      await db
        .prepare("DELETE FROM oauth_states WHERE id=?")
        .bind(await hash(state))
        .run();
      if (!url.searchParams.get("code"))
        return Response.redirect(url.origin + "/?authError=google", 302);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: url.searchParams.get("code"),
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: stored.redirect_uri,
          grant_type: "authorization_code",
          code_verifier: stored.verifier,
        }),
      });
      if (!tokenResponse.ok)
        fail(502, "Google prijava nije završena. Pokušaj ponovo.");
      const tokens = await tokenResponse.json();
      const profileResponse = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (!profileResponse.ok) fail(502, "Google profil nije dostupan.");
      const profile = await profileResponse.json();
      if (!profile.email_verified || !profile.email || !profile.sub)
        fail(403, "Potreban je potvrđen Google email.");
      // Google login never silently creates an account: new users must confirm adult/terms via onboarding.
      let user = await db
        .prepare("SELECT * FROM users WHERE google_id=?")
        .bind(profile.sub)
        .first();
      if (!user) {
        const enrollment = random();
        await db
          .prepare(
            "INSERT INTO oauth_states(id,verifier,redirect_uri,expires) VALUES(?,?,?,?)",
          )
          .bind(
            await hash(enrollment),
            JSON.stringify({
              sub: profile.sub,
              email: profile.email.toLowerCase(),
              name: safeText(profile.name, 60),
            }),
            "enroll",
            Date.now() + 600000,
          )
          .run();
        return new Response(null, {
          status: 302,
          headers: {
            Location: url.origin + "/?google=onboard",
            "Set-Cookie": `usput_enroll=${enrollment}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === "https:" ? "; Secure" : ""}`,
          },
        });
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: url.origin + "/?welcome=1",
          "Set-Cookie": await newSession(user, request, env),
        },
      });
    }
    if (path === "/auth/google/enroll" && method === "POST") {
      if (body.adult !== true || body.terms !== true)
        fail(400, "Potvrdi punoljetnost i pravila korištenja.");
      const token = cookieValue(request, "usput_enroll");
      const state =
        token &&
        (await db
          .prepare(
            "SELECT * FROM oauth_states WHERE id=? AND redirect_uri=? AND expires>?",
          )
          .bind(await hash(token), "enroll", Date.now())
          .first());
      if (!state) fail(400, "Google prijava je istekla. Pokušaj ponovo.");
      const p = JSON.parse(state.verifier);
      const existing = await db
        .prepare("SELECT id FROM users WHERE email=?")
        .bind(p.email)
        .first();
      if (existing)
        fail(
          409,
          "Račun s ovim emailom već postoji. Prijavi se emailom i lozinkom.",
        );
      const u = {
        id: crypto.randomUUID(),
        name: safeText(body.name || p.name, 60),
        email: p.email,
        google_id: p.sub,
      };
      if (u.name.length < 2) fail(400, "Unesi ime od najmanje dva znaka.");
      await db.batch([
        db
          .prepare(
            "INSERT INTO users(id,name,email,google_id,created_at) VALUES(?,?,?,?,?)",
          )
          .bind(u.id, u.name, u.email, u.google_id, Date.now()),
        db
          .prepare("DELETE FROM oauth_states WHERE id=?")
          .bind(await hash(token)),
      ]);
      return json({ user: selfUser(u) }, 201, {
        "Set-Cookie": await newSession(u, request, env),
      });
    }
    if (
      (path === "/auth/register" || path === "/auth/login") &&
      method === "POST"
    ) {
      const email = safeText(body.email, 254).toLowerCase(),
        password = typeof body.password === "string" ? body.password : "";
      await rateLimit(
        db,
        `auth:${request.headers.get("CF-Connecting-IP") || "local"}`,
        40,
      );
      await rateLimit(db, `auth-email:${email}`, 12);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 128)
        fail(400, "Provjeri email i lozinku.");
      if (path === "/auth/register") {
        const name = safeText(body.name, 60);
        if (
          name.length < 2 ||
          password.length < 10 ||
          body.adult !== true ||
          body.terms !== true
        )
          fail(
            400,
            "Unesi ime, lozinku od najmanje 10 znakova i potvrdi punoljetnost i pravila.",
          );
        if (
          await db
            .prepare("SELECT id FROM users WHERE email=?")
            .bind(email)
            .first()
        )
          fail(409, "Račun s ovim emailom već postoji. Prijavi se.");
        const salt = random(),
          u = { id: crypto.randomUUID(), name, email };
        await db
          .prepare(
            "INSERT INTO users(id,name,email,password,salt,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            u.id,
            name,
            email,
            await passwordHash(password, salt),
            salt,
            Date.now(),
          )
          .run();
        return json({ user: selfUser(u) }, 201, {
          "Set-Cookie": await newSession(u, request, env),
        });
      }
      const u = await db
        .prepare("SELECT * FROM users WHERE email=?")
        .bind(email)
        .first();
      const candidate = await passwordHash(
        password,
        u?.salt || "dummy-constant-salt-for-invalid-users",
      );
      if (!u?.password || candidate !== u.password)
        fail(401, "Email ili lozinka nisu ispravni.");
      return json({ user: selfUser(u) }, 200, {
        "Set-Cookie": await newSession(u, request, env),
      });
    }
    const user = await session(request, env);
    if (!user) fail(401, "Prijavi se da nastaviš.");
    if (path === "/auth/me" && method === "GET")
      return json({ user: selfUser(user) });
    if (path === "/auth/logout" && method === "POST") {
      const token = cookieValue(request, "usput_session");
      if (token)
        await db
          .prepare("DELETE FROM sessions WHERE id=?")
          .bind(await hash(token))
          .run();
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "usput_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      });
    }
    if (path === "/profile" && method === "POST") {
      const name = safeText(body.name, 60);
      if (name.length < 2) fail(400, "Unesi ime od najmanje dva znaka.");
      await db
        .prepare("UPDATE users SET name=? WHERE id=?")
        .bind(name, user.id)
        .run();
      return json({ user: selfUser({ ...user, name }) });
    }
    if (path === "/rides" && method === "POST") {
      const from = safeText(body.from, 30),
        to = safeText(body.to, 30),
        date = safeText(body.date, 10),
        time = safeText(body.time, 5),
        car = safeText(body.car, 80),
        note = safeText(body.note, 280),
        departure = departureMs(date, time);
      if (
        !getPlace(from) ||
        !getPlace(to) ||
        from === to ||
        !Number.isFinite(departure) ||
        departure <= Date.now() ||
        departure > Date.now() + 90 * 86400000 ||
        car.length < 3
      )
        fail(
          400,
          "Odaberi različita mjesta, budući polazak u narednih 90 dana i podatke o vozilu.",
        );
      await rateLimit(db, "publish:" + user.id, 20);
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          user.id,
          from,
          to,
          date,
          time,
          departure,
          car,
          note,
          Date.now(),
        )
        .run();
      return json({ ride: rideView(await readRide(db, id)) }, 201);
    }
    if (path === "/rides" && method === "GET") {
      const q = url.searchParams;
      let sql =
          rideSelect +
          " WHERE r.status='open' AND r.departure>? AND r.driver_id<>?",
        params = [Date.now(), user.id];
      for (const [key, column] of [
        ["from", "from_id"],
        ["to", "to_id"],
        ["date", "date"],
      ])
        if (q.get(key)) {
          sql += ` AND r.${column}=?`;
          params.push(q.get(key));
        }
      const time = q.get("time");
      if (time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        sql +=
          " AND ABS((CAST(substr(r.time,1,2) AS INTEGER)*60+CAST(substr(r.time,4,2) AS INTEGER))-?)<=60";
        params.push(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
      }
      const rows = (
        await db
          .prepare(sql + " ORDER BY r.departure LIMIT 60")
          .bind(...params)
          .all()
      ).results;
      return json({ rides: rows.map(rideView) });
    }
    if (path === "/my-rides" && method === "GET") {
      const rides = (
        await db
          .prepare(
            rideSelect +
              " WHERE r.driver_id=? ORDER BY r.departure DESC LIMIT 100",
          )
          .bind(user.id)
          .all()
      ).results;
      const rows = (
        await db
          .prepare(
            "SELECT b.*,u.name AS passenger_name FROM bookings b JOIN users u ON u.id=b.passenger_id JOIN rides r ON r.id=b.ride_id WHERE b.passenger_id=? OR r.driver_id=? ORDER BY b.created_at DESC LIMIT 200",
          )
          .bind(user.id, user.id)
          .all()
      ).results;
      const bookings = [];
      for (const b of rows) {
        const r = await readRide(db, b.ride_id);
        bookings.push({
          id: b.id,
          status: b.status,
          passenger: { id: b.passenger_id, name: b.passenger_name },
          ride: rideView(r),
        });
      }
      return json({ rides: rides.map(rideView), bookings });
    }
    const rideMatch = path.match(/^\/rides\/([^/]+)(?:\/(request|cancel))?$/);
    if (rideMatch) {
      const r = await readRide(db, rideMatch[1]);
      if (!r) fail(404, "Vožnja nije pronađena.");
      const action = rideMatch[2];
      if (!action && method === "GET") return json({ ride: rideView(r) });
      if (action === "cancel" && method === "POST") {
        if (r.driver_id !== user.id)
          fail(403, "Samo vozač može otkazati ponudu.");
        if (["cancelled", "completed"].includes(r.status))
          fail(409, "Vožnja je već završena ili otkazana.");
        const results = await db.batch([
          db
            .prepare(
              "UPDATE rides SET status='cancelled' WHERE id=? AND status IN ('open','matched')",
            )
            .bind(r.id),
          db
            .prepare(
              "UPDATE bookings SET status='cancelled' WHERE ride_id=? AND status IN ('pending','accepted','ready') AND EXISTS(SELECT 1 FROM rides WHERE id=? AND status='cancelled')",
            )
            .bind(r.id, r.id),
        ]);
        if (!results[0].meta.changes)
          fail(409, "Vožnja je već završena ili otkazana.");
        return json({ ok: true });
      }
      if (action === "request" && method === "POST") {
        if (r.driver_id === user.id)
          fail(400, "Ne možeš tražiti vlastitu vožnju.");
        if (r.status !== "open" || r.departure <= Date.now())
          fail(409, "Ova vožnja više nije dostupna.");
        const existing = await db
          .prepare("SELECT id FROM bookings WHERE ride_id=? AND passenger_id=?")
          .bind(r.id, user.id)
          .first();
        if (existing) fail(409, "Za ovu vožnju već postoji tvoj zahtjev.");
        const id = crypto.randomUUID();
        await db
          .prepare(
            "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) SELECT ?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM rides WHERE id=? AND status='open' AND departure>?)",
          )
          .bind(id, r.id, user.id, Date.now(), r.id, Date.now())
          .run();
        const b = await readBooking(db, id);
        if (!b) fail(409, "Vožnja više nije dostupna.");
        return json(
          {
            booking: {
              id,
              status: "pending",
              ride: rideView(r),
              passenger: publicUser(user),
            },
          },
          201,
        );
      }
    }
    const bm = path.match(
      /^\/bookings\/([^/]+)\/(accept|decline|ready|complete|cancel)$/,
    );
    if (bm && method === "POST") {
      const b = await readBooking(db, bm[1]);
      if (!b) fail(404, "Dogovor nije pronađen.");
      const action = bm[2],
        isDriver = b.driver_id === user.id,
        isPassenger = b.passenger_id === user.id;
      if (!isDriver && !isPassenger) fail(403, "Ovaj dogovor nije tvoj.");
      if (["accept", "decline", "complete"].includes(action) && !isDriver)
        fail(403, "Ovu radnju potvrđuje vozač.");
      if (action === "ready" && !isPassenger)
        fail(403, "Spremnost potvrđuje putnik.");
      if (action === "accept") {
        if (
          b.status !== "pending" ||
          b.ride_status !== "open" ||
          b.departure <= Date.now()
        )
          fail(409, "Zahtjev više nije dostupan.");
        const results = await db.batch([
          db
            .prepare(
              "UPDATE bookings SET status='accepted' WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM rides WHERE id=? AND status='open' AND departure>?) AND NOT EXISTS(SELECT 1 FROM bookings WHERE ride_id=? AND status IN ('accepted','ready','completed'))",
            )
            .bind(b.id, b.ride_id, Date.now(), b.ride_id),
          db
            .prepare(
              "UPDATE rides SET status='matched' WHERE id=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='accepted')",
            )
            .bind(b.ride_id, b.id),
          db
            .prepare(
              "UPDATE bookings SET status='declined' WHERE ride_id=? AND id<>? AND status='pending' AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='accepted')",
            )
            .bind(b.ride_id, b.id, b.id),
        ]);
        if (!results[0].meta.changes) fail(409, "Mjesto je već zauzeto.");
      } else if (action === "decline") {
        const r = await db
          .prepare(
            "UPDATE bookings SET status='declined' WHERE id=? AND status='pending'",
          )
          .bind(b.id)
          .run();
        if (!r.meta.changes) fail(409, "Zahtjev više nije na čekanju.");
      } else if (action === "ready") {
        const r = await db
          .prepare(
            "UPDATE bookings SET status='ready' WHERE id=? AND status='accepted'",
          )
          .bind(b.id)
          .run();
        if (!r.meta.changes)
          fail(409, "Spremnost se može potvrditi samo za dogovorenu vožnju.");
      } else if (action === "complete") {
        if (!["accepted", "ready"].includes(b.status))
          fail(409, "Vožnja nije aktivna.");
        const results = await db.batch([
          db
            .prepare(
              "UPDATE bookings SET status='completed' WHERE id=? AND status IN ('accepted','ready') AND EXISTS(SELECT 1 FROM rides WHERE id=? AND status='matched')",
            )
            .bind(b.id, b.ride_id),
          db
            .prepare(
              "UPDATE rides SET status='completed' WHERE id=? AND status='matched' AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='completed')",
            )
            .bind(b.ride_id, b.id),
        ]);
        if (!results[0].meta.changes) fail(409, "Vožnja više nije aktivna.");
      } else {
        if (!["pending", "accepted", "ready"].includes(b.status))
          fail(409, "Dogovor više nije aktivan.");
        const results = await db.batch([
          db
            .prepare(
              "UPDATE bookings SET status='cancelled' WHERE id=? AND status IN ('pending','accepted','ready')",
            )
            .bind(b.id),
          db
            .prepare(
              "UPDATE rides SET status='open' WHERE id=? AND status='matched' AND NOT EXISTS(SELECT 1 FROM bookings WHERE ride_id=? AND status IN ('accepted','ready','completed'))",
            )
            .bind(b.ride_id, b.ride_id),
        ]);
        if (!results[0].meta.changes) fail(409, "Dogovor više nije aktivan.");
      }
      return json({ ok: true });
    }
    fail(404, "Stranica nije pronađena.");
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (/UNIQUE constraint failed/.test(error.message))
      return json(
        { error: "Ovaj zahtjev je već obrađen. Osvježi stranicu." },
        409,
      );
    console.error("API failure:", error.name);
    return json({ error: "Nešto nije uspjelo. Pokušaj ponovo." }, 500);
  }
}
