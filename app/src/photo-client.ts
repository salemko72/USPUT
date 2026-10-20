import { t } from "./i18n";
export type PhotoKind = "avatar" | "vehicle";
export type PhotoMeta = {
  id: string;
  url: string;
  bytes: number;
  width: number;
  height: number;
};
export type OwnPhotos = {
  avatar: PhotoMeta | null;
  vehicle: PhotoMeta | null;
  available: boolean;
};
export type RidePhotos = {
  driverAvatar: PhotoMeta | null;
  passengerAvatar: PhotoMeta | null;
  vehicle: PhotoMeta | null;
};
export const PHOTO_LIMITS = {
  avatar: { edge: 320, bytes: 50 * 1024 },
  vehicle: { edge: 960, bytes: 150 * 1024 },
};
// Canvas may include a browser color profile. Keep only the new image data.
async function stripMetadata(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const chunks: Uint8Array[] = [];
  for (let pos = 12; pos + 8 <= bytes.length;) {
    const size = view.getUint32(pos + 4, true);
    const end = pos + 8 + size + (size % 2);
    if (end > bytes.length)
      throw Error(t("Priprema fotografije nije uspjela."));
    const type = String.fromCharCode(...bytes.subarray(pos, pos + 4));
    if (!["ICCP", "EXIF", "XMP "].includes(type)) {
      const chunk = bytes.slice(pos, end);
      if (type === "VP8X") chunk[8] &= ~0x2c;
      chunks.push(chunk);
    }
    pos = end;
  }
  const out = new Uint8Array(12 + chunks.reduce((n, c) => n + c.length, 0));
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  let offset = 12;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return new Blob([out], { type: "image/webp" });
}
export async function preparePhoto(
  file: File,
  kind: PhotoKind,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)
  )
    throw Error(t("Odaberi JPG, PNG ili WebP fotografiju."));
  if (file.size > 15 * 1024 * 1024)
    throw Error(t("Izvorna fotografija treba biti manja od 15 MB."));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Error(t("Ovu fotografiju nije moguće otvoriti. Odaberi drugu."));
  }
  try {
    if (bitmap.width < 64 || bitmap.height < 64)
      throw Error(t("Fotografija je premala za prepoznavanje."));
    const limits = PHOTO_LIMITS[kind];
    let edge = limits.edge;
    for (let resize = 0; resize < 5; resize++) {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width =
        kind === "avatar"
          ? Math.min(edge, bitmap.width, bitmap.height)
          : Math.round(bitmap.width * ratio);
      canvas.height =
        kind === "avatar" ? canvas.width : Math.round(bitmap.height * ratio);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx)
        throw Error(
          t("Priprema fotografije nije dostupna u ovom pregledniku."),
        );
      ctx.fillStyle = "#f6f5f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (kind === "avatar") {
        const side = Math.min(bitmap.width, bitmap.height);
        ctx.drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      } else ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.76, 0.68, 0.6, 0.52]) {
        const encoded = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality),
        );
        if (!encoded || encoded.type !== "image/webp")
          throw Error(
            t(
              "Ovaj preglednik ne podržava pripremu WebP slike. Pokušaj novijim preglednikom.",
            ),
          );
        const blob = await stripMetadata(encoded);
        if (blob.size <= limits.bytes)
          return { blob, width: canvas.width, height: canvas.height };
      }
      edge = Math.floor(edge * 0.8);
    }
    throw Error(
      t(
        "Fotografiju nije moguće dovoljno smanjiti. Odaberi jednostavniji kadar.",
      ),
    );
  } finally {
    bitmap.close();
  }
}
async function json<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
  });
  let body;
  try {
    body = await r.json();
  } catch {
    throw Error(t("Fotografije trenutno nisu dostupne."));
  }
  if (!r.ok) throw Error(body.error || t("Fotografija nije sačuvana."));
  return body;
}
const DEMO_KEY = "usput-demo-photos-v1";
type DemoPhotos = {
  avatar?: PhotoMeta;
  vehicle?: PhotoMeta;
  vehicleLabel?: string;
};
function demoLoad(): DemoPhotos {
  try {
    const v = JSON.parse(localStorage.getItem(DEMO_KEY) || "{}");
    for (const k of ["avatar", "vehicle"])
      if (v[k] && !v[k].url?.startsWith("data:image/webp;base64,")) delete v[k];
    return v;
  } catch {
    return {};
  }
}
export async function getOwnPhotos(
  demo: boolean,
  vehicleLabel = "",
): Promise<OwnPhotos> {
  if (!demo) return json("/photos/me");
  const p = demoLoad();
  return {
    avatar: p.avatar || null,
    vehicle: p.vehicleLabel === vehicleLabel ? p.vehicle || null : null,
    available: true,
  };
}
export async function savePhoto(
  kind: PhotoKind,
  blob: Blob,
  demo: boolean,
  vehicleLabel = "",
): Promise<PhotoMeta> {
  if (!demo)
    return (
      await json<{ photo: PhotoMeta }>("/photos/" + kind, {
        method: "POST",
        headers: { "Content-Type": "image/webp" },
        body: blob,
      })
    ).photo;
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error(t("Demo slika nije sačuvana.")));
    r.readAsDataURL(blob);
  });
  const p = demoLoad();
  const photo = {
    id: crypto.randomUUID(),
    url,
    bytes: blob.size,
    width: 0,
    height: 0,
  };
  p[kind] = photo;
  if (kind === "vehicle") p.vehicleLabel = vehicleLabel;
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(p));
  } catch {
    throw Error(
      t(
        "Nema dovoljno lokalnog prostora za demo sliku. Prethodna slika je sačuvana.",
      ),
    );
  }
  return photo;
}
export async function removePhoto(kind: PhotoKind, demo: boolean) {
  if (!demo) {
    await json("/photos/" + kind + "/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return;
  }
  const p = demoLoad();
  delete p[kind];
  localStorage.setItem(DEMO_KEY, JSON.stringify(p));
}
export async function getRidePhotos(id: string): Promise<RidePhotos> {
  return json("/photos/ride/" + id);
}
export function getDemoRidePhotos(
  driver: boolean,
  vehicleLabel: string,
): RidePhotos {
  const p = demoLoad();
  return {
    driverAvatar: driver ? p.avatar || null : null,
    passengerAvatar: driver ? null : p.avatar || null,
    vehicle:
      driver && p.vehicleLabel === vehicleLabel ? p.vehicle || null : null,
  };
}
