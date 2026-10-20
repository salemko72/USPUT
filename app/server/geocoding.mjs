import {
  cachedProvider,
  fetchJson,
  normalizeLocation,
} from "./route-provider.mjs";
const fold = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^grad /, "")
    .trim();
function coordinates(raw) {
  if (
    !raw ||
    !Number.isFinite(raw.lat) ||
    !Number.isFinite(raw.lng) ||
    Math.abs(raw.lat) > 85 ||
    Math.abs(raw.lng) > 180
  )
    throw new TypeError("Lokacija nije ispravna.");
  return {
    lat: Math.round(raw.lat * 1000) / 1000,
    lng: Math.round(raw.lng * 1000) / 1000,
  };
}
export async function locateCity(env, raw) {
  const point = coordinates(raw);
  if (!env.GEOCODER_URL) return null;
  return cachedProvider(
    env,
    "city-v1:" + env.GEOCODER_URL + ":" + point.lat + ":" + point.lng,
    "geocoder",
    async () => {
      const url = new URL("reverse", env.GEOCODER_URL.replace(/\/?$/, "/"));
      for (const [key, value] of Object.entries({
        lat: point.lat,
        lon: point.lng,
        format: "jsonv2",
        zoom: 10,
        addressdetails: 1,
      }))
        url.searchParams.set(key, String(value));
      const data = await fetchJson(env, url),
        a = data?.address;
      const city = a?.city || a?.town || a?.village || a?.municipality;
      if (typeof city !== "string" || !city.trim())
        return { ...point, city: "" };
      return { ...point, city: city.trim().slice(0, 80) };
    },
    30 * 86400000,
  );
}
export async function geocode(env, query, rawScope) {
  if (!env.GEOCODER_URL) return null;
  const q = typeof query === "string" ? query.trim().replace(/\s+/g, " ") : "";
  if (q.length < 5 || q.length > 180)
    throw new TypeError("Unesi ulicu, približan broj i grad.");
  const scope = rawScope && typeof rawScope === "object" ? rawScope : {};
  const city =
    typeof scope.city === "string" ? scope.city.trim().slice(0, 80) : "";
  const point =
    scope.lat !== undefined || scope.lng !== undefined
      ? coordinates(scope)
      : null;
  const scopedQuery =
    city && !fold(q).includes(fold(city)) ? q + ", " + city : q;
  const key =
    "geocode-v2:" +
    env.GEOCODER_URL +
    ":" +
    JSON.stringify([scopedQuery.toLowerCase(), city, point]);
  return cachedProvider(
    env,
    key,
    "geocoder",
    async () => {
      const url = new URL("search", env.GEOCODER_URL.replace(/\/?$/, "/"));
      url.searchParams.set("q", scopedQuery);
      if (point) {
        const dLat = 0.35,
          dLng = dLat / Math.max(0.1, Math.cos((point.lat * Math.PI) / 180));
        url.searchParams.set(
          "viewbox",
          [
            Math.max(-180, point.lng - dLng),
            Math.min(85, point.lat + dLat),
            Math.min(180, point.lng + dLng),
            Math.max(-85, point.lat - dLat),
          ].join(","),
        );
        url.searchParams.set("bounded", "1");
      }
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "6");
      url.searchParams.set("countrycodes", "ba,hr,rs,me,si,mk,xk");
      const data = await fetchJson(env, url);
      if (!Array.isArray(data)) throw Error("InvalidGeocoderResponse");
      return data
        .map((item) => {
          const a = item.address || {},
            street = a.road || a.pedestrian || a.residential || a.footway,
            city = a.city || a.town || a.village || a.municipality;
          if (!street || !city) return null;
          if (
            typeof scope.city === "string" &&
            scope.city.trim() &&
            fold(city) !== fold(scope.city.trim())
          )
            return null;
          if (point) {
            const dy = (Number(item.lat) - point.lat) * 111320;
            const dx =
              (Number(item.lon) - point.lng) *
              111320 *
              Math.cos((point.lat * Math.PI) / 180);
            if (
              !Number.isFinite(dx) ||
              !Number.isFinite(dy) ||
              Math.hypot(dx, dy) > 50000
            )
              return null;
          }
          return normalizeLocation({
            lat: Number(item.lat),
            lng: Number(item.lon),
            name:
              street +
              (a.house_number ? " " + a.house_number : "") +
              ", " +
              city,
            detail: item.display_name || "Približna lokacija ulice",
            city,
            countryCode: a.country_code,
          });
        })
        .filter(Boolean);
    },
    30 * 86400000,
  );
}
