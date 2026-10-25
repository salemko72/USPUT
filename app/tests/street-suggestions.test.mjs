import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { adaptSqlite } from "../server/db.mjs";
import { suggestStreets } from "../server/street-suggestions.mjs";
import { geocode } from "../server/geocoding.mjs";

const databases = [];
afterEach(() => {
  while (databases.length) databases.pop().close();
});
const feature = (name, extra = {}, coords = [18.3836, 43.85103]) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: coords },
  properties: {
    name,
    city: "Sarajevo",
    countrycode: "BA",
    osm_key: "highway",
    osm_value: "residential",
    ...extra,
  },
});
function fixture(provider) {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(
    "CREATE TABLE routing_cache(id TEXT PRIMARY KEY,payload TEXT,expires INTEGER);CREATE TABLE routing_health(id TEXT PRIMARY KEY,status TEXT,detail TEXT,checked_at INTEGER)",
  );
  const requests = [];
  const env = {
    DB: adaptSqlite(db),
    PHOTON_URL: "https://photon.example.test/",
    ROUTING_FETCH: async (input) => {
      const url = new URL(input);
      requests.push(url);
      db.prepare(
        "DELETE FROM routing_cache WHERE id='osm-upstream-rate'",
      ).run();
      return Response.json(await provider(url));
    },
  };
  return { env, db, requests };
}
test("one letter returns only street prefixes in the selected city with Latin labels", async () => {
  const { env, requests } = fixture(() => ({
    features: [
      feature("Алеја липа"),
      feature("Antuna Branka Šimića"),
      feature("Obala Kulina bana"),
      feature("Aleja", { city: "Zagreb" }, [15.98, 45.81]),
      feature("Avenija", { osm_key: "place", osm_value: "city" }),
    ],
  }));
  const result = await suggestStreets(env, "A", { city: "Sarajevo" });
  assert.deepEqual(
    result.locations.map((x) => x.name),
    ["Aleja lipa, Sarajevo", "Antuna Branka Šimića, Sarajevo"],
  );
  assert.equal(result.fallback, false);
  assert.equal(requests[0].searchParams.get("q"), "A");
  assert.ok(requests[0].searchParams.has("bbox"));
});
test("city-first autofill and a typo recover a local prefix list without inventing a pin", async () => {
  const { env, requests } = fixture((url) => ({
    features: url.searchParams.get("q") === "Al" ? [feature("Алеја липа")] : [],
  }));
  const result = await suggestStreets(env, "Sarajevo, Alejja lipa", {
    city: "Sarajevo",
  });
  assert.equal(result.fallback, true);
  assert.equal(result.locations[0].name, "Aleja lipa, Sarajevo");
  assert.equal(result.locations[0].lng, 18.3836);
  assert.deepEqual(
    requests.map((x) => x.searchParams.get("q")),
    ["Alejja lipa", "Al"],
  );
});
test("empty exact response is different from unavailable service and repeated prefixes use cache", async () => {
  const { env, requests } = fixture(() => ({
    features: [feature("Aleja lipa")],
  }));
  const a = await suggestStreets(env, "Al", { city: "Sarajevo" });
  assert.deepEqual(await suggestStreets(env, "Al", { city: "Sarajevo" }), a);
  assert.equal(requests.length, 1);
  env.PHOTON_URL = "";
  assert.equal(await suggestStreets(env, "Al", { city: "Sarajevo" }), null);
});
test("an unknown city is resolved once, never silently replaced with Sarajevo", async () => {
  const { env, requests } = fixture((url) => ({
    features:
      url.searchParams.get("q") === "Travnik"
        ? [
            feature(
              "Travnik",
              { city: "Travnik", osm_key: "place", osm_value: "city" },
              [17.91, 44.2],
            ),
          ]
        : [feature("Titova", { city: "Travnik" }, [17.9, 44.2])],
  }));
  const result = await suggestStreets(env, "Ti", { city: "Travnik" });
  assert.equal(result.locations[0].city, "Travnik");
  assert.equal(requests.length, 2);
  assert.match(requests[1].searchParams.get("bbox"), /^17\./);
});
test("bad or missing city and out-of-city scope cannot broaden suggestions", async () => {
  const { env, requests } = fixture(() => ({ features: [] }));
  await assert.rejects(() => suggestStreets(env, "A", { city: "" }), /grad/i);
  await assert.rejects(
    () => suggestStreets(env, "A", { city: "Sarajevo", lat: 300, lng: 18 }),
    /Lokacija/,
  );
  assert.equal(requests.length, 0);
  assert.equal(
    (await suggestStreets(env, "A", { city: "Not a city" })).locations.length,
    0,
  );
});
test("full geocoder also accepts city-first Apple autofill", async () => {
  const { env, requests } = fixture(() => [
    {
      lat: "43.85",
      lon: "18.38",
      address: { road: "Aleja lipa", city: "Sarajevo", country_code: "ba" },
    },
  ]);
  env.GEOCODER_URL = "https://geocoder.example.test/";
  assert.equal(
    (await geocode(env, "Sarajevo, Aleja lipa", { city: "Sarajevo" })).length,
    1,
  );
  assert.equal(requests[0].searchParams.get("q"), "Aleja lipa, Sarajevo");
});
test("Belgrade provider metadata matches Beograd without admitting distant streets", async () => {
  const { env } = fixture(() => ({
    features: [
      feature(
        "Кнеза Милоша",
        { city: "Belgrade", countrycode: "RS" },
        [20.46, 44.81],
      ),
      feature("Kneza Miloša", { city: "Sarajevo" }),
    ],
  }));
  const result = await suggestStreets(env, "Knez", { city: "Beograd" });
  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0].name, "Kneza Miloša, Beograd");
  assert.deepEqual(
    await suggestStreets(env, "Belgrade, Knez", { city: "Beograd" }),
    result,
  );
});

test("a neighbourhood is offered as an approximate area in its own city, never a fabricated street", async () => {
  const { env } = fixture((url) => ({
    features: url.searchParams.get("layer")
      ? []
      : [
          feature(
            "Crkvice",
            { city: "Zenica", osm_key: "place", osm_value: "suburb" },
            [17.908, 44.212],
          ),
        ],
  }));
  const result = await suggestStreets(env, "Crkvice", { city: "Zenica" });
  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0].kind, "area");
  assert.equal(result.locations[0].approximate, true);
  assert.equal(result.locations[0].city, "Zenica");
});

test("old cached street-only emptiness cannot hide new neighbourhood suggestions", async () => {
  const { env, db, requests } = fixture(() => ({
    features: [
      feature(
        "Crkvice",
        { city: "Zenica", osm_key: "place", osm_value: "suburb" },
        [17.908, 44.212],
      ),
    ],
  }));
  const lat = 44.2017,
    lng = 17.9039,
    dy = 0.3,
    dx = dy / Math.cos((lat * Math.PI) / 180),
    bbox = [lng - dx, lat - dy, lng + dx, lat + dy].join(",");
  db.prepare("INSERT INTO routing_cache VALUES(?,?,?)").run(
    "photon-v1:" +
      env.PHOTON_URL +
      ":street:" +
      JSON.stringify(["crkvice", "zenica", bbox]),
    JSON.stringify({ features: [] }),
    Date.now() + 86400000,
  );
  const r = await suggestStreets(env, "Crkvice", { city: "Zenica" });
  assert.equal(r.locations.length, 1);
  assert.equal(r.locations[0].approximate, true);
  assert.equal(requests[0].searchParams.get("q"), "Crkvice");
});
