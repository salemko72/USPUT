import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { handleApi } from "../server/api.mjs";
import { adaptSqlite } from "../server/db.mjs";

let sqlite, env, requests;
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  sqlite
    .prepare(
      "INSERT INTO users(id,name,email,created_at) VALUES('passenger','Passenger','pin@example.test',?)",
    )
    .run(Date.now());
  sqlite
    .prepare("INSERT INTO sessions VALUES(?,'passenger',?)")
    .run(
      createHash("sha256").update("pin-label-test-session").digest("hex"),
      Date.now() + 60000,
    );
  requests = [];
  env = {
    DB: adaptSqlite(sqlite),
    GEOCODER_URL: "https://geocoder.example.test/",
    ROUTING_FETCH: async (input) => {
      requests.push(new URL(input));
      return Response.json({
        lat: "43.90000",
        lon: "18.50000",
        address: { road: "Алеја липа", house_number: "99", city: "Сарајево" },
      });
    },
  };
});
afterEach(() => sqlite.close());
async function call(query, authenticated = true) {
  return handleApi(
    new Request("http://localhost/api/places/label?" + query, {
      headers: authenticated
        ? { Cookie: "usput_session=pin-label-test-session" }
        : {},
    }),
    env,
  );
}

test("the meeting label endpoint resolves the precise saved pin to a Latin street without a house number or provider centroid", async () => {
  const response = await call("lat=43.85107&lng=18.38276");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    label: "Aleja lipa, Sarajevo",
    approximate: true,
    attribution: "© OpenStreetMap contributors · Nominatim",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get("lat"), "43.85107");
  assert.equal(requests[0].searchParams.get("lon"), "18.38276");
  assert.match(requests[0].searchParams.get("accept-language"), /^bs-Latn,/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("meeting labels require authentication before any provider access", async () => {
  assert.equal((await call("lat=43.85&lng=18.38", false)).status, 401);
  assert.equal(requests.length, 0);
});

test("the endpoint rejects missing, repeated, non-decimal and out-of-range coordinates", async () => {
  for (const query of [
    "",
    "lat=&lng=18.38",
    "lat=43.85",
    "lat=NaN&lng=18.38",
    "lat=Infinity&lng=18.38",
    "lat=0x20&lng=18.38",
    "lat=43.85&lng=181",
    "lat=-85.01&lng=18.38",
    "lat=43.85&lat=43.86&lng=18.38",
    "lat=43.85&lng=18.38&lng=18.39",
  ])
    assert.equal((await call(query)).status, 400, query);
  assert.equal(requests.length, 0);
});

test("unavailable reverse labels fail explicitly and do not guess a passenger or driver address", async () => {
  env.ROUTING_FETCH = async () => {
    throw Error("offline");
  };
  const response = await call("lat=43.85107&lng=18.38276");
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
});

test("repeated precise labels share the provider cache and have a bounded per-user request budget", async () => {
  for (let i = 0; i < 120; i++)
    assert.equal((await call("lat=43.85107&lng=18.38276")).status, 200);
  assert.equal(requests.length, 1);
  assert.equal((await call("lat=43.85107&lng=18.38276")).status, 429);
});
