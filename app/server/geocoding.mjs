import {
  cachedProvider,
  fetchJson,
  normalizeLocation,
} from "./route-provider.mjs";
const latinAlphabet = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  ђ: "đ",
  е: "e",
  ж: "ž",
  з: "z",
  и: "i",
  ј: "j",
  к: "k",
  л: "l",
  љ: "lj",
  м: "m",
  н: "n",
  њ: "nj",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  ћ: "ć",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "č",
  џ: "dž",
  ш: "š",
};
export function latin(text) {
  if (typeof text !== "string") return text;
  return text.replace(/\p{L}+/gu, (word) => {
    const capitals = word === word.toUpperCase();
    return [...word]
      .map((letter) => {
        const translated = latinAlphabet[letter.toLowerCase()];
        if (!translated) return letter;
        if (letter === letter.toLowerCase()) return translated;
        return capitals
          ? translated.toUpperCase()
          : translated[0].toUpperCase() + translated.slice(1);
      })
      .join("");
  });
}
const latinLanguage = "bs-Latn,hr,sr-Latn,en";
const withoutDiacritics = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/Đ/g, "Dj");
export const fold = (s) =>
  withoutDiacritics(latin(s))
    .toLowerCase()
    .replace(/^grad /, "")
    .trim();
export function canonicalCity(name) {
  const normalized = fold(name).replace(/^city of /, "");
  return { belgrade: "beograd", skopje: "skoplje" }[normalized] || normalized;
}
export function withoutCity(query, city) {
  const requested = canonicalCity(city),
    parts = query.split(",").map((part) => part.trim());
  if (parts.length > 1 && canonicalCity(parts[0]) === requested)
    return parts.slice(1).join(", ");
  if (canonicalCity(parts.at(-1)) === requested)
    return parts.slice(0, -1).join(", ");
  const words = query.split(" ");
  for (let i = 0; i < words.length; i++) {
    if (canonicalCity(words.slice(i).join(" ")) === requested)
      return words.slice(0, i).join(" ");
  }
  return query;
}
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
        "accept-language": latinLanguage,
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
  const q =
    typeof query === "string"
      ? query.normalize("NFC").trim().replace(/\s+/g, " ")
      : "";
  if (q.length < 3 || q.length > 180)
    throw new TypeError("Unesi ulicu, približan broj i grad.");
  const scope = rawScope && typeof rawScope === "object" ? rawScope : {};
  const city =
    typeof scope.city === "string" ? scope.city.trim().slice(0, 80) : "";
  const point =
    scope.lat !== undefined || scope.lng !== undefined
      ? coordinates(scope)
      : null;
  const streetQuery = city ? withoutCity(q, city) : q,
    scopedQuery = city ? streetQuery + ", " + city : q;
  const key =
    "geocode-v3:" +
    env.GEOCODER_URL +
    ":" +
    JSON.stringify([scopedQuery.toLowerCase(), city, point]);
  let locations = await search(key, { q: scopedQuery });
  if (Array.isArray(locations) && !locations.length && city && streetQuery) {
    // A structured lookup avoids free-form parsing failures on full addresses.
    // Keep the selected city and the same bounds on every spelling variant.
    const variants = [
      ...new Set([streetQuery, withoutDiacritics(latin(streetQuery))]),
    ];
    for (const street of variants) {
      locations = await search(
        "geocode-street-v1:" +
          env.GEOCODER_URL +
          ":" +
          JSON.stringify([street.toLowerCase(), city, point]),
        { street, city },
      );
      if (!Array.isArray(locations) || locations.length) break;
    }
  }
  // Apply display normalization after cache reads too, preserving existing pins
  // and all provider metadata, including positively cached legacy results.
  return Array.isArray(locations)
    ? locations.map((location) => ({
        ...location,
        name: latin(location.name),
        detail: latin(location.detail),
      }))
    : locations;

  function search(cacheKey, parameters) {
    return cachedProvider(
      env,
      cacheKey,
      "geocoder",
      async () => {
        const url = new URL("search", env.GEOCODER_URL.replace(/\/?$/, "/"));
        for (const [name, value] of Object.entries(parameters))
          url.searchParams.set(name, value);
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
        url.searchParams.set("accept-language", latinLanguage);
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "6");
        url.searchParams.set("countrycodes", "ba,hr,rs,me,si,mk,xk");
        const data = await fetchJson(env, url);
        if (!Array.isArray(data)) throw Error("InvalidGeocoderResponse");
        return data
          .map((item) => {
            const a = item.address || {},
              street = a.road || a.pedestrian || a.residential || a.footway,
              locationCity = a.city || a.town || a.village || a.municipality;
            if (!street || !locationCity) return null;
            // City metadata can identify a district/municipality rather than the
            // metropolitan city. Check its administrative parents as well.
            const requested = canonicalCity(city || "");
            const cityMatches = (name) => {
              if (typeof name !== "string") return false;
              const value = canonicalCity(name);
              return (
                value === requested ||
                value.endsWith(" " + requested) ||
                value.startsWith(requested + " ")
              );
            };
            if (
              requested &&
              ![
                a.city,
                a.town,
                a.village,
                a.municipality,
                a.county,
                a.state_district,
              ].some(cityMatches)
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
                locationCity,
              detail: item.display_name || "Približna lokacija ulice",
              city: locationCity,
              countryCode: a.country_code,
            });
          })
          .filter(Boolean);
      },
      30 * 86400000,
    );
  }
}
