import { test } from "node:test";
import assert from "node:assert/strict";
import { demoStatus } from "../server/demo-expiry.mjs";
import { handleApi } from "../server/api.mjs";
import worker from "../server/worker.mjs";
const deadline = "2026-12-26T00:00:00+01:00";
const instant = Date.parse(deadline);
test("beta closes exactly at Sarajevo midnight, with no rolling extension", () => {
  assert.equal(
    demoStatus({ DEMO_EXPIRES_AT: deadline }, instant - 1).expired,
    false,
  );
  assert.equal(
    demoStatus({ DEMO_EXPIRES_AT: deadline }, instant).expired,
    true,
  );
  assert.equal(
    demoStatus({ DEMO_EXPIRES_AT: deadline }, instant + 86400000).expired,
    true,
  );
  assert.equal(instant, Date.parse("2026-12-25T23:00:00Z"));
});
test("removing the beta variable disables the limit; invalid limits fail closed", () => {
  assert.equal(demoStatus({}, instant + 1e12).expired, false);
  assert.equal(demoStatus({ DEMO_EXPIRES_AT: "typo" }).expired, true);
});
test("expired beta rejects reads, writes and login before accessing private data", async () => {
  const env = {
    DEMO_EXPIRES_AT: "2000-01-01T00:00:00Z",
    get DB() {
      throw Error("DB must not be read");
    },
  };
  for (const [path, method] of [
    ["/auth/me", "GET"],
    ["/rides", "POST"],
    ["/auth/login", "POST"],
    ["/photos/private", "GET"],
  ]) {
    const response = await handleApi(
      new Request("https://example.test/api" + path, { method }),
      env,
    );
    assert.equal(response.status, 410);
    assert.equal((await response.json()).code, "DEMO_EXPIRED");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  const response = await handleApi(
    new Request("https://example.test/api/demo-status"),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).expired, true);
});
test("Worker gates page and asset access after expiration and serves assets before it", async () => {
  let assets = 0;
  const env = {
    ASSETS: {
      fetch: async () => {
        assets++;
        return new Response("live app");
      },
    },
  };
  const ctx = { waitUntil() {} };
  let response = await worker.fetch(
    new Request("https://example.test/"),
    env,
    ctx,
  );
  assert.equal(await response.text(), "live app");
  assert.equal(assets, 1);
  for (const path of ["/", "/assets/app.js", "/forms/odluke"]) {
    response = await worker.fetch(
      new Request("https://example.test" + path),
      { ...env, DEMO_EXPIRES_AT: "2000-01-01T00:00:00Z" },
      ctx,
    );
    assert.equal(response.status, 410);
    assert.match(await response.text(), /Demo period je završen/);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  }
  assert.equal(assets, 1);
});
