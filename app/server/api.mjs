import { ensureDemoMeetingStops } from "./demo-meeting-stops.mjs";
import {
  handleNotificationApi,
  acceptanceNotificationStatements,
  queuePushNotifications,
} from "./notifications.mjs";
import { demoDriverForRide } from "./demo-drivers.mjs";
import {
  proposeMeetingStops,
  previewMeetingRoute,
  consumeMeetingPreview,
} from "./meeting-stops.mjs";
import { handleSavedSearchApi } from "./saved-searches.mjs";
import {
  handleMeetingCatalogApi,
  isMeetingAdmin,
  registerMeetingPoint,
  resolveCatalogMeetingPoint,
  suggestMeetingPointsForRoute,
} from "./meeting-catalog.mjs";
import { normalizeLocation } from "./route-provider.mjs";
import { readDriverRoute } from "./route-shape.mjs";
import { corridorMatch } from "./corridor.mjs";
import { geocode, locateCity } from "./geocoding.mjs";
import { meetingAddress } from "./meeting-address.mjs";
import { suggestStreets } from "./street-suggestions.mjs";
import { handlePhotoApi } from "./photos.mjs";
import { validateVehicle, vehicleView, vehicleLabel } from "./vehicles.mjs";
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
const selfUser = (u, env = {}) => ({
  ...publicUser(u),
  email: u.email,
  city: u.city || "",
  provider: u.google_id ? "google" : "email",
  admin: isMeetingAdmin(u, env),
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
  const expires = Date.now() + 30 * 86400000;
  await env.DB.prepare("DELETE FROM sessions WHERE expires<?")
    .bind(Date.now())
    .run();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
    .bind(await hash(token), user.id, expires)
    .run();
  return `usput_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
// Linking is conditional: an existing Google identity is never overwritten.
async function linkGoogle(db, user, subject, retireLegacyCredentials = false) {
  await db.batch([
    db
      .prepare(
        "UPDATE users SET google_id=?,password=CASE WHEN ? THEN NULL ELSE password END,salt=CASE WHEN ? THEN NULL ELSE salt END WHERE id=? AND google_id IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE google_id=?)",
      )
      .bind(
        subject,
        retireLegacyCredentials ? 1 : 0,
        retireLegacyCredentials ? 1 : 0,
        user.id,
        subject,
      ),
    db
      .prepare(
        "DELETE FROM sessions WHERE user_id=? AND ?=1 AND changes()=1 AND EXISTS (SELECT 1 FROM users WHERE id=? AND google_id=?)",
      )
      .bind(user.id, retireLegacyCredentials ? 1 : 0, user.id, subject),
  ]);
  const linked = await db
    .prepare("SELECT * FROM users WHERE id=?")
    .bind(user.id)
    .first();
  if (linked?.google_id !== subject)
    fail(409, "Ovaj račun je već povezan s drugim Google računom.");
  return linked;
}
const rideView = (r) => ({
  id: r.id,
  demo: !!demoDriverForRide(r),
  from: r.from_json ? JSON.parse(r.from_json) : getPlace(r.from_id),
  to: r.to_json ? JSON.parse(r.to_json) : getPlace(r.to_id),
  date: r.date,
  time: r.time,
  departure: r.departure,
  car: r.car,
  note: r.note,
  seats: r.seats,
  seatsAvailable:
    r.status === "open" && r.departure > Date.now()
      ? Math.max(0, r.seats - r.confirmed_count)
      : 0,
  costSharing: r.cost_sharing === 1,
  geometry: r.route_json ? JSON.parse(r.route_json).coordinates : undefined,
  routeViaPoints: r.route_json ? JSON.parse(r.route_json).viaPoints || [] : [],
  routeProvider: r.route_json ? JSON.parse(r.route_json).provider : undefined,
  meetingStops: r.meeting_stops_json
    ? JSON.parse(r.meeting_stops_json)
    : undefined,
  status: r.status,
  driver: { id: r.driver_id, name: r.driver_name },
  createdAt: r.created_at,
});
const rideSelect =
  "SELECT r.*,u.name AS driver_name,(SELECT COUNT(*) FROM bookings b WHERE b.ride_id=r.id AND b.status IN ('accepted','ready','completed')) AS confirmed_count FROM rides r JOIN users u ON u.id=r.driver_id";
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
    if (path.startsWith("/photos/")) {
      const user = await session(request, env);
      if (!user) fail(401, "Prijavi se da nastaviš.");
      if (request.method !== "GET") await rateLimit(db, "photo:" + user.id, 20);
      return handlePhotoApi(request, env, user, path);
    }
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
      if (
        profile.email_verified !== true ||
        typeof profile.email !== "string" ||
        typeof profile.sub !== "string" ||
        !profile.sub ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)
      )
        fail(403, "Potreban je potvrđen Google email.");
      // Google login never silently creates an account: new users must confirm adult/terms via onboarding.
      let user = await db
        .prepare("SELECT * FROM users WHERE google_id=?")
        .bind(profile.sub)
        .first();
      const googleEmail = profile.email.trim().toLowerCase();
      let existingEmail = null;
      if (!user) {
        existingEmail = await db
          .prepare("SELECT * FROM users WHERE email=?")
          .bind(googleEmail)
          .first();
        if (existingEmail) {
          if (
            existingEmail.google_id &&
            existingEmail.google_id !== profile.sub
          )
            fail(409, "Ovaj račun je već povezan s drugim Google računom.");
          const domain = googleEmail.split("@")[1];
          // Google is authoritative for Gmail and its hosted Workspace domains.
          // A third-party address needs proof of the existing account once.
          const authoritative =
            ["gmail.com", "googlemail.com"].includes(domain) ||
            (typeof profile.hd === "string" &&
              profile.hd.toLowerCase() === domain);
          const current = await session(request, env);
          if (authoritative || current?.id === existingEmail.id)
            // Local email signups are unverified: do not retain unproven
            // passwords/sessions when Google first establishes ownership.
            user = await linkGoogle(
              db,
              existingEmail,
              profile.sub,
              current?.id !== existingEmail.id,
            );
        }
      }
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
              email: googleEmail,
              name: safeText(profile.name, 60),
              mode: existingEmail ? "link" : "enroll",
            }),
            "enroll",
            Date.now() + 600000,
          )
          .run();
        return new Response(null, {
          status: 302,
          headers: {
            Location:
              url.origin +
              (existingEmail ? "/?google=link" : "/?google=onboard"),
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
      if (p.mode === "link")
        fail(400, "Prijavi se postojećom lozinkom da povežeš Google račun.");
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
        city: safeText(body.city, 80),
      };
      if (u.city.length < 2) fail(400, "Unesi grad ili mjesto.");
      if (u.name.length < 2) fail(400, "Unesi ime od najmanje dva znaka.");
      await db.batch([
        db
          .prepare(
            "INSERT INTO users(id,name,email,google_id,city,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(u.id, u.name, u.email, u.google_id, u.city, Date.now()),
        db
          .prepare("DELETE FROM oauth_states WHERE id=?")
          .bind(await hash(token)),
      ]);
      return json({ user: selfUser(u, env) }, 201, {
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
        const name = safeText(body.name, 60),
          city = safeText(body.city, 80);
        if (city.length < 2) fail(400, "Unesi grad ili mjesto.");
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
          u = { id: crypto.randomUUID(), name, email, city };
        await db
          .prepare(
            "INSERT INTO users(id,name,email,password,salt,city,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            u.id,
            name,
            email,
            await passwordHash(password, salt),
            salt,
            city,
            Date.now(),
          )
          .run();
        return json({ user: selfUser(u, env) }, 201, {
          "Set-Cookie": await newSession(u, request, env),
        });
      }
      let u = await db
        .prepare("SELECT * FROM users WHERE email=?")
        .bind(email)
        .first();
      const candidate = await passwordHash(
        password,
        u?.salt || "dummy-constant-salt-for-invalid-users",
      );
      if (!u?.password || candidate !== u.password)
        fail(401, "Email ili lozinka nisu ispravni.");
      const pending = cookieValue(request, "usput_enroll");
      if (pending) {
        const state = await db
          .prepare(
            "SELECT * FROM oauth_states WHERE id=? AND redirect_uri=? AND expires>?",
          )
          .bind(await hash(pending), "enroll", Date.now())
          .first();
        if (state) {
          const identity = JSON.parse(state.verifier);
          if (identity.mode === "link" && identity.email === u.email) {
            u = await linkGoogle(db, u, identity.sub);
            await db
              .prepare("DELETE FROM oauth_states WHERE id=?")
              .bind(await hash(pending))
              .run();
          }
        }
      }
      return json({ user: selfUser(u, env) }, 200, {
        "Set-Cookie": await newSession(u, request, env),
      });
    }
    const user = await session(request, env);
    if (!user) fail(401, "Prijavi se da nastaviš.");
    if (path === "/auth/me" && method === "GET")
      return json({
        user: { ...selfUser(user, env), admin: isMeetingAdmin(user, env) },
      });
    if (path.startsWith("/notifications") || path.startsWith("/push/")) {
      if (method === "POST")
        await rateLimit(db, "notifications:" + user.id, 120);
      return handleNotificationApi(
        path,
        method,
        body,
        user,
        env,
        await hash(cookieValue(request, "usput_session") || ""),
      );
    }
    const savedResponse = await handleSavedSearchApi(
      path,
      method,
      body,
      user,
      env,
    );
    if (savedResponse) return savedResponse;
    const catalogResponse = await handleMeetingCatalogApi(
      path + url.search,
      method,
      body,
      user,
      env,
    );
    if (catalogResponse) return catalogResponse;
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
    if (path === "/vehicle" && method === "GET") {
      return json({
        vehicle: vehicleView(
          await db
            .prepare("SELECT * FROM vehicles WHERE user_id=?")
            .bind(user.id)
            .first(),
        ),
      });
    }
    if (path === "/vehicle" && method === "POST") {
      let v;
      try {
        v = validateVehicle(body);
      } catch (e) {
        fail(400, e.message);
      }
      await db
        .prepare(
          "INSERT INTO vehicles(id,user_id,make_id,make,model,color,manual_model,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET make_id=excluded.make_id,make=excluded.make,model=excluded.model,color=excluded.color,manual_model=excluded.manual_model,updated_at=excluded.updated_at",
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          v.makeId,
          v.make,
          v.model,
          v.color,
          v.manualModel ? 1 : 0,
          Date.now(),
          Date.now(),
        )
        .run();
      return json({
        vehicle: vehicleView(
          await db
            .prepare("SELECT * FROM vehicles WHERE user_id=?")
            .bind(user.id)
            .first(),
        ),
      });
    }
    if (path === "/profile" && method === "POST") {
      const name = safeText(body.name, 60);
      if (name.length < 2) fail(400, "Unesi ime od najmanje dva znaka.");
      const city =
        body.city === undefined ? user.city || "" : safeText(body.city, 80);
      if (body.city !== undefined && city.length < 2)
        fail(400, "Unesi grad ili mjesto.");
      await db
        .prepare("UPDATE users SET name=?,city=? WHERE id=?")
        .bind(name, city, user.id)
        .run();
      return json({ user: selfUser({ ...user, name, city }, env) });
    }
    if (path === "/routes/preview" && method === "POST") {
      const from = normalizeLocation(body.fromLocation) || getPlace(body.from),
        to = normalizeLocation(body.toLocation) || getPlace(body.to);
      if (!from || !to) fail(400, "Potvrdi polazište i odredište.");
      // Automatic point/text edits need more headroom than manual calculation.
      // Unchanged coordinates reuse the routing cache; the user budget remains bounded.
      await rateLimit(db, "route-preview:" + user.id, 120);
      if (body.meetingStops) {
        try {
          return json(
            await previewMeetingRoute(
              env,
              user.id,
              from,
              to,
              body.meetingStops,
              body.routeViaPoints,
            ),
          );
        } catch (e) {
          fail(e instanceof TypeError ? 400 : 503, e.message);
        }
      }
      let route;
      try {
        route = await readDriverRoute(
          env,
          from,
          to,
          body.routeViaPoints === undefined ? [] : body.routeViaPoints,
        );
      } catch (e) {
        fail(e instanceof TypeError ? 400 : 503, e.message);
      }
      if (!route || route.unreachable)
        fail(
          503,
          "Cestovni proračun trenutno nije dostupan. Rutu još nije moguće potvrditi.",
        );
      const catalogSuggestions = await suggestMeetingPointsForRoute(
        env,
        route.coordinates,
      );
      return json({
        route,
        from,
        to,
        meetingStops: proposeMeetingStops(route, from, to),
        routeViaPoints: route.viaPoints,
        catalogSuggestions,
      });
    }
    if (path === "/locations/city" && method === "POST") {
      await rateLimit(db, "geocode:" + user.id, 20);
      let scope;
      try {
        scope = await locateCity(env, body);
      } catch (e) {
        if (e instanceof TypeError) fail(400, e.message);
        throw e;
      }
      if (!scope || !scope.city)
        fail(503, "Grad nije prepoznat. Upiši grad ručno.");
      return json(scope);
    }
    if (path === "/places/label" && method === "GET") {
      const coordinates = url.searchParams;
      if (coordinates.getAll("lat").length !== 1 || coordinates.getAll("lng").length !== 1)
        fail(400, "Lokacija nije ispravna.");
      await rateLimit(db, "meeting-label:" + user.id, 120);
      let address;
      try {
        address = await meetingAddress(env, {
          lat: coordinates.get("lat"), lng: coordinates.get("lng"),
        });
      } catch (e) {
        if (e instanceof TypeError) fail(400, e.message);
        throw e;
      }
      if (!address) fail(503, "Ulica uz pin trenutno nije dostupna.");
      return json({ ...address, attribution: "© OpenStreetMap contributors · Nominatim" });
    }
    if (path === "/locations/suggest" && method === "POST") {
      await rateLimit(db, "autocomplete:" + user.id, 90);
      let result;
      try {
        result = await suggestStreets(env, body.query, body.scope);
      } catch (e) {
        if (e instanceof TypeError) fail(400, e.message);
        throw e;
      }
      if (result === null)
        fail(
          503,
          "Prijedlozi ulica trenutno nisu dostupni. Pokušaj pretragu ili odaberi pin na karti.",
        );
      return json({
        ...result,
        attribution: "© OpenStreetMap contributors · Photon",
      });
    }
    if (path === "/locations/search" && method === "POST") {
      await rateLimit(db, "geocode:" + user.id, 20);
      let locations;
      try {
        locations = await geocode(env, body.query, body.scope);
      } catch (e) {
        if (e instanceof TypeError) fail(400, e.message);
        throw e;
      }
      if (locations === null)
        fail(
          503,
          "Pretraga adresa trenutno nije dostupna. Pokušaj ponovo kasnije.",
        );
      return json({
        locations,
        attribution: "© OpenStreetMap contributors · Nominatim",
      });
    }
    if (path === "/rides" && method === "POST") {
      const seats = body.seats === undefined ? 1 : body.seats;
      if (!Number.isInteger(seats) || seats < 1 || seats > 7)
        fail(400, "Odaberi između 1 i 7 slobodnih mjesta za putnike.");
      if (
        body.costSharing !== undefined &&
        typeof body.costSharing !== "boolean"
      )
        fail(400, "Označi da ili ne za dijeljenje troškova.");
      let savedVehicle = null;
      if (body.vehicleId !== undefined) {
        if (typeof body.vehicleId !== "string")
          fail(400, "Odaberi vozilo iz svog profila.");
        savedVehicle = await db
          .prepare("SELECT * FROM vehicles WHERE id=? AND user_id=?")
          .bind(body.vehicleId, user.id)
          .first();
        if (!savedVehicle)
          fail(403, "Odabrano vozilo ne pripada tvom profilu.");
      }
      const fromLocation = normalizeLocation(body.fromLocation),
        toLocation = normalizeLocation(body.toLocation);
      if (
        (body.fromLocation && !fromLocation) ||
        (body.toLocation && !toLocation)
      )
        fail(400, "Potvrdi ispravne lokacije na karti.");
      const from = fromLocation?.id || safeText(body.from, 30),
        to = toLocation?.id || safeText(body.to, 30),
        date = safeText(body.date, 10),
        time = safeText(body.time, 5),
        car = savedVehicle
          ? vehicleLabel(savedVehicle)
          : safeText(body.car, 80),
        note = safeText(body.note, 280),
        departure = departureMs(date, time);
      if (
        !(fromLocation || getPlace(from)) ||
        !(toLocation || getPlace(to)) ||
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
      let confirmedRoute = null,
        meetingStops = null;
      await rateLimit(db, "publish:" + user.id, 20);
      if (body.meetingStops) {
        if (
          !Array.isArray(body.meetingStops) ||
          body.meetingStops.some((p) => !p || typeof p !== "object")
        )
          fail(400, "Potvrdi između 2 i 10 mjesta ulaska i izlaska.");
        if (body.stopsConfirmed !== true || body.routeConfirmed !== true)
          fail(400, "Potvrdi mjesta na kojima možeš stati i konačnu trasu.");
        let preview;
        try {
          preview = await consumeMeetingPreview(
            env,
            user.id,
            body.previewToken,
            fromLocation || getPlace(from),
            toLocation || getPlace(to),
            body.meetingStops,
            body.routeViaPoints,
          );
        } catch (e) {
          fail(400, e.message);
        }
        confirmedRoute = preview.route;
        meetingStops = preview.meetingStops;
        for (let i = 0; i < meetingStops.length; i++) {
          const stop = meetingStops[i];
          const linked = stop.catalogId
            ? await resolveCatalogMeetingPoint(env, stop)
            : null;
          if (stop.catalogId && !linked)
            fail(
              400,
              "Odabrano mjesto iz baze se promijenilo. Odaberi ga ponovo.",
            );
          const registered =
            body.shareMeetingPoints === true &&
            !stop.automaticName &&
            !/^Mjesto susreta \d+$/.test(stop.name)
              ? await registerMeetingPoint(env, user, stop)
              : linked;
          if (registered?.catalogId)
            meetingStops[i] = { ...stop, catalogId: registered.catalogId };
          else {
            delete meetingStops[i].catalogId;
          }
        }
      } else {
        fail(400, "Prvo odaberi i potvrdi mjesta susreta na svojoj trasi.");
      }
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,note,cost_sharing,seats,from_json,to_json,route_json,meeting_stops_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
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
          body.costSharing === true ? 1 : 0,
          seats,
          fromLocation ? JSON.stringify(fromLocation) : null,
          toLocation ? JSON.stringify(toLocation) : null,
          confirmedRoute ? JSON.stringify(confirmedRoute) : null,
          meetingStops ? JSON.stringify(meetingStops) : null,
          Date.now(),
        )
        .run();
      return json({ ride: rideView(await readRide(db, id)) }, 201);
    }
    if (
      (path === "/rides" && method === "GET") ||
      (path === "/rides/search" && method === "POST")
    ) {
      const q =
        method === "POST"
          ? new URLSearchParams(
              Object.fromEntries(
                Object.entries(body).filter(([, v]) => typeof v === "string"),
              ),
            )
          : url.searchParams;
      const wanted = departureMs(q.get("date"), q.get("time"));
      if (
        q.has("walkMinutes") ||
        q.has("fromLocation") ||
        q.has("toLocation")
      ) {
        const start =
            normalizeLocation(q.get("fromLocation")) || getPlace(q.get("from")),
          end = normalizeLocation(q.get("toLocation")) || getPlace(q.get("to")),
          minutes = Number(q.get("walkMinutes"));
        if (
          !start ||
          !end ||
          ![5, 10, 15].includes(minutes) ||
          !Number.isFinite(wanted)
        )
          fail(400, "Potvrdi lokacije i odaberi 5, 10 ili 15 minuta hodanja.");
        const candidates = (
          await db
            .prepare(
              rideSelect +
                " WHERE r.status='open' AND r.departure>? AND r.driver_id<>? AND r.date=? AND r.departure<=? ORDER BY r.departure",
            )
            .bind(Date.now(), user.id, q.get("date"), wanted + 3600000)
            .all()
        ).results;
        await rateLimit(db, "corridor-search:" + user.id, 20);
        const routingEnv = { ...env, ROUTING_DEADLINE: Date.now() + 18000 };
        let unavailable = false;
        const found = [];
        for (const row of candidates) {
          await ensureDemoMeetingStops(routingEnv, row);
          const ride = {
              ...rideView(row),
              route: row.route_json ? JSON.parse(row.route_json) : null,
            },
            match = await corridorMatch(
              routingEnv,
              ride,
              start,
              end,
              wanted,
              minutes,
              {
                pickupStopId: q.get("pickupStopId"),
                dropoffStopId: q.get("dropoffStopId"),
              },
            );
          if (match?.unavailable) {
            unavailable = true;
            if (
              start.id === ride.from.id &&
              end.id === ride.to.id &&
              Math.abs(ride.departure - wanted) <= 3600000
            )
              found.push(rideView(row));
            continue;
          }
          if (match) found.push({ ...rideView(row), match });
        }
        return json({
          rides: found
            .sort(
              (a, b) => (a.match?.score ?? 10000) - (b.match?.score ?? 10000),
            )
            .slice(0, 60),
          routingUnavailable: unavailable,
        });
      }
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
            "SELECT b.*,br.match_json,u.name AS passenger_name FROM bookings b JOIN users u ON u.id=b.passenger_id JOIN rides r ON r.id=b.ride_id LEFT JOIN booking_routes br ON br.booking_id=b.id WHERE b.passenger_id=? OR r.driver_id=? ORDER BY b.created_at DESC LIMIT 200",
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
          match: b.match_json ? JSON.parse(b.match_json) : undefined,
          ride: rideView(r),
        });
      }
      return json({ rides: rides.map(rideView), bookings });
    }
    const rideMatch = path.match(/^\/rides\/([^/]+)(?:\/(request|cancel))?$/);
    if (rideMatch) {
      const r = await readRide(db, rideMatch[1]);
      if (!r) fail(404, "Vožnja nije pronađena.");
      await ensureDemoMeetingStops(env, r);
      const action = rideMatch[2];
      if (!action && method === "GET") {
        const q = url.searchParams,
          wanted = departureMs(q.get("date"), q.get("time"));
        let match,
          resultUnavailable = false;
        if (q.has("walkMinutes")) {
          const start =
              normalizeLocation(q.get("fromLocation")) ||
              getPlace(q.get("from")),
            end =
              normalizeLocation(q.get("toLocation")) || getPlace(q.get("to"));
          if (start && end && Number.isFinite(wanted)) {
            const result = await corridorMatch(
              env,
              {
                ...rideView(r),
                route: r.route_json ? JSON.parse(r.route_json) : null,
              },
              start,
              end,
              wanted,
              Number(q.get("walkMinutes")),
              {
                pickupStopId: q.get("pickupStopId"),
                dropoffStopId: q.get("dropoffStopId"),
              },
            );
            match = result?.unavailable ? null : result;
            resultUnavailable = !!result?.unavailable;
          }
          return json({
            ride: {
              ...rideView(r),
              match,
              routingUnavailable: resultUnavailable,
            },
          });
        }
        return json({ ride: { ...rideView(r), match } });
      }
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
        if (
          r.status !== "open" ||
          r.departure <= Date.now() ||
          r.confirmed_count >= r.seats
        )
          fail(409, "Ova vožnja više nije dostupna.");
        if (
          r.meeting_stops_json &&
          (!body.search ||
            ![5, 10, 15].includes(Number(body.search.walkMinutes)))
        )
          fail(400, "Odaberi ulazak i izlazak kroz pretragu vožnje.");
        let routeMatch = null;
        if (body.search) {
          const q = body.search,
            wanted = departureMs(q.date, q.time);
          if (
            !(normalizeLocation(q.fromLocation) || getPlace(q.from)) ||
            !(normalizeLocation(q.toLocation) || getPlace(q.to)) ||
            !Number.isFinite(wanted) ||
            q.date !== r.date
          )
            fail(400, "Pretraga rute nije ispravna.");
          if (q.walkMinutes) {
            const result = await corridorMatch(
              env,
              {
                ...rideView(r),
                route: r.route_json ? JSON.parse(r.route_json) : null,
              },
              normalizeLocation(q.fromLocation) || getPlace(q.from),
              normalizeLocation(q.toLocation) || getPlace(q.to),
              wanted,
              Number(q.walkMinutes),
              { pickupStopId: q.pickupStopId, dropoffStopId: q.dropoffStopId },
            );
            if (result?.unavailable)
              fail(
                503,
                "Cestovni ili pješački proračun trenutno nije dostupan. Ponovi pretragu.",
              );
            routeMatch = result;
            if (!routeMatch)
              fail(
                409,
                "Ruta ili dozvoljeno hodanje se ne podudaraju. Ponovi pretragu.",
              );
          }
          if (!routeMatch && (q.from !== r.from_id || q.to !== r.to_id))
            fail(409, "Ovu rutu sada ne možemo potvrditi. Ponovi pretragu.");
        }
        const existing = await db
          .prepare("SELECT id FROM bookings WHERE ride_id=? AND passenger_id=?")
          .bind(r.id, user.id)
          .first();
        if (existing) fail(409, "Za ovu vožnju već postoji tvoj zahtjev.");
        const id = crypto.randomUUID();
        const inserts = [
          db
            .prepare(
              "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) SELECT ?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM rides r WHERE r.id=? AND r.status='open' AND r.departure>? AND (SELECT COUNT(*) FROM bookings b WHERE b.ride_id=r.id AND b.status IN ('accepted','ready','completed'))<r.seats)",
            )
            .bind(id, r.id, user.id, Date.now(), r.id, Date.now()),
        ];
        if (routeMatch)
          inserts.push(
            db
              .prepare(
                "INSERT INTO booking_routes(booking_id,match_json) SELECT ?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=?)",
              )
              .bind(id, JSON.stringify(routeMatch), id),
          );
        await db.batch(inserts);
        const b = await readBooking(db, id);
        if (!b) fail(409, "Vožnja više nije dostupna.");
        return json(
          {
            booking: {
              id,
              status: "pending",
              ride: rideView(await readRide(db, r.id)),
              passenger: publicUser(user),
              match: routeMatch,
            },
          },
          201,
        );
      }
    }
    const bm = path.match(
      /^\/bookings\/([^/]+)\/(accept|simulate-accept|decline|ready|complete|cancel)$/,
    );
    if (bm && method === "POST") {
      const b = await readBooking(db, bm[1]);
      if (!b) fail(404, "Dogovor nije pronađen.");
      const simulation = bm[2] === "simulate-accept",
        action = simulation ? "accept" : bm[2],
        isDriver = b.driver_id === user.id,
        isPassenger = b.passenger_id === user.id;
      if (!isDriver && !isPassenger) fail(403, "Ovaj dogovor nije tvoj.");
      if (
        simulation &&
        (!isPassenger ||
          !demoDriverForRide({ id: b.ride_id, driver_id: b.driver_id }))
      )
        fail(403, "Simulacija je dostupna samo putniku te demo vožnje.");
      if (
        ["accept", "decline", "complete"].includes(action) &&
        !isDriver &&
        !simulation
      )
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
              "UPDATE bookings SET status='accepted' WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM rides r WHERE r.id=? AND r.status='open' AND r.departure>? AND (SELECT COUNT(*) FROM bookings b WHERE b.ride_id=r.id AND b.status IN ('accepted','ready','completed'))<r.seats)",
            )
            .bind(b.id, b.ride_id, Date.now()),
          db
            .prepare(
              "UPDATE rides SET status='matched' WHERE id=? AND status='open' AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='accepted') AND (SELECT COUNT(*) FROM bookings WHERE ride_id=? AND status IN ('accepted','ready','completed'))>=seats",
            )
            .bind(b.ride_id, b.id, b.ride_id),
          db
            .prepare(
              "UPDATE bookings SET status='declined' WHERE ride_id=? AND id<>? AND status='pending' AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='accepted') AND EXISTS(SELECT 1 FROM rides WHERE id=? AND status='matched')",
            )
            .bind(b.ride_id, b.id, b.id, b.ride_id),
          ...acceptanceNotificationStatements(db, b),
        ]);
        if (!results[0].meta.changes) fail(409, "Mjesto je već zauzeto.");
        await queuePushNotifications(env);
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
              "UPDATE bookings SET status='completed' WHERE id=? AND status IN ('accepted','ready') AND EXISTS(SELECT 1 FROM rides WHERE id=? AND status IN ('open','matched'))",
            )
            .bind(b.id, b.ride_id),
          db
            .prepare(
              "UPDATE rides SET status=CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE ride_id=? AND status IN ('accepted','ready')) THEN 'matched' ELSE 'completed' END WHERE id=? AND status IN ('open','matched') AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='completed')",
            )
            .bind(b.ride_id, b.ride_id, b.id),
          db
            .prepare(
              "UPDATE bookings SET status='declined' WHERE ride_id=? AND status='pending' AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='completed') AND EXISTS(SELECT 1 FROM rides WHERE id=? AND status IN ('matched','completed'))",
            )
            .bind(b.ride_id, b.id, b.ride_id),
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
              "UPDATE rides SET status='open' WHERE id=? AND status='matched' AND departure>? AND NOT EXISTS(SELECT 1 FROM bookings WHERE ride_id=? AND status='completed') AND (SELECT COUNT(*) FROM bookings WHERE ride_id=? AND status IN ('accepted','ready','completed'))<seats",
            )
            .bind(b.ride_id, Date.now(), b.ride_id, b.ride_id),
          db
            .prepare(
              "UPDATE rides SET status='completed' WHERE id=? AND status='matched' AND EXISTS(SELECT 1 FROM bookings WHERE ride_id=? AND status='completed') AND NOT EXISTS(SELECT 1 FROM bookings WHERE ride_id=? AND status IN ('accepted','ready'))",
            )
            .bind(b.ride_id, b.ride_id, b.ride_id),
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
