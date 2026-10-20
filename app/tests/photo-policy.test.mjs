import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectWebP } from "../server/photos.mjs";
function image(w = 320, h = 320) {
  const a = new Uint8Array(30),
    v = new DataView(a.buffer);
  a.set(new TextEncoder().encode("RIFF"));
  v.setUint32(4, 22, true);
  a.set(new TextEncoder().encode("WEBPVP8L"), 8);
  v.setUint32(16, 10, true);
  a[20] = 0x2f;
  v.setUint32(21, ((h - 1) << 14) | (w - 1), true);
  return a;
}
function addChunk(bytes, name, payload, before = false) {
  const chunk = new Uint8Array(8 + payload.length + (payload.length % 2));
  chunk.set(new TextEncoder().encode(name));
  new DataView(chunk.buffer).setUint32(4, payload.length, true);
  chunk.set(payload, 8);
  const a = new Uint8Array(bytes.length + chunk.length);
  a.set(bytes.subarray(0, 12));
  if (before) {
    a.set(chunk, 12);
    a.set(bytes.subarray(12), 12 + chunk.length);
  } else {
    a.set(bytes.subarray(12), 12);
    a.set(chunk, bytes.length);
  }
  new DataView(a.buffer).setUint32(4, a.length - 8, true);
  return a;
}
test("photo policy rejects EXIF, XMP, animation, unknown chunks and excess bytes", () => {
  for (const kind of ["EXIF", "XMP ", "ANIM", "ANMF", "JUNK"])
    assert.throws(() =>
      inspectWebP(addChunk(image(), kind, new Uint8Array([1, 2])), "avatar"),
    );
  assert.throws(() => inspectWebP(new Uint8Array(50 * 1024 + 1), "avatar"));
  assert.throws(() => inspectWebP(image(321, 321), "avatar"));
  assert.throws(() => inspectWebP(image(961, 320), "vehicle"));
  assert.throws(() => inspectWebP(image(320, 200), "avatar"));
});
test("extended WebP canvas dimensions cannot exceed policy or disagree with frame", () => {
  for (const edge of [16000, 100]) {
    const p = new Uint8Array(10),
      v = new DataView(p.buffer);
    v.setUint32(4, edge - 1, true);
    p[7] = (edge - 1) & 255;
    p[8] = ((edge - 1) >>> 8) & 255;
    p[9] = ((edge - 1) >>> 16) & 255;
    const a = addChunk(image(), "VP8X", p, true);
    assert.throws(() => inspectWebP(a, "avatar"));
  }
});
