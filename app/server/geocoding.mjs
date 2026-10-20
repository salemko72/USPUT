import {
  cachedProvider,
  fetchJson,
  normalizeLocation,
} from "./route-provider.mjs";
export async function geocode(env, query) {
  if (!env.GEOCODER_URL) return null;
  const q = typeof query === "string" ? query.trim().replace(/\s+/g, " ") : "";
  if (q.length < 5 || q.length > 180)
    throw new TypeError("Unesi ulicu, približan broj i grad.");
  const key = "geocode-v1:" + env.GEOCODER_URL + ":" + q.toLowerCase();
  return cachedProvider(
    env,
    key,
    "geocoder",
    async () => {
      const url = new URL("search", env.GEOCODER_URL.replace(/\/?$/, "/"));
      url.searchParams.set("q", q);
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
