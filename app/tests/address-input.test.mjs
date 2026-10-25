import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { adaptSqlite } from "../server/db.mjs";
import { resolveAddressInput } from "../server/address-input.mjs";
async function fixture(fn) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE routing_cache(id TEXT PRIMARY KEY,payload TEXT,expires INTEGER);CREATE TABLE routing_health(id TEXT PRIMARY KEY,status TEXT,detail TEXT,checked_at INTEGER)",
  );
  const requests = [];
  const env = {
    DB: adaptSqlite(db),
    PHOTON_URL: "https://photon.fixture/",
    ROUTING_FETCH: async (input) => {
      const u = new URL(input);
      requests.push(u);
      return Response.json({
        features:
          u.searchParams.get("q") === "Travnik"
            ? [
                {
                  geometry: { coordinates: [17.665, 44.227] },
                  properties: {
                    name: "Travnik",
                    osm_key: "place",
                    osm_value: "town",
                    countrycode: "BA",
                  },
                },
              ]
            : [],
      });
    },
  };
  try {
    await fn(env, requests);
  } finally {
    db.close();
  }
}
for (const text of ["Zenica, Crkvice", "Crkvice, Zenica"])
  test(`explicit city in ${text} replaces profile city and old coordinates`, () =>
    fixture(async (env, requests) => {
      const result = await resolveAddressInput(env, text, {
        city: "Sarajevo",
        lat: 43.85,
        lng: 18.4,
      });
      assert.equal(result.query, "Crkvice");
      assert.equal(result.scope.city, "Zenica");
      assert.ok(Math.abs(result.scope.lat - 44.2) < 0.05);
      assert.equal(requests.length, 0);
    }));
test("street without explicit city retains strict default scope", () =>
  fixture(async (env) => {
    const r = await resolveAddressInput(env, "Logavina", { city: "Sarajevo" });
    assert.equal(r.scope.city, "Sarajevo");
    assert.equal(r.query, "Logavina");
    assert.equal(r.cityOnly, false);
  }));
test("a city alone is a city pin, not a fabricated street address", () =>
  fixture(async (env) => {
    const r = await resolveAddressInput(env, "Zenica", { city: "Sarajevo" });
    assert.equal(r.cityOnly, true);
    assert.equal(r.location.kind, "city");
    assert.equal(r.location.city, "Zenica");
  }));
test("unknown explicit towns are verified, cached, and do not borrow stale device position", () =>
  fixture(async (env, requests) => {
    for (const q of ["Travnik, Bosanska", "Bosanska, Travnik"]) {
      const r = await resolveAddressInput(env, q, {
        city: "Sarajevo",
        lat: 43.85,
        lng: 18.4,
      });
      assert.equal(r.scope.city, "Travnik");
      assert.equal(r.query, "Bosanska");
      assert.equal(r.scope.lng, 17.665);
    }
    assert.equal(
      requests.filter((u) => u.searchParams.get("q") === "Travnik").length,
      1,
    );
  }));
test("commas in unrecognised input do not invent another city", () =>
  fixture(async (env) => {
    const r = await resolveAddressInput(env, "Ulica, nešto", {
      city: "Sarajevo",
    });
    assert.equal(r.scope.city, "Sarajevo");
    assert.equal(r.query, "Ulica, nešto");
  }));
