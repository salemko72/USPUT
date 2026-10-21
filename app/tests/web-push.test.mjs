import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  verify,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizePushSubscription,
  pushConfigured,
  sendWebPush,
} from "../server/web-push.mjs";

function recipient(
  endpoint = "https://fcm.googleapis.com/fcm/send/test-token",
) {
  const key = createECDH("prime256v1");
  key.generateKeys();
  const auth = randomBytes(16);
  return {
    key,
    auth,
    subscription: {
      endpoint,
      expirationTime: null,
      keys: {
        p256dh: key.getPublicKey().toString("base64url"),
        auth: auth.toString("base64url"),
      },
    },
  };
}

function configuration() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const rawPublic = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(publicJwk.x, "base64url"),
    Buffer.from(publicJwk.y, "base64url"),
  ]);
  return {
    publicJwk,
    env: {
      VAPID_PUBLIC_KEY: rawPublic.toString("base64url"),
      VAPID_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: "jwk" })),
    },
  };
}

// This recipient implementation uses Node's native ECDH, HKDF and GCM rather
// than any sender helper, so incorrect contexts, key ordering or tags fail.
function decrypt(record, recipientKey, auth) {
  const bytes = Buffer.from(record);
  assert.equal(bytes.readUInt32BE(16), 4096);
  assert.equal(bytes[20], 65);
  const salt = bytes.subarray(0, 16);
  const senderPublic = bytes.subarray(21, 86);
  assert.equal(senderPublic[0], 4);
  const sharedSecret = recipientKey.computeSecret(senderPublic);
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    recipientKey.getPublicKey(),
    senderPublic,
  ]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, auth, info, 32));
  const cek = Buffer.from(
    hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0"),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  const encrypted = bytes.subarray(86);
  assert.ok(encrypted.length < 4096);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(encrypted.subarray(-16));
  const cleartext = Buffer.concat([
    decipher.update(encrypted.subarray(0, -16)),
    decipher.final(),
  ]);
  assert.equal(cleartext.at(-1), 2, "the single record must be final");
  return JSON.parse(cleartext.subarray(0, -1).toString("utf8"));
}

async function capturePush(
  payload = { title: "USPUT", body: "Nova vožnja 🚗" },
) {
  const target = recipient();
  const config = configuration();
  let request;
  const result = await sendWebPush(
    {
      ...config.env,
      PUSH_FETCH: async (url, init) => {
        request = { url, ...init, headers: new Headers(init.headers) };
        return new Response(null, { status: 201 });
      },
    },
    target.subscription,
    payload,
  );
  return { target, config, request, result, payload };
}

test("web push exports the subscription, configuration and sender APIs", () => {
  assert.equal(typeof normalizePushSubscription, "function");
  assert.equal(typeof pushConfigured, "function");
  assert.equal(typeof sendWebPush, "function");
});

test("subscription normalization accepts browser provider endpoints and keys", async () => {
  const target = recipient();
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://push.services.mozilla.com/wpush/v2/token",
    "https://web.push.apple.com/token",
    "https://wns2-db5p.notify.windows.com/w/?token=example",
    "https://a.b.notify.windows.com/w/?token=example",
    "https://fcm.googleapis.com:443/fcm/send/token",
  ]) {
    const normalized = await normalizePushSubscription({
      ...target.subscription,
      endpoint,
    });
    assert.deepEqual(normalized, {
      endpoint: new URL(endpoint).href,
      keys: target.subscription.keys,
    });
  }
});

test("subscription normalization rejects unsafe endpoint destinations and syntax", async () => {
  const target = recipient();
  for (const endpoint of [
    "http://fcm.googleapis.com/token",
    "https://fcm.googleapis.com:444/token",
    "https://user:pass@fcm.googleapis.com/token",
    "https://@fcm.googleapis.com/token",
    "https://fcm.googleapis.com/token#fragment",
    "https://fcm.googleapis.com/token#",
    "https://fcm.googleapis.com.evil.example/token",
    "https://fcm.googleapis.com./token",
    "https://evilfcm.googleapis.com/token",
    "https://evilnotify.windows.com/token",
    "https://notify.windows.com/token",
    "https://a.notify.windows.com.evil.example/token",
    "https://localhost/token",
    "https://127.0.0.1/token",
    "https://[::1]/token",
    "https://169.254.169.254/token",
    "https://example.com/token",
    "https://fcm.googleapis.com\\@example.com/token",
    " https://fcm.googleapis.com/token",
    "https://fcm.googleapis.com/\ntoken",
    `https://fcm.googleapis.com/${"x".repeat(2048)}`,
    `https://fcm.googleapis.com/${"ž".repeat(400)}`,
    "not-a-url",
    null,
    17,
  ]) {
    await assert.rejects(
      () => normalizePushSubscription({ ...target.subscription, endpoint }),
      TypeError,
    );
  }
});

test("subscription normalization rejects malformed, noncanonical and invalid keys", async () => {
  const target = recipient();
  const invalidPoint = Buffer.alloc(65);
  invalidPoint[0] = 4;
  for (const input of [
    null,
    [],
    {},
    { ...target.subscription, keys: null },
    { ...target.subscription, keys: [] },
    ...[
      { p256dh: "", auth: target.subscription.keys.auth },
      {
        ...target.subscription.keys,
        p256dh: randomBytes(64).toString("base64url"),
      },
      {
        ...target.subscription.keys,
        p256dh: invalidPoint.toString("base64url"),
      },
      {
        ...target.subscription.keys,
        p256dh: `!${target.subscription.keys.p256dh.slice(1)}`,
      },
      {
        ...target.subscription.keys,
        p256dh: `${target.subscription.keys.p256dh}=`,
      },
      {
        ...target.subscription.keys,
        auth: randomBytes(15).toString("base64url"),
      },
      {
        ...target.subscription.keys,
        auth: randomBytes(17).toString("base64url"),
      },
      {
        ...target.subscription.keys,
        auth: `${target.subscription.keys.auth}==`,
      },
      { ...target.subscription.keys, auth: "_____________________x" },
      { ...target.subscription.keys, auth: 123 },
    ].map((keys) => ({ ...target.subscription, keys })),
  ]) {
    await assert.rejects(() => normalizePushSubscription(input), TypeError);
  }
});

test("push configuration requires both public and private VAPID material", () => {
  const { env } = configuration();
  assert.equal(pushConfigured(env), true);
  for (const input of [
    undefined,
    {},
    { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY },
    { VAPID_PRIVATE_JWK: env.VAPID_PRIVATE_JWK },
    { ...env, VAPID_PUBLIC_KEY: " " },
    { ...env, VAPID_PRIVATE_JWK: "" },
    { ...env, VAPID_PRIVATE_JWK: {} },
  ]) {
    assert.equal(pushConfigured(input), false);
  }
});

test("encrypted aes128gcm payload is independently decryptable and authenticated", async () => {
  const sent = await capturePush({
    id: "notification-123",
    title: "Nova vožnja",
    body: "Sarajevo → Mostar 🚗",
    url: "/notifications",
    tag: "usput-notification-123",
  });
  assert.deepEqual(sent.result, { ok: true });
  assert.equal(sent.request.url, sent.target.subscription.endpoint);
  assert.equal(sent.request.method, "POST");
  assert.equal(sent.request.redirect, "error");
  assert.equal(
    sent.request.headers.get("Content-Type"),
    "application/octet-stream",
  );
  assert.equal(sent.request.headers.get("Content-Encoding"), "aes128gcm");
  assert.equal(sent.request.headers.get("TTL"), "86400");
  assert.equal(sent.request.headers.get("Urgency"), "high");
  assert.ok(sent.request.signal instanceof AbortSignal);
  assert.deepEqual(
    decrypt(sent.request.body, sent.target.key, sent.target.auth),
    sent.payload,
  );
  const tampered = Buffer.from(sent.request.body);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decrypt(tampered, sent.target.key, sent.target.auth));
  assert.throws(() =>
    decrypt(sent.request.body, sent.target.key, randomBytes(16)),
  );
});

test("VAPID authentication carries a verified ES256 signature and provider claims", async () => {
  const sent = await capturePush();
  const authorization = sent.request.headers.get("Authorization");
  const match = authorization.match(
    /^vapid t=([^,\s]+),\s*k=([A-Za-z0-9_-]+)$/,
  );
  assert.ok(match);
  assert.equal(match[2], sent.config.env.VAPID_PUBLIC_KEY);
  const [header, claims, signature] = match[1].split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
    typ: "JWT",
    alg: "ES256",
  });
  const parsed = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(parsed.aud, new URL(sent.target.subscription.endpoint).origin);
  assert.equal(parsed.sub, "https://usput-pulse.salemko.workers.dev");
  const remaining = parsed.exp - Math.floor(Date.now() / 1000);
  assert.ok(remaining >= 43195 && remaining <= 43200);
  assert.equal(Buffer.from(signature, "base64url").length, 64);
  assert.equal(
    verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      {
        key: createPublicKey({ key: sent.config.publicJwk, format: "jwk" }),
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
});

test("each push uses fresh encryption while the notification topic remains stable", async () => {
  const target = recipient("https://web.push.apple.com/example-token");
  const { env } = configuration();
  const requests = [];
  const senderEnv = {
    ...env,
    VAPID_SUBJECT: "mailto:push@example.com",
    PUSH_FETCH: async (_url, init) => {
      requests.push({ ...init, headers: new Headers(init.headers) });
      return new Response(null, { status: 201 });
    },
  };
  for (const tag of ["ride:123", "ride:123", "ride:456"]) {
    assert.deepEqual(
      await sendWebPush(senderEnv, target.subscription, { tag }),
      {
        ok: true,
      },
    );
  }
  assert.notDeepEqual(
    Buffer.from(requests[0].body).subarray(0, 16),
    Buffer.from(requests[1].body).subarray(0, 16),
  );
  assert.notDeepEqual(
    Buffer.from(requests[0].body).subarray(21, 86),
    Buffer.from(requests[1].body).subarray(21, 86),
  );
  const topics = requests.map((request) => request.headers.get("Topic"));
  assert.match(topics[0], /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(topics[0], topics[1]);
  assert.notEqual(topics[0], topics[2]);
  const jwt = requests[0].headers.get("Authorization").match(/t=([^,]+)/)[1];
  const claims = JSON.parse(
    Buffer.from(jwt.split(".")[1], "base64url").toString(),
  );
  assert.equal(claims.aud, "https://web.push.apple.com");
  assert.equal(claims.sub, "mailto:push@example.com");
});

test("provider status and Retry-After responses classify delivery outcomes", async () => {
  const target = recipient();
  const { env } = configuration();
  const dateRetry = new Date(Date.now() + 180_000).toUTCString();
  for (const [status, retry, expected] of [
    [200, null, { ok: true }],
    [202, null, { ok: true }],
    [204, null, { ok: true }],
    [404, null, { ok: false, gone: true }],
    [410, null, { ok: false, gone: true }],
    [400, "120", { ok: false }],
    [401, null, { ok: false }],
    [403, null, { ok: false }],
    [429, "120", { ok: false, retryAfter: 120 }],
    [503, "90", { ok: false, retryAfter: 90 }],
    [500, "invalid", { ok: false }],
    [502, null, { ok: false }],
    [503, dateRetry, null],
  ]) {
    const outcome = await sendWebPush(
      {
        ...env,
        PUSH_FETCH: async () =>
          new Response(null, {
            status,
            headers: retry ? { "Retry-After": retry } : {},
          }),
      },
      target.subscription,
      { title: "USPUT" },
    );
    if (expected) assert.deepEqual(outcome, expected);
    else {
      assert.equal(outcome.ok, false);
      assert.ok(outcome.retryAfter >= 175 && outcome.retryAfter <= 180);
    }
  }
});

test("transport errors do not throw or log sensitive subscription material", async (t) => {
  const target = recipient();
  const { env } = configuration();
  const logs = [];
  for (const method of ["log", "warn", "error"])
    t.mock.method(console, method, (...args) => logs.push(args));
  const outcome = await sendWebPush(
    {
      ...env,
      PUSH_FETCH: async () => {
        throw new Error(`Transport rejected ${target.subscription.endpoint}`);
      },
    },
    target.subscription,
    { title: "Private notification" },
  );
  assert.deepEqual(outcome, { ok: false });
  assert.deepEqual(logs, []);
});

test("HTTP delivery aborts after eight seconds and returns a retryable failure", async () => {
  const target = recipient();
  const { env } = configuration();
  let signal;
  const started = Date.now();
  const outcome = await sendWebPush(
    {
      ...env,
      PUSH_FETCH: (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init.signal;
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    },
    target.subscription,
    { title: "USPUT" },
  );
  assert.deepEqual(outcome, { ok: false });
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started >= 7900);
  assert.ok(Date.now() - started < 12_000);
});

test("invalid configuration, subscriptions and oversized payloads never reach a provider", async () => {
  const target = recipient();
  const { env } = configuration();
  const other = configuration();
  let attempts = 0;
  const transport = async () => {
    attempts++;
    return new Response(null, { status: 201 });
  };
  for (const [senderEnv, subscription, payload] of [
    [{}, target.subscription, { title: "USPUT" }],
    [{ ...env, VAPID_PRIVATE_JWK: "invalid" }, target.subscription, {}],
    [
      { ...env, VAPID_PUBLIC_KEY: other.env.VAPID_PUBLIC_KEY },
      target.subscription,
      {},
    ],
    [env, { ...target.subscription, endpoint: "https://example.com/push" }, {}],
    [env, target.subscription, { body: "x".repeat(2048) }],
    [env, target.subscription, { body: "🚗".repeat(600) }],
    [env, target.subscription, undefined],
  ]) {
    assert.deepEqual(
      await sendWebPush(
        { ...senderEnv, PUSH_FETCH: transport },
        subscription,
        payload,
      ),
      { ok: false },
    );
  }
  assert.equal(attempts, 0);
});

test("the key generator creates a private file and prints only safe metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usput-web-push-test-"));
  const destination = join(directory, "keys.json");
  const script = fileURLToPath(
    new URL("../scripts/create-push-keys.mjs", import.meta.url),
  );
  try {
    const generated = spawnSync(process.execPath, [script, destination], {
      encoding: "utf8",
    });
    assert.equal(generated.status, 0, generated.stderr);
    assert.equal(generated.stderr, "");
    const metadata = JSON.parse(generated.stdout);
    assert.equal(metadata.file, destination);
    assert.equal(Buffer.from(metadata.publicKey, "base64url").length, 65);
    assert.equal((await stat(destination)).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(metadata).sort(), ["file", "publicKey"]);

    const repeated = spawnSync(process.execPath, [script, destination], {
      encoding: "utf8",
    });
    assert.equal(
      repeated.status,
      1,
      "existing private keys must not be overwritten",
    );
    assert.equal(repeated.stdout, "");
    assert.doesNotMatch(repeated.stderr, /privateJwk|"d"\s*:/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
