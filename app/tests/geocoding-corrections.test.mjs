import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { adaptSqlite } from "../server/db.mjs";
import { geocode, locateCity } from "../server/geocoding.mjs";

const databases = [];
afterEach(() => {
  while (databases.length) databases.pop().close();
});
function fixture(provider) {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE routing_cache(id TEXT PRIMARY KEY,payload TEXT,expires INTEGER);
    CREATE TABLE routing_health(id TEXT PRIMARY KEY,status TEXT,detail TEXT,checked_at INTEGER);
  `);
  const requests = [];
  const env = {
    DB: adaptSqlite(sqlite),
    GEOCODER_URL: "https://geocoder.example.test/",
    ROUTING_FETCH: async (input) => {
      const url = new URL(input);
      requests.push(url);
      return Response.json(await provider(url));
    },
  };
  return { env, sqlite, requests };
}
const street = (address = {}, point = {}) => ({
  lat: "43.85103",
  lon: "18.38360",
  display_name: "Алеја липа, Sarajevo, Bosna i Hercegovina",
  address: {
    road: "Алеја липа",
    city: "Sarajevo",
    country_code: "ba",
    ...address,
  },
  ...point,
});

test("legacy cached street labels transliterate Serbian Cyrillic while retaining pin identity and metadata", async () => {
  const { env, sqlite, requests } = fixture(() => {
    throw Error("Cached street must not need a provider request");
  });
  const location = {
    id: "pin_43.85103_18.38360",
    lat: 43.85103,
    lng: 18.3836,
    name: "Алеја липа, Sarajevo",
    detail:
      "Љубљана Његош Џемала Ђорђе Ћиро Јован · ЉУБЉАНА ЊЕГОШ ЏЕЗ ЂЋЈ · абвгдђежзијклљмнњопрстћуфхцчџш",
    city: "Сарајево",
    countryCode: "BA",
  };
  const key =
    "geocode-v3:" +
    env.GEOCODER_URL +
    ":" +
    JSON.stringify(["aleja lipa, sarajevo", "Sarajevo", null]);
  sqlite
    .prepare("INSERT INTO routing_cache VALUES(?,?,?)")
    .run(key, JSON.stringify([location]), Date.now() + 60000);
  const [actual] = await geocode(env, "Aleja lipa", { city: "Sarajevo" });
  assert.deepEqual(actual, {
    ...location,
    name: "Aleja lipa, Sarajevo",
    detail:
      "Ljubljana Njegoš Džemala Đorđe Ćiro Jovan · LJUBLJANA NJEGOŠ DŽEZ ĐĆJ · abvgdđežzijklljmnnjoprstćufhcčdžš",
  });
  assert.equal(requests.length, 0);
});

test("fresh Cyrillic city metadata matches the selected Latin city and Latin names are requested", async () => {
  const { env, requests } = fixture(() => [street({ city: "Сарајево" })]);
  const locations = await geocode(env, "Алеја липа", { city: "Sarajevo" });
  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, "Aleja lipa, Sarajevo");
  assert.equal(
    locations[0].detail,
    "Aleja lipa, Sarajevo, Bosna i Hercegovina",
  );
  assert.equal(locations[0].city, "Сарајево");
  assert.equal(locations[0].id, "pin_43.85103_18.38360");
  assert.match(requests[0].searchParams.get("accept-language"), /^bs-Latn,/);
});

test("empty exact search retries a structured street in the same city and normalizes a distinct diacritic spelling", async () => {
  const { env, requests } = fixture((url) =>
    url.searchParams.get("street") === "Dzemala Bijedica 129"
      ? [street({ road: "Džemala Bijedića", house_number: "129" })]
      : [],
  );
  const scope = { city: "Sarajevo", lat: 43.8563, lng: 18.4135 };
  const locations = await geocode(
    env,
    "  Džemala   Bijedića 129, Sarajevo  ",
    scope,
  );
  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, "Džemala Bijedića 129, Sarajevo");
  assert.deepEqual(
    requests.map((u) =>
      Object.fromEntries(
        ["q", "street", "city"]
          .filter((k) => u.searchParams.has(k))
          .map((k) => [k, u.searchParams.get(k)]),
      ),
    ),
    [
      { q: "Džemala Bijedića 129, Sarajevo" },
      { street: "Džemala Bijedića 129", city: "Sarajevo" },
      { street: "Dzemala Bijedica 129", city: "Sarajevo" },
    ],
  );
  for (const url of requests) {
    assert.equal(url.searchParams.get("bounded"), "1");
    assert.equal(
      url.searchParams.get("viewbox"),
      requests[0].searchParams.get("viewbox"),
    );
  }
  const again = await geocode(env, "Džemala Bijedića 129, Sarajevo", scope);
  assert.deepEqual(again, locations);
  assert.equal(
    requests.length,
    3,
    "all query variants share the provider cache",
  );
});

test("a legacy cached empty full-street search can recover through a structured query", async () => {
  const { env, sqlite, requests } = fixture((url) =>
    url.searchParams.get("street") === "Aleja lipa" ? [street()] : [],
  );
  const key =
    "geocode-v3:" +
    env.GEOCODER_URL +
    ":" +
    JSON.stringify(["aleja lipa, sarajevo", "Sarajevo", null]);
  sqlite
    .prepare("INSERT INTO routing_cache VALUES(?,?,?)")
    .run(key, "[]", Date.now() + 60000);
  const locations = await geocode(env, "Aleja lipa, Sarajevo", {
    city: "Sarajevo",
  });
  assert.equal(locations[0]?.name, "Aleja lipa, Sarajevo");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get("street"), "Aleja lipa");
});

test("fallback keeps city scope and GPS bounds strict and rejects coarse city results", async () => {
  const { env, requests } = fixture(() => [
    street({ city: "Zagreb" }),
    street({ city: "Сарајево" }, { lat: "49.2", lon: "18.4" }),
    { lat: "43.85", lon: "18.4", address: { city: "Sarajevo" } },
  ]);
  assert.deepEqual(
    await geocode(env, "Aleja lipa", {
      city: "Sarajevo",
      lat: 43.85,
      lng: 18.4,
    }),
    [],
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get("city"), "Sarajevo");
});

test("an address-bearing POI remains a precise street result and short street names remain searchable", async () => {
  const { env, requests } = fixture(() => [
    street(
      { road: "Put", house_number: "9" },
      {
        name: "Narodno pozorište Sarajevo",
        category: "amenity",
        type: "theatre",
      },
    ),
  ]);
  const locations = await geocode(env, "Put", { city: "Sarajevo" });
  assert.equal(locations[0].name, "Put 9, Sarajevo");
  assert.equal(locations[0].lat, 43.85103);
  assert.equal(requests.length, 1);
});

test("structured lookup strips only a complete trailing city, never a street-name substring", async () => {
  const { env, requests } = fixture(() => []);
  await geocode(env, "Sarajevska 5 Sarajevo", { city: "Sarajevo" });
  assert.equal(requests[1]?.searchParams.get("street"), "Sarajevska 5");
  assert.equal(requests[1]?.searchParams.get("city"), "Sarajevo");
});

test("unavailable provider remains unavailable and does not invent a fallback location", async () => {
  const { env, requests } = fixture(() => {
    throw Error("offline");
  });
  assert.equal(await geocode(env, "Aleja lipa", { city: "Sarajevo" }), null);
  assert.equal(requests.length, 1);
});

test("reverse city requests prefer Latin without altering the returned city metadata", async () => {
  const { env, requests } = fixture(() => ({ address: { city: "Сарајево" } }));
  assert.equal(
    (await locateCity(env, { lat: 43.85, lng: 18.4 })).city,
    "Сарајево",
  );
  assert.match(requests[0].searchParams.get("accept-language"), /^bs-Latn,/);
});
