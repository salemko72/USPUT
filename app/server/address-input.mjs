import cities from "../shared/city-centres.json" with { type: "json" };
import { canonicalCity, latin } from "./geocoding.mjs";
import {
  cachedProvider,
  fetchJson,
  normalizeLocation,
} from "./route-provider.mjs";
const known = (name) =>
  cities.find((c) =>
    [c.name, ...(c.aliases || [])].some(
      (n) => canonicalCity(n) === canonicalCity(name),
    ),
  );
const countries = new Set(["BA", "HR", "RS", "ME", "SI", "MK", "XK"]);
async function cityNamed(env, name, explicit) {
  if (name.length < 2 || name.length > 80 || /\d/.test(name)) return null;
  const local = known(name);
  if (local) return local;
  if (!env.PHOTON_URL && !explicit) return null;
  if (!env.PHOTON_URL && !env.GEOCODER_URL) return null;
  const provider = env.PHOTON_URL || env.GEOCODER_URL;
  return cachedProvider(
    env,
    "input-city-v1:" + provider + ":" + canonicalCity(name),
    "geocoder",
    async () => {
      if (env.PHOTON_URL) {
        const url = new URL("api/", env.PHOTON_URL.replace(/\/?$/, "/"));
        url.searchParams.set("q", name);
        url.searchParams.set("limit", "10");
        url.searchParams.set("lang", "en");
        const data = await fetchJson(env, url);
        if (!Array.isArray(data.features))
          throw Error("InvalidGeocoderResponse");
        const f = data.features.find((f) => {
          const p = f.properties || {},
            xy = f.geometry?.coordinates;
          return (
            p.osm_key === "place" &&
            ["city", "town", "village", "municipality"].includes(p.osm_value) &&
            canonicalCity(p.name || "") === canonicalCity(name) &&
            countries.has(String(p.countrycode).toUpperCase()) &&
            Array.isArray(xy) &&
            Number.isFinite(xy[0]) &&
            Number.isFinite(xy[1]) &&
            Math.abs(xy[0]) <= 180 &&
            Math.abs(xy[1]) <= 85
          );
        });
        return f
          ? {
              name: latin(f.properties.name),
              lng: f.geometry.coordinates[0],
              lat: f.geometry.coordinates[1],
              countryCode: String(f.properties.countrycode).toUpperCase(),
            }
          : null;
      }
      const url = new URL("search", env.GEOCODER_URL.replace(/\/?$/, "/"));
      for (const [k, v] of Object.entries({
        city: name,
        format: "jsonv2",
        addressdetails: "1",
        limit: "6",
        countrycodes: "ba,hr,rs,me,si,mk,xk",
        "accept-language": "bs-Latn,hr,sr-Latn,en",
      }))
        url.searchParams.set(k, v);
      const data = await fetchJson(env, url);
      if (!Array.isArray(data)) throw Error("InvalidGeocoderResponse");
      const f = data.find((f) => {
        const a = f.address || {},
          n = a.city || a.town || a.village || a.municipality;
        return (
          !a.road &&
          canonicalCity(n || "") === canonicalCity(name) &&
          countries.has(String(a.country_code).toUpperCase()) &&
          Number.isFinite(Number(f.lat)) &&
          Math.abs(Number(f.lat)) <= 85 &&
          Number.isFinite(Number(f.lon)) &&
          Math.abs(Number(f.lon)) <= 180
        );
      });
      return f
        ? {
            name: latin(
              f.address.city ||
                f.address.town ||
                f.address.village ||
                f.address.municipality,
            ),
            lat: Number(f.lat),
            lng: Number(f.lon),
            countryCode: f.address.country_code.toUpperCase(),
          }
        : null;
    },
    30 * 86400000,
  );
}
export async function resolveAddressInput(
  env,
  raw,
  rawScope = {},
  options = {},
) {
  const query =
    typeof raw === "string"
      ? latin(raw.normalize("NFC").trim().replace(/\s+/g, " "))
      : "";
  if (!query || query.length > 180)
    throw new TypeError("Upiši barem prvo slovo ulice.");
  const scope = rawScope && typeof rawScope === "object" ? rawScope : {};
  if (scope.lat !== undefined || scope.lng !== undefined) {
    if (
      !Number.isFinite(scope.lat) ||
      !Number.isFinite(scope.lng) ||
      Math.abs(scope.lat) > 85 ||
      Math.abs(scope.lng) > 180
    )
      throw new TypeError("Lokacija nije ispravna.");
  }
  const parts = query.split(",").map((p) => p.trim());
  let city = known(query),
    index = -1;
  if (!city && parts.length > 1) {
    // Recognise an explicit known city in either conventional address order.
    for (const i of [parts.length - 1, 0])
      if (known(parts[i])) {
        city = known(parts[i]);
        index = i;
        break;
      }
    if (!city)
      for (const i of [parts.length - 1, 0]) {
        const resolved = await cityNamed(env, parts[i], options.explicit).catch(
          () => null,
        );
        if (resolved) {
          city = resolved;
          index = i;
          break;
        }
      }
  }
  if (
    !city &&
    options.explicit &&
    parts.length === 1 &&
    (env.PHOTON_URL ||
      !scope.city ||
      canonicalCity(query) === canonicalCity(scope.city))
  )
    city = await cityNamed(env, query, true).catch(() => null);
  if (!city) return { query, scope, cityOnly: false };
  const remainder =
    index < 0
      ? ""
      : parts
          .filter((_, i) => i !== index)
          .filter(Boolean)
          .join(", ");
  const resolvedScope = { city: city.name, lat: city.lat, lng: city.lng };
  if (remainder)
    return { query: remainder, scope: resolvedScope, cityOnly: false };
  const location = normalizeLocation({
    name: city.name,
    city: city.name,
    lat: city.lat,
    lng: city.lng,
    countryCode: city.countryCode,
    detail: "Grad — odaberi približnu lokaciju na karti.",
  });
  return {
    query: city.name,
    scope: resolvedScope,
    cityOnly: true,
    location: { ...location, kind: "city" },
  };
}
