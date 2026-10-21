import { vehicleLabel } from "./vehicles.mjs";
const limits = {
  avatar: { bytes: 50 * 1024, edge: 320 },
  vehicle: { bytes: 150 * 1024, edge: 960 },
};
class PhotoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (s, m) => {
  throw new PhotoError(s, m);
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
const four = (a, n) => String.fromCharCode(...a.subarray(n, n + 4));
export function inspectWebP(bytes, kind) {
  const policy = limits[kind];
  if (!policy) fail(400, "Nepoznata vrsta fotografije.");
  if (bytes.length > policy.bytes)
    fail(413, "Fotografija je prevelika. Ponovo je pripremi u aplikaciji.");
  if (
    bytes.length < 26 ||
    four(bytes, 0) !== "RIFF" ||
    four(bytes, 8) !== "WEBP"
  )
    fail(400, "Potrebna je kompresovana WebP fotografija.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length)
    fail(400, "Fotografija nije ispravna.");
  let pos = 12,
    width = 0,
    height = 0,
    bitstreams = 0,
    chunks = 0,
    canvasWidth = 0,
    canvasHeight = 0;
  while (pos + 8 <= bytes.length) {
    if (++chunks > 16) fail(400, "Fotografija ima previše dodatnih podataka.");
    const type = four(bytes, pos),
      size = view.getUint32(pos + 4, true),
      start = pos + 8;
    if (start + size > bytes.length) fail(400, "Fotografija nije potpuna.");
    if (["EXIF", "XMP ", "ICCP", "ANIM", "ANMF"].includes(type))
      fail(400, "Ukloni metapodatke i animaciju pripremom slike u aplikaciji.");
    if (type === "VP8X") {
      if (
        size !== 10 ||
        canvasWidth ||
        bytes[start] & ~0x10 ||
        bytes[start + 1] ||
        bytes[start + 2] ||
        bytes[start + 3]
      )
        fail(400, "Fotografija ima nepodržane dodatke.");
      canvasWidth =
        1 +
        bytes[start + 4] +
        (bytes[start + 5] << 8) +
        (bytes[start + 6] << 16);
      canvasHeight =
        1 +
        bytes[start + 7] +
        (bytes[start + 8] << 8) +
        (bytes[start + 9] << 16);
    } else if (type === "VP8L") {
      if (size < 5 || bytes[start] !== 0x2f)
        fail(400, "WebP slika nije ispravna.");
      const bits = view.getUint32(start + 1, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      bitstreams++;
    } else if (type === "VP8 ") {
      if (
        size < 10 ||
        bytes[start + 3] !== 0x9d ||
        bytes[start + 4] !== 1 ||
        bytes[start + 5] !== 0x2a
      )
        fail(400, "WebP slika nije ispravna.");
      width = view.getUint16(start + 6, true) & 0x3fff;
      height = view.getUint16(start + 8, true) & 0x3fff;
      bitstreams++;
    } else if (type !== "ALPH")
      fail(400, "Fotografija sadrži nepodržan dodatak.");
    pos = start + size + (size % 2);
  }
  if (
    (canvasWidth && (canvasWidth !== width || canvasHeight !== height)) ||
    pos !== bytes.length ||
    bitstreams !== 1 ||
    width < 32 ||
    height < 32 ||
    width > policy.edge ||
    height > policy.edge ||
    (kind === "avatar" && width !== height)
  )
    fail(
      400,
      "Dimenzije fotografije nisu odgovarajuće. Pripremi je ponovo u aplikaciji.",
    );
  return { width, height, bytes: bytes.length };
}
async function readBounded(request, max) {
  if (Number(request.headers.get("Content-Length") || 0) > max)
    fail(413, "Fotografija je prevelika.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Odaberi fotografiju.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      fail(413, "Fotografija je prevelika.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}
const meta = (p) =>
  p
    ? {
        id: p.id,
        url: "/api/photos/" + p.id,
        bytes: p.bytes,
        width: p.width,
        height: p.height,
      }
    : null;
async function ownPhotos(db, owner) {
  const rows = (
    await db
      .prepare("SELECT * FROM photos WHERE owner_id=? AND state='active'")
      .bind(owner)
      .all()
  ).results;
  const vehicle = await db
    .prepare("SELECT * FROM vehicles WHERE user_id=?")
    .bind(owner)
    .first();
  return {
    avatar: meta(rows.find((p) => p.kind === "avatar")),
    vehicle: meta(
      rows.find(
        (p) =>
          p.kind === "vehicle" &&
          vehicle &&
          p.vehicle_label === vehicleLabel(vehicle),
      ),
    ),
  };
}
async function acceptedRide(db, rideId, userId) {
  return db
    .prepare(
      "SELECT r.*,b.passenger_id FROM rides r JOIN bookings b ON b.ride_id=r.id WHERE r.id=? AND r.status IN ('open','matched') AND b.status IN ('accepted','ready') AND r.departure>? AND (r.driver_id=? OR b.passenger_id=?)",
    )
    .bind(rideId, Date.now() - 86400000, userId, userId)
    .first();
}
async function allowedPeer(db, photo, userId) {
  if (photo.owner_id === userId) return true;
  const rows = (
    await db
      .prepare(
        "SELECT r.*,b.passenger_id FROM rides r JOIN bookings b ON b.ride_id=r.id WHERE r.status IN ('open','matched') AND b.status IN ('accepted','ready') AND r.departure>? AND ((r.driver_id=? AND b.passenger_id=?) OR (r.driver_id=? AND b.passenger_id=?))",
      )
      .bind(
        Date.now() - 86400000,
        photo.owner_id,
        userId,
        userId,
        photo.owner_id,
      )
      .all()
  ).results;
  return rows.some(
    (r) =>
      photo.kind === "avatar" ||
      (r.driver_id === photo.owner_id && photo.vehicle_label === r.car),
  );
}
async function purgeRows(env, rows) {
  if (!env.PHOTOS) return;
  for (const p of rows) {
    try {
      await env.PHOTOS.delete(p.object_key);
      await env.DB.prepare(
        "DELETE FROM photos WHERE id=? AND state IN ('retired','abandoned')",
      )
        .bind(p.id)
        .run();
    } catch {
      console.error("Photo cleanup deferred.");
    }
  }
}
export async function cleanupPhotos(env) {
  if (!env.PHOTOS) return;
  await env.DB.prepare(
    "UPDATE photos SET state='abandoned' WHERE state='pending' AND created_at<?",
  )
    .bind(Date.now() - 3600000)
    .run();
  const rows = (
    await env.DB.prepare(
      "SELECT * FROM photos WHERE state='retired' OR (state='abandoned' AND created_at<?) LIMIT 200",
    )
      .bind(Date.now() - 3600000)
      .all()
  ).results;
  await purgeRows(env, rows);
}
export async function handlePhotoApi(request, env, user, path) {
  const db = env.DB,
    method = request.method;
  try {
    if (
      method !== "GET" &&
      request.headers.get("Origin") !== new URL(request.url).origin
    )
      fail(403, "Zahtjev nije dozvoljen s ove stranice.");
    if (path === "/photos/me" && method === "GET")
      return json({
        ...(await ownPhotos(db, user.id)),
        available: !!env.PHOTOS,
      });
    const rideMatch = path.match(/^\/photos\/ride\/([\w-]+)$/);
    if (rideMatch && method === "GET") {
      const ride = await acceptedRide(db, rideMatch[1], user.id);
      if (!ride) fail(404, "Fotografije nisu dostupne za ovaj dogovor.");
      const rows = (
        await db
          .prepare(
            "SELECT * FROM photos WHERE state='active' AND owner_id IN (?,?)",
          )
          .bind(ride.driver_id, ride.passenger_id)
          .all()
      ).results;
      return json({
        driverAvatar: meta(
          rows.find(
            (p) => p.owner_id === ride.driver_id && p.kind === "avatar",
          ),
        ),
        passengerAvatar: meta(
          rows.find(
            (p) => p.owner_id === ride.passenger_id && p.kind === "avatar",
          ),
        ),
        vehicle: meta(
          rows.find(
            (p) =>
              p.owner_id === ride.driver_id &&
              p.kind === "vehicle" &&
              p.vehicle_label === ride.car,
          ),
        ),
      });
    }
    const upload = path.match(/^\/photos\/(avatar|vehicle)$/),
      remove = path.match(/^\/photos\/(avatar|vehicle)\/remove$/);
    if (upload && method === "POST") {
      if (!env.PHOTOS) fail(503, "Skladište fotografija još nije povezano.");
      const kind = upload[1];
      if (request.headers.get("Content-Type") !== "image/webp")
        fail(415, "Pošalji pripremljenu WebP fotografiju.");
      let vehicle = null;
      if (kind === "vehicle") {
        vehicle = await db
          .prepare("SELECT * FROM vehicles WHERE user_id=?")
          .bind(user.id)
          .first();
        if (!vehicle) fail(400, "Prvo dodaj marku, model i boju svog vozila.");
      }
      const bytes = await readBounded(request, limits[kind].bytes),
        info = inspectWebP(bytes, kind),
        id = crypto.randomUUID(),
        key = `${user.id}/${id}.webp`;
      await db
        .prepare(
          "INSERT INTO photos(id,owner_id,kind,object_key,bytes,width,height,vehicle_label,state,created_at) VALUES(?,?,?,?,?,?,?,?,'pending',?)",
        )
        .bind(
          id,
          user.id,
          kind,
          key,
          info.bytes,
          info.width,
          info.height,
          vehicle ? vehicleLabel(vehicle) : null,
          Date.now(),
        )
        .run();
      let putComplete = false;
      try {
        await env.PHOTOS.put(key, bytes, {
          httpMetadata: {
            contentType: "image/webp",
            cacheControl: "private, no-store",
          },
        });
        putComplete = true;
        const activation = await db.batch([
          db
            .prepare(
              "UPDATE photos SET state='retired' WHERE owner_id=? AND kind=? AND state='active' AND EXISTS(SELECT 1 FROM photos WHERE id=? AND state='pending')",
            )
            .bind(user.id, kind, id),
          db
            .prepare(
              "UPDATE photos SET state='active' WHERE id=? AND state='pending'",
            )
            .bind(id),
        ]);
        if (activation[1].meta.changes !== 1)
          fail(
            409,
            "Slanje fotografije je otkazano. Odaberi je ponovo ako je želiš objaviti.",
          );
      } catch (error) {
        await db
          .prepare(
            "UPDATE photos SET state='abandoned' WHERE id=? AND state='pending'",
          )
          .bind(id)
          .run();
        if (putComplete)
          await purgeRows(
            env,
            (
              await db
                .prepare(
                  "SELECT * FROM photos WHERE id=? AND state IN ('retired','abandoned')",
                )
                .bind(id)
                .all()
            ).results,
          );
        if (error instanceof PhotoError) {
          if (putComplete) await env.PHOTOS.delete(key);
          throw error;
        }
        fail(
          503,
          "Fotografija nije sačuvana. Pokušaj ponovo; prethodna slika ostaje dostupna.",
        );
      }
      await purgeRows(
        env,
        (
          await db
            .prepare(
              "SELECT * FROM photos WHERE owner_id=? AND kind=? AND state='retired'",
            )
            .bind(user.id, kind)
            .all()
        ).results,
      );
      return json({ photo: { id, url: "/api/photos/" + id, ...info } }, 201);
    }
    if (remove && method === "POST") {
      const kind = remove[1];
      await db
        .prepare(
          "UPDATE photos SET state=CASE WHEN state='pending' THEN 'abandoned' ELSE 'retired' END WHERE owner_id=? AND kind=? AND state IN ('active','pending')",
        )
        .bind(user.id, kind)
        .run();
      await purgeRows(
        env,
        (
          await db
            .prepare(
              "SELECT * FROM photos WHERE owner_id=? AND kind=? AND state='retired'",
            )
            .bind(user.id, kind)
            .all()
        ).results,
      );
      return json({ ok: true });
    }
    const image = path.match(/^\/photos\/([\w-]+)$/);
    if (image && method === "GET") {
      const p = await db
        .prepare("SELECT * FROM photos WHERE id=? AND state='active'")
        .bind(image[1])
        .first();
      if (!p || !(await allowedPeer(db, p, user.id)))
        fail(404, "Fotografija nije dostupna.");
      if (!env.PHOTOS) fail(503, "Skladište nije dostupno.");
      const object = await env.PHOTOS.get(p.object_key);
      if (!object) fail(404, "Fotografija nije dostupna.");
      return new Response(object.body, {
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(p.bytes),
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "same-origin",
          "Content-Disposition": 'inline; filename="usput-photo.webp"',
        },
      });
    }
    fail(404, "Stranica nije pronađena.");
  } catch (e) {
    if (e instanceof PhotoError) return json({ error: e.message }, e.status);
    console.error("Photo API unavailable:", e.name);
    return json(
      { error: "Fotografije trenutno nisu dostupne. Pokušaj ponovo." },
      503,
    );
  }
}
