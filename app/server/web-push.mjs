const encoder = new TextEncoder();
const providers = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);
const windowsSuffix = ".notify.windows.com";
const maxPayloadBytes = 2048;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeKey(value, length) {
  if (
    typeof value !== "string" ||
    value.length !== Math.ceil((length * 8) / 6) ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new TypeError("Invalid push key.");
  const bytes = Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (character) => character.charCodeAt(0),
  );
  if (bytes.length !== length || base64url(bytes) !== value)
    throw new TypeError("Invalid push key.");
  return bytes;
}

function allowedHost(hostname) {
  if (providers.has(hostname)) return true;
  if (hostname.length > 253 || !hostname.endsWith(windowsSuffix)) return false;
  return hostname
    .slice(0, -windowsSuffix.length)
    .split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export async function normalizePushSubscription(raw) {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new TypeError();
    const endpoint = raw.endpoint;
    if (
      typeof endpoint !== "string" ||
      endpoint.length > 2048 ||
      /[\u0000-\u0020\u007f\\#]/.test(endpoint) ||
      /^https:\/\/[^/?#]*@/i.test(endpoint)
    )
      throw new TypeError();
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== "443") ||
      url.href.length > 2048 ||
      !allowedHost(url.hostname)
    )
      throw new TypeError();
    if (!raw.keys || typeof raw.keys !== "object" || Array.isArray(raw.keys))
      throw new TypeError();
    const publicKey = decodeKey(raw.keys.p256dh, 65);
    if (publicKey[0] !== 4) throw new TypeError();
    decodeKey(raw.keys.auth, 16);
    // Import checks curve membership as well as the uncompressed point format.
    await crypto.subtle.importKey(
      "raw",
      publicKey,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    return {
      endpoint: url.href,
      keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
    };
  } catch {
    throw new TypeError("Invalid push subscription.");
  }
}

export function pushConfigured(env) {
  return Boolean(
    typeof env?.VAPID_PUBLIC_KEY === "string" &&
    env.VAPID_PUBLIC_KEY.trim() &&
    typeof env?.VAPID_PRIVATE_JWK === "string" &&
    env.VAPID_PRIVATE_JWK.trim(),
  );
}

function concatenate(...parts) {
  const bytes = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

async function hkdf(material, salt, info, bits) {
  const key = await crypto.subtle.importKey("raw", material, "HKDF", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      key,
      bits,
    ),
  );
}

async function encrypt(subscription, plaintext) {
  const recipientPublic = decodeKey(subscription.keys.p256dh, 65);
  const recipientKey = await crypto.subtle.importKey(
    "raw",
    recipientPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sender = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const senderPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", sender.publicKey),
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    sender.privateKey,
    256,
  );
  // RFC 8291 section 3.3: recipient public key precedes sender public key.
  const ikm = await hkdf(
    sharedSecret,
    decodeKey(subscription.keys.auth, 16),
    concatenate(
      encoder.encode("WebPush: info\0"),
      recipientPublic,
      senderPublic,
    ),
    256,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const [cek, nonce] = await Promise.all([
    hkdf(ikm, salt, encoder.encode("Content-Encoding: aes128gcm\0"), 128),
    hkdf(ikm, salt, encoder.encode("Content-Encoding: nonce\0"), 96),
  ]);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      key,
      concatenate(plaintext, new Uint8Array([2])),
    ),
  );
  // RFC 8188 header: salt, 4096-byte record size, key-id length, sender key.
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = senderPublic.length;
  return concatenate(header, senderPublic, ciphertext);
}

async function authorization(env, endpoint) {
  const rawPublic = decodeKey(env.VAPID_PUBLIC_KEY, 65);
  if (rawPublic[0] !== 4) throw new TypeError();
  const privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  if (
    privateJwk?.kty !== "EC" ||
    privateJwk.crv !== "P-256" ||
    privateJwk.x !== base64url(rawPublic.subarray(1, 33)) ||
    privateJwk.y !== base64url(rawPublic.subarray(33))
  )
    throw new TypeError();
  decodeKey(privateJwk.d, 32);
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const jwtHeader = base64url(
    encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const claims = base64url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: env.VAPID_SUBJECT || "https://usput-pulse.salemko.workers.dev",
      }),
    ),
  );
  const unsigned = `${jwtHeader}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      encoder.encode(unsigned),
    ),
  );
  return `vapid t=${unsigned}.${base64url(signature)},k=${env.VAPID_PUBLIC_KEY}`;
}

function retryAfter(response) {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), .+ GMT$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
    : undefined;
}

export async function sendWebPush(env, subscription, payload) {
  let timeout;
  try {
    if (!pushConfigured(env)) return { ok: false };
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) return { ok: false };
    const plaintext = encoder.encode(serialized);
    if (plaintext.length > maxPayloadBytes) return { ok: false };
    const normalized = await normalizePushSubscription(subscription);
    const [body, auth] = await Promise.all([
      encrypt(normalized, plaintext),
      authorization(env, normalized.endpoint),
    ]);
    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      Authorization: auth,
      TTL: "86400",
      Urgency: "high",
    });
    const notificationId = payload?.tag || payload?.id;
    if (typeof notificationId === "string" && notificationId) {
      const hash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", encoder.encode(notificationId)),
      );
      headers.set("Topic", base64url(hash).slice(0, 32));
    }
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 8000);
    const pushFetch =
      typeof env.PUSH_FETCH === "function" ? env.PUSH_FETCH : fetch;
    const response = await pushFetch(normalized.endpoint, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status >= 200 && response.status < 300) return { ok: true };
    if (response.status === 404 || response.status === 410)
      return { ok: false, gone: true };
    if (response.status === 429 || response.status >= 500) {
      const seconds = retryAfter(response);
      if (seconds !== undefined) return { ok: false, retryAfter: seconds };
    }
    return { ok: false };
  } catch {
    // Provider errors can contain endpoints and keys; keep them out of logs.
    return { ok: false };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
