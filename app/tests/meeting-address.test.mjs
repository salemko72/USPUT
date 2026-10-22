import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { adaptSqlite } from "../server/db.mjs";
import { meetingAddress } from "../server/meeting-address.mjs";

const databases = [];
afterEach(() => {
  while (databases.length) databases.pop().close();
});
function fixture(provider) {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  sqlite.exec(`CREATE TABLE routing_cache(id TEXT PRIMARY KEY,payload TEXT,expires INTEGER);
    CREATE TABLE routing_health(id TEXT PRIMARY KEY,status TEXT,detail TEXT,checked_at INTEGER);`);
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
  return { env, requests, sqlite };
}

test("nearby meeting pins retain five decimals and cannot share a coarse city cache entry", async () => {
  const { env, requests } = fixture((url) => ({
    lat: "43.86",
    lon: "18.40",
    address: {
      road:
        url.searchParams.get("lat") === "43.85107"
          ? "Алеја липа"
          : "Друга улица",
      city: "Сарајево",
      house_number: "99",
    },
  }));
  const original = Object.freeze({
    name: "Demo — Aleja lipa, Sarajevo",
    lat: 43.85107,
    lng: 18.38276,
  });
  assert.deepEqual(await meetingAddress(env, original), {
    label: "Aleja lipa, Sarajevo",
    approximate: true,
  });
  assert.deepEqual(
    await meetingAddress(env, { lat: 43.85118, lng: 18.38276 }),
    { label: "Druga ulica, Sarajevo", approximate: true },
  );
  assert.deepEqual(
    await meetingAddress(env, { lat: 43.8510701, lng: 18.3827601 }),
    { label: "Aleja lipa, Sarajevo", approximate: true },
  );
  assert.equal(requests.length, 2);
  assert.deepEqual(original, {
    name: "Demo — Aleja lipa, Sarajevo",
    lat: 43.85107,
    lng: 18.38276,
  });
});

test("reverse street extraction requires both a street and a settlement and ignores guessed house numbers", async () => {
  for (const address of [
    { city: "Sarajevo", house_number: "3" },
    { road: "Ejuba Ademovića", house_number: "3" },
    { road: 12, city: "Sarajevo" },
  ]) {
    const { env } = fixture(() => ({ address }));
    assert.equal(await meetingAddress(env, { lat: 43.85, lng: 18.4 }), null);
  }
  const { env } = fixture(() => ({
    address: {
      pedestrian: "Пјешачка улица",
      town: "Травник",
      house_number: "3",
    },
  }));
  assert.deepEqual(await meetingAddress(env, { lat: 44.2, lng: 17.66 }), {
    label: "Pješačka ulica, Travnik",
    approximate: true,
  });
});

test("invalid meeting coordinates never enter the cache or provider", async () => {
  const { env, requests, sqlite } = fixture(() => ({}));
  for (const point of [
    null,
    {},
    { lat: null, lng: 18.4 },
    { lat: "", lng: 18.4 },
    { lat: "0x20", lng: 18.4 },
    { lat: NaN, lng: 18.4 },
    { lat: 86, lng: 18.4 },
    { lat: 43.85, lng: -181 },
  ])
    await assert.rejects(meetingAddress(env, point), TypeError);
  assert.equal(requests.length, 0);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM routing_cache").get().n,
    0,
  );
});

test("missing or failed geocoders never produce a fabricated street", async () => {
  const { env, requests } = fixture(() => {
    throw Error("offline");
  });
  assert.equal(
    await meetingAddress(
      { ...env, GEOCODER_URL: undefined },
      { lat: 43.85, lng: 18.4 },
    ),
    null,
  );
  assert.equal(requests.length, 0);
  assert.equal(await meetingAddress(env, { lat: 43.85, lng: 18.4 }), null);
  assert.equal(await meetingAddress(env, { lat: 43.85, lng: 18.4 }), null);
  assert.equal(requests.length, 1);
});
