import { latin } from "./geocoding.mjs";
import { cachedProvider, fetchJson } from "./route-provider.mjs";

function coordinate(value, limit) {
  if (typeof value === "string" && /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))
    value = Number(value);
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > limit
  )
    throw new TypeError("Lokacija nije ispravna.");
  return Math.round(value * 1e5) / 1e5;
}
const text = (value, max) =>
  typeof value === "string"
    ? latin(value)
        .replace(/[\u0000-\u001f]/g, "")
        .trim()
        .slice(0, max)
    : "";

// This is display metadata for an existing pin. Provider centroids and house
// numbers must never become an agreement's location or a verified stopping point.
export async function meetingAddress(env, raw) {
  const lat = coordinate(raw?.lat, 85),
    lng = coordinate(raw?.lng, 180);
  if (!env.GEOCODER_URL) return null;
  return cachedProvider(
    env,
    `meeting-street-v1:${env.GEOCODER_URL}:${lat.toFixed(5)}:${lng.toFixed(5)}`,
    "geocoder",
    async () => {
      const url = new URL("reverse", env.GEOCODER_URL.replace(/\/?$/, "/"));
      for (const [key, value] of Object.entries({
        lat,
        lon: lng,
        format: "jsonv2",
        zoom: 18,
        addressdetails: 1,
        "accept-language": "bs-Latn,hr,sr-Latn,en",
      }))
        url.searchParams.set(key, String(value));
      const data = await fetchJson(env, url),
        address = data?.address;
      const street = text(
        address?.road ||
          address?.pedestrian ||
          address?.residential ||
          address?.footway,
        120,
      );
      const city = text(
        address?.city ||
          address?.town ||
          address?.village ||
          address?.municipality,
        80,
      );
      return street && city
        ? { label: `${street}, ${city}`, approximate: true }
        : null;
    },
    30 * 86400000,
  );
}
