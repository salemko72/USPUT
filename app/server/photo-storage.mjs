import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
export function localPhotoStorage(root) {
  const base = resolve(root);
  const file = (key) => {
    const p = resolve(base, key);
    if (!p.startsWith(base + "/")) throw Error("Invalid object key");
    return p;
  };
  return {
    async put(key, bytes) {
      const p = file(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, new Uint8Array(bytes));
    },
    async get(key) {
      try {
        return { body: await readFile(file(key)) };
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys])
        await rm(file(key), { force: true });
    },
  };
}
