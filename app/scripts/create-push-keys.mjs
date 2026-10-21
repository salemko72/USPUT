#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (process.argv.length !== 3) {
  console.error(
    "Usage: node scripts/create-push-keys.mjs /path/to/new-keys.json",
  );
  process.exitCode = 1;
} else {
  try {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const publicKey = Buffer.from(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    ).toString("base64url");
    const privateJwk = JSON.stringify(
      await crypto.subtle.exportKey("jwk", pair.privateKey),
    );
    const file = resolve(process.argv[2]);
    await writeFile(file, `${JSON.stringify({ publicKey, privateJwk })}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    console.log(JSON.stringify({ file, publicKey }));
  } catch {
    console.error(
      "Could not create push keys. Choose a new writable file path.",
    );
    process.exitCode = 1;
  }
}
