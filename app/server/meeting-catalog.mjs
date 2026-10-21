import { projectOnRoute } from "./corridor.mjs";

// The catalogue identifies opt-in public stopping points. Driver confirmations,
// ride snapshots and booking_routes remain owned by the ride workflow.
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
class CatalogError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new CatalogError(status, message);
};
const text = (value, max = 160) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const fold = (value) =>
  text(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim();
// A local, explicit place-name inflection; roadside and approach use strict
// normalization and are never inferred from a landmark name.
const nameKey = (value) =>
  fold(value)
    .replace(/^kod\s+/, "")
    .replace(/\balte\b/g, "alta");
const aliasesOf = (values) => [
  ...new Set(values.map((a) => text(a)).filter(Boolean)),
];
const availabilityValues = new Set(["candidate", "active", "inactive"]);
function distance(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(a.lat - b.lat),
    dLng = rad(a.lng - b.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isMeetingAdmin(user, env) {
  if (!user?.id || !user.google_id || !user.email) return false;
  const allowed = String(env?.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email.trim().toLowerCase());
}

function pointInput(value, fallback = null) {
  const source = fallback ? { ...fallback, ...value } : value;
  if (!source || typeof source !== "object" || Array.isArray(source))
    fail(400, "Podaci mjesta nisu ispravni.");
  const point = {
    name: text(source.name),
    city: text(source.city, 100),
    lat: source.lat,
    lng: source.lng,
    detail: text(source.detail, 600),
    approach: text(source.approach, 160),
    side: text(source.side, 100),
  };
  if (
    point.name.length < 2 ||
    point.city.length < 2 ||
    !fold(point.city) ||
    !nameKey(point.name) ||
    typeof point.lat !== "number" ||
    !Number.isFinite(point.lat) ||
    Math.abs(point.lat) > 90 ||
    typeof point.lng !== "number" ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lng) > 180
  )
    fail(400, "Unesi naziv, grad i ispravan pin mjesta.");
  return point;
}

function canonicalId(graph, id) {
  const seen = new Set();
  while (id) {
    if (seen.has(id)) return null;
    seen.add(id);
    const row = graph.byId.get(id);
    if (!row) return null;
    if (!row.redirect_id) return id;
    id = row.redirect_id;
  }
  return null;
}
function members(graph, id) {
  return graph.rows.filter((point) => canonicalId(graph, point.id) === id);
}
function names(graph, row, includeMerged = true) {
  const rows =
    includeMerged && !row.redirect_id ? members(graph, row.id) : [row];
  return aliasesOf(
    rows.flatMap((p) => [p.name, ...(graph.aliases.get(p.id) || [])]),
  );
}
function sharesName(graph, row, values) {
  const keys = new Set(names(graph, row).map(nameKey));
  return values.some((value) => keys.has(nameKey(value)));
}
function feedbackStats(rows) {
  const latest = new Map(),
    recent = new Map(),
    bookings = new Set();
  const since = Date.now() - 90 * 86400000;
  let lastAt = null;
  for (const row of rows) {
    bookings.add(row.booking_id);
    lastAt = Math.max(lastAt || 0, row.updated_at);
    // Stable tie-breaking for votes submitted in the same millisecond.
    if (
      !latest.has(row.user_id) ||
      latest.get(row.user_id).updated_at <= row.updated_at
    )
      latest.set(row.user_id, row);
    if (
      row.updated_at >= since &&
      (!recent.has(row.user_id) ||
        recent.get(row.user_id).updated_at <= row.updated_at)
    )
      recent.set(row.user_id, row);
  }
  const positive = (map) =>
    [...map.values()].filter((row) => row.rating === 1).length;
  return {
    participants: latest.size,
    completedBookings: bookings.size,
    positive: positive(latest),
    negative: latest.size - positive(latest),
    lastAt,
    recentParticipants: recent.size,
    recentPositive: positive(recent),
    recentNegative: recent.size - positive(recent),
  };
}
async function readGraph(env, cityKey = "") {
  const where = cityKey ? " WHERE city_key=?" : "";
  const bind = (statement) => (cityKey ? statement.bind(cityKey) : statement);
  const [points, aliases, feedback] = await Promise.all([
    bind(env.DB.prepare("SELECT * FROM meeting_points" + where)).all(),
    bind(
      env.DB.prepare(
        "SELECT a.* FROM meeting_point_aliases a JOIN meeting_points p ON p.id=a.point_id" +
          (cityKey ? " WHERE p.city_key=?" : ""),
      ),
    ).all(),
    bind(
      env.DB.prepare(
        "SELECT f.* FROM meeting_point_feedback f JOIN meeting_points p ON p.id=f.point_id JOIN bookings b ON b.id=f.booking_id WHERE b.status='completed'" +
          (cityKey ? " AND p.city_key=?" : "") +
          " ORDER BY f.updated_at,f.created_at,f.booking_id,f.point_id",
      ),
    ).all(),
  ]);
  const graph = {
    rows: points.results,
    byId: new Map(),
    aliases: new Map(),
    feedback: feedback.results,
  };
  for (const row of graph.rows) graph.byId.set(row.id, row);
  for (const row of aliases.results)
    graph.aliases.set(row.point_id, [
      ...(graph.aliases.get(row.point_id) || []),
      row.alias,
    ]);
  return graph;
}
function pointView(row, graph, admin = false) {
  const root = canonicalId(graph, row.id);
  const feedback = row.redirect_id
    ? graph.feedback.filter((f) => f.point_id === row.id)
    : graph.feedback.filter((f) => canonicalId(graph, f.point_id) === root);
  return {
    id: row.id,
    catalogId: root,
    name: row.name,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    detail: row.detail,
    approach: row.approach || undefined,
    side: row.side || undefined,
    aliases: names(graph, row),
    availability: row.availability,
    feedback: feedbackStats(feedback),
    updatedAt: row.updated_at,
    ...(admin
      ? {
          version: row.version,
          redirectId: row.redirect_id,
          source: row.source,
          createdAt: row.created_at,
        }
      : {}),
  };
}
async function readPointView(env, id, admin = false) {
  const row = await env.DB.prepare("SELECT * FROM meeting_points WHERE id=?")
    .bind(id)
    .first();
  if (!row) fail(404, "Mjesto nije pronađeno.");
  const graph = await readGraph(env, row.city_key);
  return pointView(graph.byId.get(id), graph, admin);
}

async function insertPoint(
  env,
  user,
  point,
  { availability = "candidate", aliases = [], source = "editor" } = {},
) {
  if (!availabilityValues.has(availability))
    fail(400, "Status mjesta nije ispravan.");
  if (
    !Array.isArray(aliases) ||
    aliases.length > 30 ||
    aliases.some((a) => typeof a !== "string")
  )
    fail(400, "Dodaj najviše 30 naziva mjesta.");
  const id = crypto.randomUUID(),
    revision = crypto.randomUUID(),
    now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO meeting_points(id,name,city,city_key,lat,lng,detail,approach,side,availability,source,created_by,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      point.name,
      point.city,
      fold(point.city),
      point.lat,
      point.lng,
      point.detail,
      point.approach,
      point.side,
      availability,
      source,
      user.id,
      revision,
      now,
      now,
    ),
    ...aliasesOf([point.name, ...aliases]).map((alias) =>
      env.DB.prepare(
        "INSERT INTO meeting_point_aliases(point_id,alias,normalized) VALUES(?,?,?)",
      ).bind(id, alias, nameKey(alias)),
    ),
  ]);
  return id;
}

/** Validate a selected public identity without creating a contribution.
 * Returns the unchanged supplied snapshot with canonical catalogId, or null for
 * inactive/unknown IDs, another city, a pin >5m away, or conflicting metadata.
 */
export async function resolveCatalogMeetingPoint(env, point) {
  if (!point || typeof point.catalogId !== "string") return null;
  let input;
  try {
    input = pointInput(point);
  } catch (error) {
    if (error instanceof CatalogError) return null;
    throw error;
  }
  const graph = await readGraph(env, fold(input.city));
  const original = graph.byId.get(point.catalogId),
    root = graph.byId.get(canonicalId(graph, point.catalogId));
  if (
    !original ||
    !root ||
    root.availability !== "active" ||
    distance(input, original) > 5 ||
    !sharesName(graph, original, [input.name]) ||
    fold(input.side) !== fold(original.side) ||
    fold(input.approach) !== fold(original.approach)
  )
    return null;
  return { ...point, catalogId: root.id };
}

/** Call only after the driver explicitly opts into public catalogue sharing.
 * New points remain review candidates; this function never activates one.
 */
export async function registerMeetingPoint(env, user, point) {
  if (!user?.id) fail(401, "Prijavi se da nastaviš.");
  const input = pointInput(point);
  const selected = await resolveCatalogMeetingPoint(env, point);
  if (selected) return selected;
  const graph = await readGraph(env, fold(input.city));
  const same = graph.rows.find(
    (row) =>
      !row.redirect_id &&
      row.availability !== "inactive" &&
      distance(input, row) <= 20 &&
      sharesName(graph, row, [input.name]) &&
      !!fold(input.approach) &&
      !!fold(input.side) &&
      fold(row.approach) === fold(input.approach) &&
      fold(row.side) === fold(input.side),
  );
  const catalogId =
    same?.id ||
    (await insertPoint(env, user, input, { source: "contribution" }));
  if (same)
    await env.DB.prepare(
      "INSERT OR IGNORE INTO meeting_point_aliases(point_id,alias,normalized) VALUES(?,?,?)",
    )
      .bind(same.id, input.name, nameKey(input.name))
      .run();
  return { ...point, ...input, catalogId };
}

/** Public catalogue suggestions only; a driver must still choose and confirm
 * stops and preview the resulting route. Proximity makes no stopping claim.
 */
export async function suggestMeetingPointsForRoute(
  env,
  coordinates,
  limit = 8,
) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.some(
      (p) =>
        !Array.isArray(p) ||
        typeof p[0] !== "number" ||
        typeof p[1] !== "number" ||
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1]) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    )
  )
    return [];
  const count = Number.isFinite(limit)
    ? Math.max(0, Math.min(20, Math.floor(limit)))
    : 8;
  if (!count) return [];
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;
  for (const [lng, lat] of coordinates) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  const latMargin = 250 / 111195;
  const lngMargin =
    latMargin /
    Math.max(
      0.000001,
      Math.cos((Math.max(Math.abs(minLat), Math.abs(maxLat)) * Math.PI) / 180),
    );
  // Route bounds, rather than a user's chosen city, admit points on a route
  // through several municipalities. Projection excludes empty bbox corners.
  const graph = await readGraph(env);
  return graph.rows
    .filter(
      (p) =>
        !p.redirect_id &&
        p.availability === "active" &&
        p.lat >= minLat - latMargin &&
        p.lat <= maxLat + latMargin &&
        p.lng >= minLng - lngMargin &&
        p.lng <= maxLng + lngMargin,
    )
    .map((point) => ({ point, projection: projectOnRoute(point, coordinates) }))
    .filter((item) => item.projection && item.projection.distance <= 250)
    .sort(
      (a, b) =>
        a.projection.along - b.projection.along ||
        a.projection.distance - b.projection.distance ||
        a.point.id.localeCompare(b.point.id),
    )
    .slice(0, count)
    .map(({ point, projection }) => ({
      ...pointView(point, graph),
      distanceToRouteMeters: Math.round(projection.distance),
    }));
}

function metadataConflicts(rows) {
  return {
    side: new Set(rows.map((p) => fold(p.side)).filter(Boolean)).size > 1,
    approach:
      new Set(rows.map((p) => fold(p.approach)).filter(Boolean)).size > 1,
  };
}
function duplicateSuggestions(graph) {
  const roots = graph.rows.filter((p) => !p.redirect_id),
    suggestions = [];
  for (let i = 0; i < roots.length && suggestions.length < 100; i++) {
    for (let j = i + 1; j < roots.length && suggestions.length < 100; j++) {
      const a = roots[i],
        b = roots[j],
        meters = distance(a, b);
      if (
        a.city_key !== b.city_key ||
        meters > 40 ||
        !sharesName(graph, a, names(graph, b))
      )
        continue;
      const conflicts = metadataConflicts([
        ...members(graph, a.id),
        ...members(graph, b.id),
      ]);
      suggestions.push({
        sourceId: a.id,
        targetId: b.id,
        distanceMeters: Math.round(meters),
        conflicts,
        automaticEligible:
          meters <= 20 &&
          !!fold(a.approach) &&
          !!fold(a.side) &&
          fold(a.approach) === fold(b.approach) &&
          fold(a.side) === fold(b.side) &&
          !conflicts.side &&
          !conflicts.approach,
      });
    }
  }
  return suggestions;
}

async function updatePoint(env, id, body) {
  const original = await env.DB.prepare(
    "SELECT * FROM meeting_points WHERE id=?",
  )
    .bind(id)
    .first();
  if (!original) fail(404, "Mjesto nije pronađeno.");
  if (original.redirect_id)
    fail(409, "Prvo poništi spajanje da urediš izvorno mjesto.");
  if (body.version !== undefined && body.version !== original.version)
    fail(409, "Mjesto je promijenjeno. Učitaj ga ponovo.");
  const point = pointInput(body, original),
    availability = body.availability ?? original.availability;
  if (!availabilityValues.has(availability))
    fail(400, "Status mjesta nije ispravan.");
  const graph = await readGraph(env, original.city_key),
    children = members(graph, id).filter((p) => p.id !== id);
  const conflicts = metadataConflicts([point, ...children]);
  if (
    children.length &&
    (fold(point.city) !== original.city_key ||
      conflicts.side ||
      conflicts.approach)
  )
    fail(
      409,
      "Promjena se sukobljava sa spojenim mjestima. Prvo poništi spajanje.",
    );
  const aliases = body.aliases ?? graph.aliases.get(id) ?? [];
  if (
    !Array.isArray(aliases) ||
    aliases.length > 30 ||
    aliases.some((a) => typeof a !== "string")
  )
    fail(400, "Dodaj najviše 30 naziva mjesta.");
  const revision = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE meeting_points SET name=?,city=?,city_key=?,lat=?,lng=?,detail=?,approach=?,side=?,availability=?,version=version+1,revision=?,updated_at=? WHERE id=? AND revision=? AND redirect_id IS NULL",
    ).bind(
      point.name,
      point.city,
      fold(point.city),
      point.lat,
      point.lng,
      point.detail,
      point.approach,
      point.side,
      availability,
      revision,
      Date.now(),
      id,
      original.revision,
    ),
    env.DB.prepare(
      "DELETE FROM meeting_point_aliases WHERE point_id=? AND EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=?)",
    ).bind(id, id, revision),
    ...aliasesOf([original.name, point.name, ...aliases]).map((alias) =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO meeting_point_aliases(point_id,alias,normalized) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=?)",
      ).bind(id, alias, nameKey(alias), id, revision),
    ),
  ]);
  if (!results[0].meta.changes)
    fail(409, "Mjesto je promijenjeno. Učitaj ga ponovo.");
  return readPointView(env, id, true);
}

function mergeView(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    createdAt: row.created_at,
    undoneAt: row.undone_at,
  };
}
async function mergePoints(env, user, sourceId, targetId, expected = {}) {
  if (typeof targetId !== "string" || sourceId === targetId)
    fail(409, "Odaberi dva različita mjesta za spajanje.");
  const graph = await readGraph(env),
    source = graph.byId.get(sourceId),
    target = graph.byId.get(targetId);
  if (!source || !target) fail(404, "Mjesto nije pronađeno.");
  if (
    (expected.version !== undefined && expected.version !== source.version) ||
    (expected.targetVersion !== undefined &&
      expected.targetVersion !== target.version)
  )
    fail(409, "Mjesto je promijenjeno. Učitaj katalog ponovo.");
  if (source.redirect_id || target.redirect_id)
    fail(409, "Mjesto je već spojeno. Učitaj katalog ponovo.");
  const sourceMembers = members(graph, sourceId),
    targetMembers = members(graph, targetId);
  const conflicts = metadataConflicts([...sourceMembers, ...targetMembers]);
  if (
    source.city_key !== target.city_key ||
    sourceMembers.some((point) => distance(point, target) > 40) ||
    conflicts.side ||
    conflicts.approach
  )
    fail(
      409,
      "Spajanje zahtijeva isti grad, razmak do 40 m i usklađenu stranu i prilaz.",
    );
  const id = crypto.randomUUID(),
    sourceRevision = crypto.randomUUID(),
    targetRevision = crypto.randomUUID(),
    now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE meeting_points SET redirect_id=?,version=version+1,revision=?,updated_at=? WHERE id=? AND revision=? AND redirect_id IS NULL AND EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=? AND redirect_id IS NULL)",
    ).bind(
      targetId,
      sourceRevision,
      now,
      sourceId,
      source.revision,
      targetId,
      target.revision,
    ),
    env.DB.prepare(
      "UPDATE meeting_points SET version=version+1,revision=?,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=? AND redirect_id=?)",
    ).bind(
      targetRevision,
      now,
      targetId,
      target.revision,
      sourceId,
      sourceRevision,
      targetId,
    ),
    env.DB.prepare(
      "INSERT INTO meeting_point_merges(id,source_id,target_id,source_merged_revision,created_by,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=?)",
    ).bind(
      id,
      sourceId,
      targetId,
      sourceRevision,
      user.id,
      now,
      sourceId,
      sourceRevision,
      targetId,
      targetRevision,
    ),
  ]);
  if (!results[0].meta.changes)
    fail(409, "Mjesto je promijenjeno. Učitaj katalog ponovo.");
  return {
    merge: { id, sourceId, targetId, createdAt: now, undoneAt: null },
    point: await readPointView(env, targetId, true),
  };
}
async function undoMerge(env, user, mergeId) {
  const merge = await env.DB.prepare(
    "SELECT * FROM meeting_point_merges WHERE id=?",
  )
    .bind(mergeId)
    .first();
  if (!merge) fail(404, "Spajanje nije pronađeno.");
  if (merge.undone_at !== null) fail(409, "Spajanje je već poništeno.");
  const graph = await readGraph(env),
    source = graph.byId.get(merge.source_id);
  const root = graph.byId.get(canonicalId(graph, merge.target_id));
  if (
    !source ||
    !root ||
    source.redirect_id !== merge.target_id ||
    source.revision !== merge.source_merged_revision
  )
    fail(409, "Mjesto je promijenjeno. Učitaj katalog ponovo.");
  const revision = crypto.randomUUID(),
    rootRevision = crypto.randomUUID(),
    now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE meeting_points SET redirect_id=NULL,version=version+1,revision=?,updated_at=? WHERE id=? AND revision=? AND redirect_id=? AND EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=? AND redirect_id IS NULL) AND EXISTS(SELECT 1 FROM meeting_point_merges WHERE id=? AND undone_at IS NULL)",
    ).bind(
      revision,
      now,
      source.id,
      source.revision,
      merge.target_id,
      root.id,
      root.revision,
      merge.id,
    ),
    env.DB.prepare(
      "UPDATE meeting_points SET version=version+1,revision=?,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=? AND redirect_id IS NULL)",
    ).bind(rootRevision, now, root.id, root.revision, source.id, revision),
    env.DB.prepare(
      "UPDATE meeting_point_merges SET undone_by=?,undone_at=? WHERE id=? AND undone_at IS NULL AND EXISTS(SELECT 1 FROM meeting_points WHERE id=? AND revision=?)",
    ).bind(user.id, now, merge.id, source.id, revision),
  ]);
  if (!results[0].meta.changes)
    fail(409, "Mjesto je promijenjeno. Učitaj katalog ponovo.");
  return {
    point: await readPointView(env, source.id, true),
    merge: { ...mergeView(merge), undoneAt: now },
  };
}

async function leaveFeedback(env, user, id, body) {
  if (
    ![1, -1].includes(body.rating) ||
    typeof body.bookingId !== "string" ||
    !body.bookingId ||
    (body.note !== undefined &&
      (typeof body.note !== "string" || body.note.length > 600))
  )
    fail(
      400,
      "Odaberi ocjenu i završenu vožnju; bilješka može imati do 600 znakova.",
    );
  const booking = await env.DB.prepare(
    "SELECT b.*,r.driver_id,br.match_json FROM bookings b JOIN rides r ON r.id=b.ride_id LEFT JOIN booking_routes br ON br.booking_id=b.id WHERE b.id=?",
  )
    .bind(body.bookingId)
    .first();
  if (
    !booking ||
    booking.status !== "completed" ||
    (booking.passenger_id !== user.id && booking.driver_id !== user.id)
  )
    fail(
      403,
      "Ocjena je dostupna samo učesnicima završene vožnje za njeno mjesto susreta.",
    );
  let match;
  try {
    match = JSON.parse(booking.match_json);
  } catch {
    /* Missing or invalid snapshots do not grant feedback rights. */
  }
  const graph = await readGraph(env),
    target = canonicalId(graph, id);
  const refs = [match?.pickup?.catalogId, match?.dropoff?.catalogId].filter(
    (ref) => typeof ref === "string",
  );
  const referencedId =
    target &&
    (refs.find((ref) => ref === id) ||
      refs.find((ref) => canonicalId(graph, ref) === target));
  if (!referencedId)
    fail(403, "Ovo mjesto nije navedeno u dogovoru završene vožnje.");
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO meeting_point_feedback(point_id,booking_id,user_id,rating,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(point_id,booking_id,user_id) DO UPDATE SET rating=excluded.rating,note=excluded.note,updated_at=excluded.updated_at",
  )
    .bind(
      referencedId,
      booking.id,
      user.id,
      body.rating,
      text(body.note, 600),
      now,
      now,
    )
    .run();
  return {
    feedback: (await readPointView(env, target)).feedback,
    rating: body.rating,
  };
}

export async function handleMeetingCatalogApi(path, method, body, user, env) {
  const url = new URL(path, "https://usput.invalid"),
    route = url.pathname;
  const adminRoute = /^\/admin\/meeting-points(?:\/|$)/.test(route);
  if (!adminRoute && !/^\/meeting-points(?:\/|$)/.test(route)) return null;
  try {
    if (!user?.id) fail(401, "Prijavi se da nastaviš.");
    if (adminRoute && !isMeetingAdmin(user, env))
      fail(403, "Katalog može uređivati samo ovlašteni Google račun.");
    if (
      method !== "GET" &&
      (!body || typeof body !== "object" || Array.isArray(body))
    )
      fail(400, "Podaci nisu ispravni.");
    if (route === "/admin/meeting-points/access" && method === "GET")
      return json({ allowed: true });
    if (route === "/meeting-points" && method === "GET") {
      const city = text(url.searchParams.get("city"), 100),
        query = nameKey(url.searchParams.get("query") || "");
      if (city.length < 2)
        fail(400, "Odaberi grad za pretragu mjesta susreta.");
      const graph = await readGraph(env, fold(city));
      return json({
        points: graph.rows
          .filter(
            (p) =>
              !p.redirect_id &&
              p.availability === "active" &&
              (!query ||
                names(graph, p).some((name) => nameKey(name).includes(query))),
          )
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 100)
          .map((p) => pointView(p, graph)),
      });
    }
    if (route === "/admin/meeting-points" && method === "GET") {
      const city = fold(url.searchParams.get("city") || ""),
        query = nameKey(url.searchParams.get("query") || "");
      const graph = await readGraph(env, city);
      const merges = await env.DB.prepare(
        "SELECT m.* FROM meeting_point_merges m JOIN meeting_points p ON p.id=m.source_id" +
          (city ? " WHERE p.city_key=?" : "") +
          " ORDER BY m.created_at DESC LIMIT 100",
      )
        .bind(...(city ? [city] : []))
        .all();
      return json({
        points: graph.rows
          .filter(
            (p) =>
              !query ||
              names(graph, p).some((name) => nameKey(name).includes(query)),
          )
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => pointView(p, graph, true)),
        merges: merges.results.map(mergeView),
        duplicateSuggestions: duplicateSuggestions(graph),
      });
    }
    if (route === "/admin/meeting-points" && method === "POST") {
      const id = await insertPoint(env, user, pointInput(body), {
        availability: body.availability,
        aliases: body.aliases,
      });
      return json({ point: await readPointView(env, id, true) }, 201);
    }
    let match = route.match(/^\/admin\/meeting-points\/merges\/([^/]+)\/undo$/);
    if (match && method === "POST")
      return json(await undoMerge(env, user, match[1]));
    match = route.match(/^\/admin\/meeting-points\/([^/]+)\/merge$/);
    if (match && method === "POST")
      return json(await mergePoints(env, user, match[1], body.targetId, body));
    match = route.match(/^\/admin\/meeting-points\/([^/]+)\/availability$/);
    if (match && method === "POST") {
      if (!availabilityValues.has(body.availability))
        fail(400, "Status mjesta nije ispravan.");
      return json({
        point: await updatePoint(env, match[1], {
          availability: body.availability,
          version: body.version,
        }),
      });
    }
    match = route.match(/^\/admin\/meeting-points\/([^/]+)$/);
    if (match && method === "GET")
      return json({ point: await readPointView(env, match[1], true) });
    if (match && ["POST", "PATCH"].includes(method))
      return json({ point: await updatePoint(env, match[1], body) });
    match = route.match(/^\/meeting-points\/([^/]+)\/feedback$/);
    if (match && method === "POST")
      return json(await leaveFeedback(env, user, match[1], body));
    return json({ error: "Stranica nije pronađena." }, 404);
  } catch (error) {
    if (error instanceof CatalogError)
      return json({ error: error.message }, error.status);
    throw error;
  }
}
