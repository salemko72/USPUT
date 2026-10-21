import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { adaptSqlite } from "../server/db.mjs";
import { handleSavedSearchApi } from "../server/saved-searches.mjs";

let sqlite, env;
const alice = { id: "alice" },
  bob = { id: "bob" };
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  sqlite.exec(
    readFileSync(
      new URL("../server/migrations/0009_saved_searches.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const user of [alice, bob])
    sqlite
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .run(user.id, user.id, user.id + "@example.test", 1);
  env = { DB: adaptSqlite(sqlite) };
});
afterEach(() => sqlite.close());

const query = (extra = {}) => ({
  from: "ilidza",
  to: "centar",
  date: "2030-10-22",
  time: "07:30",
  walkMinutes: "5",
  ...extra,
});
async function call(
  path = "/saved-searches",
  method = "GET",
  body,
  user = alice,
) {
  const response = await handleSavedSearchApi(path, method, body, user, env);
  assert.ok(response instanceof Response);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  return { status: response.status, data: await response.json() };
}
const save = (q = query(), user = alice) =>
  call("/saved-searches", "POST", { query: q }, user);

test("saved searches require an account and unrelated routes are left to the dispatcher", async () => {
  for (const method of ["GET", "POST", "DELETE"])
    assert.equal(
      (
        await call(
          "/saved-searches" + (method === "DELETE" ? "/missing" : ""),
          method,
          { query: query() },
          null,
        )
      ).status,
      401,
    );
  assert.equal(
    await handleSavedSearchApi("/vehicle", "GET", undefined, null, env),
    null,
  );
});

test("list and delete are owner-bound without revealing another account's endpoints", async () => {
  const saved = await save();
  assert.equal(saved.status, 200);
  const id = saved.data.search.id;
  assert.equal((await call()).data.searches.length, 1);
  assert.deepEqual(
    (await call("/saved-searches", "GET", undefined, bob)).data.searches,
    [],
  );
  assert.equal(
    (await call("/saved-searches/" + id, "DELETE", undefined, bob)).status,
    404,
  );
  assert.equal((await call()).data.searches.length, 1);
  assert.equal((await call("/saved-searches/" + id, "DELETE")).status, 200);
  assert.deepEqual((await call()).data.searches, []);
});

test("each account can save the same route independently", async () => {
  const own = (await save()).data.search;
  const other = (await save(query(), bob)).data.search;
  assert.notEqual(own.id, other.id);
  assert.equal((await call()).data.searches[0].id, own.id);
  assert.equal(
    (await call("/saved-searches", "GET", undefined, bob)).data.searches[0].id,
    other.id,
  );
});

test("resaving ignores date and display labels and moves a route to the front", async () => {
  const first = (await save()).data.search;
  const second = (await save(query({ time: "08:00" }))).data.search;
  const fromLocation = JSON.stringify({
    ...JSON.parse(first.query.fromLocation),
    name: "Novi naziv",
  });
  const repeated = (await save(query({ date: "2040-01-01", fromLocation })))
    .data.search;
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.createdAt, first.createdAt);
  assert.ok(repeated.updatedAt > second.updatedAt);
  assert.deepEqual(
    (await call()).data.searches.map((s) => s.id),
    [first.id, second.id],
  );
  assert.equal(repeated.query.date, undefined);
  assert.equal(JSON.parse(repeated.query.fromLocation).name, "Novi naziv");
  assert.ok(
    !sqlite
      .prepare("SELECT query_json FROM saved_searches WHERE id=?")
      .get(first.id)
      .query_json.includes("2040-01-01"),
  );
});

test("valid private endpoint snapshots round-trip while coordinates, time and walking budget distinguish routes", async () => {
  const from = {
    lat: 43.81,
    lng: 18.31,
    name: "Privatno polazište",
    city: "Sarajevo",
    detail: "Ulaz 2",
  };
  const q = query({ from: "private", fromLocation: JSON.stringify(from) });
  const first = (await save(q)).data.search;
  assert.equal(JSON.parse(first.query.fromLocation).detail, from.detail);
  assert.equal(JSON.parse(first.query.toLocation).name, "Centar");
  assert.equal(
    (await save({ ...q, fromLocation: { ...from, lng: 18.32 } })).status,
    200,
  );
  assert.equal((await save({ ...q, walkMinutes: "10" })).status, 200);
  assert.equal((await save({ ...q, time: "08:30" })).status, 200);
  assert.equal((await call()).data.searches.length, 4);
});

test("only the newest 30 saved searches are retained per account", async () => {
  const other = (await save(query(), bob)).data.search;
  const ids = [];
  for (let minute = 0; minute < 31; minute++)
    ids.push(
      (await save(query({ time: "09:" + String(minute).padStart(2, "0") })))
        .data.search.id,
    );
  const rows = (await call()).data.searches;
  assert.equal(rows.length, 30);
  assert.deepEqual(
    rows.map((r) => r.id),
    ids.slice(1).reverse(),
  );
  assert.equal(
    (await call("/saved-searches", "GET", undefined, bob)).data.searches[0].id,
    other.id,
  );
});

test("invalid endpoints, time and walking budget never create saved searches", async () => {
  for (const q of [
    null,
    [],
    query({ from: "unknown" }),
    query({ fromLocation: "not-json" }),
    query({ toLocation: { lat: 999, lng: 18, name: "Invalid" } }),
    query({ to: "ilidza" }),
    query({ time: "24:00" }),
    query({ time: "7:30" }),
    query({ walkMinutes: "0" }),
    query({ walkMinutes: "5 or 10" }),
    query({ walkMinutes: undefined }),
  ])
    assert.equal((await save(q)).status, 400, JSON.stringify(q));
  assert.deepEqual((await call()).data.searches, []);
});

test("endpoint names must remain valid after location normalization", async () => {
  const response = await save(
    query({ fromLocation: { lat: 43.81, lng: 18.31, name: "\u0000\u0000" } }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual((await call()).data.searches, []);
});

async function clientModule() {
  const source = readFileSync(
    new URL("../src/saved-searches.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  return import(
    "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
  );
}

test("loading a saved search always uses today's Europe/Sarajevo date, including the UTC midnight boundary", async () => {
  const { restorePassengerSearch } = await clientModule();
  const saved = (await save()).data.search;
  assert.equal(
    restorePassengerSearch(saved.query, new Date("2026-07-01T22:30:00Z")).date,
    "2026-07-02",
  );
  assert.equal(
    restorePassengerSearch(saved.query, new Date("2026-12-01T22:30:00Z")).date,
    "2026-12-01",
  );
  assert.equal(
    restorePassengerSearch(saved.query, new Date("2026-12-01T23:30:00Z")).date,
    "2026-12-02",
  );
  assert.equal(saved.query.date, undefined);
});

test("autosave sends only the everyday query and preserves complete endpoint snapshots", async () => {
  const { savePassengerSearch } = await clientModule();
  const saved = (await save()).data.search;
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return Response.json({ search: saved });
  };
  try {
    await savePassengerSearch({ ...saved.query, date: "2032-01-01" });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(request.url, "/api/saved-searches");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.credentials, "same-origin");
  const sent = JSON.parse(request.options.body).query;
  assert.equal(sent.date, undefined);
  assert.equal(sent.fromLocation, saved.query.fromLocation);
  assert.equal(sent.toLocation, saved.query.toLocation);
});
