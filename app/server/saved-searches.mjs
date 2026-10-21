import { normalizeLocation } from "./route-provider.mjs";
import { getPlace } from "./places.mjs";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });

function endpoint(query, which) {
  const raw = query[which + "Location"];
  const legacy = getPlace(query[which]);
  if (raw === undefined || raw === null || raw === "") return legacy;
  const location = normalizeLocation(raw);
  if (!location || location.name.length < 2) return null;
  // A reloaded legacy snapshot retains its stable ID while its saved coordinates
  // remain authoritative. Display-name changes do not create another card.
  return legacy && legacy.lat === location.lat && legacy.lng === location.lng
    ? {
        ...location,
        id: legacy.id,
        ...(legacy.kind ? { kind: legacy.kind } : {}),
      }
    : location;
}

function normalizeQuery(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const from = endpoint(raw, "from"),
    to = endpoint(raw, "to");
  if (!from || !to || (from.lat === to.lat && from.lng === to.lng)) return null;
  if (
    typeof raw.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)
  )
    return null;
  const walkMinutes =
    typeof raw.walkMinutes === "string" || typeof raw.walkMinutes === "number"
      ? String(raw.walkMinutes)
      : "";
  if (!["5", "10", "15"].includes(walkMinutes)) return null;
  return {
    from: from.id,
    to: to.id,
    fromLocation: JSON.stringify(from),
    toLocation: JSON.stringify(to),
    time: raw.time,
    walkMinutes,
  };
}

async function fingerprint(query) {
  // All endpoints, including legacy IDs, share normalized coordinate identities.
  // Neither a calendar date nor a change of display label changes that identity.
  const identity = (raw) => {
    const p = normalizeLocation(raw);
    return [p.id, p.lat, p.lng];
  };
  const key = JSON.stringify([
    identity(query.fromLocation),
    identity(query.toLocation),
    query.time,
    query.walkMinutes,
  ]);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

const view = (row) => ({
  id: row.id,
  query: JSON.parse(row.query_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function handleSavedSearchApi(path, method, body, user, env) {
  const item = path.match(/^\/saved-searches\/([^/]+)$/);
  if (path !== "/saved-searches" && !item) return null;
  if (!user?.id) return json({ error: "Prijavi se da nastaviš." }, 401);
  const db = env.DB;
  if (path === "/saved-searches" && method === "GET") {
    const rows = await db
      .prepare(
        "SELECT * FROM saved_searches WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 30",
      )
      .bind(user.id)
      .all();
    return json({ searches: rows.results.map(view) });
  }
  if (path === "/saved-searches" && method === "POST") {
    const query = normalizeQuery(body?.query);
    if (!query)
      return json(
        {
          error:
            "Potvrdi različito polazište i odredište, vrijeme i 5, 10 ili 15 minuta hodanja.",
        },
        400,
      );
    const key = await fingerprint(query),
      now = Date.now();
    await db.batch([
      db
        .prepare(
          "INSERT INTO saved_searches(id,user_id,fingerprint,query_json,created_at,updated_at) VALUES(?,?,?,?,?,MAX(?,COALESCE((SELECT MAX(updated_at)+1 FROM saved_searches WHERE user_id=?),0))) ON CONFLICT(user_id,fingerprint) DO UPDATE SET query_json=excluded.query_json,updated_at=excluded.updated_at",
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          key,
          JSON.stringify(query),
          now,
          now,
          user.id,
        ),
      db
        .prepare(
          "DELETE FROM saved_searches WHERE user_id=? AND id NOT IN (SELECT id FROM saved_searches WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 30)",
        )
        .bind(user.id, user.id),
    ]);
    const row = await db
      .prepare("SELECT * FROM saved_searches WHERE user_id=? AND fingerprint=?")
      .bind(user.id, key)
      .first();
    return json({ search: view(row) });
  }
  if (item && method === "DELETE") {
    const result = await db
      .prepare("DELETE FROM saved_searches WHERE id=? AND user_id=?")
      .bind(item[1], user.id)
      .run();
    if (!result.meta.changes)
      return json({ error: "Sačuvana pretraga nije pronađena." }, 404);
    return json({ ok: true });
  }
  return json({ error: "Metoda nije dozvoljena." }, 405, {
    Allow: item ? "DELETE" : "GET, POST",
  });
}
