import {
  cachedProvider,
  fetchJson,
  normalizeLocation,
} from "./route-provider.mjs";
import { canonicalCity, fold, latin, withoutCity } from "./geocoding.mjs";

// Public city centres are a bias, never the location of a selected street.
// Other towns are resolved from the same provider and cached for a month.
const centres = {
  sarajevo: [18.4131, 43.8563],
  beograd: [20.4612, 44.8125],
  zagreb: [15.977, 45.813],
  "novi sad": [19.8335, 45.2671],
  "banja luka": [17.191, 44.7722],
  mostar: [17.8078, 43.3438],
  tuzla: [18.676, 44.538],
  split: [16.4402, 43.5081],
  ljubljana: [14.5058, 46.0569],
  podgorica: [19.2594, 42.4304],
};
const countries = new Set(["BA", "HR", "RS", "ME", "SI", "MK", "XK"]);
const cityMatches = (name, requested) =>
  typeof name === "string" && canonicalCity(name) === requested;
function pointValid(point) {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 85
  );
}
function nearby(a, b) {
  return (
    Math.hypot(
      (a[0] - b[0]) * 111320 * Math.cos((b[1] * Math.PI) / 180),
      (a[1] - b[1]) * 111320,
    ) <= 50000
  );
}
export async function suggestStreets(env, query, scope = {}) {
  scope = scope && typeof scope === "object" ? scope : {};
  const city =
    typeof scope?.city === "string"
      ? latin(scope.city.trim().slice(0, 80))
      : "";
  if (city.length < 2)
    throw new TypeError("Prvo odaberi grad za pretragu ulica.");
  const q =
    typeof query === "string"
      ? latin(
          withoutCity(query.normalize("NFC").trim().replace(/\s+/g, " "), city),
        )
      : "";
  if (!q || q.length > 180)
    throw new TypeError("Upiši barem prvo slovo ulice.");
  if (!env.PHOTON_URL) return null;
  const requested = canonicalCity(city);
  let centre = centres[requested];
  if (scope.lat !== undefined || scope.lng !== undefined) {
    const supplied = [scope.lng, scope.lat];
    if (!pointValid(supplied)) throw new TypeError("Lokacija nije ispravna.");
    // A stale device position must not move an explicitly selected city.
    if (!centre || nearby(supplied, centre)) centre = supplied;
  }
  if (!centre) {
    const result = await lookup("city:" + requested, { q: city, limit: 10 });
    if (result === null) return null;
    const match = result.features.find((f) => {
      const p = f.properties || {};
      return (
        p.osm_key === "place" &&
        ["city", "town", "village", "municipality"].includes(p.osm_value) &&
        cityMatches(p.name, requested) &&
        countries.has(String(p.countrycode).toUpperCase()) &&
        pointValid(f.geometry?.coordinates)
      );
    });
    if (!match) return { locations: [], fallback: false };
    centre = match.geometry.coordinates;
  }
  const deltaLat = 0.3,
    deltaLng = deltaLat / Math.max(0.1, Math.cos((centre[1] * Math.PI) / 180));
  const bbox = [
    centre[0] - deltaLng,
    centre[1] - deltaLat,
    centre[0] + deltaLng,
    centre[1] + deltaLat,
  ].join(",");
  let fallback = false;
  let locations = await search(q);
  if (locations === null) return null;
  // Photon handles fuzzy typeahead; if it has no useful street, offer a
  // clearly marked two-letter list. Never fabricate a full-address match.
  const prefix = [...q].slice(0, 2).join("");
  if (!locations.length && q.length > 2 && /\p{L}/u.test(prefix)) {
    locations = await search(prefix);
    if (locations === null) return null;
    fallback = locations.length > 0;
  }
  return { locations, fallback };

  async function search(term) {
    const data = await lookup(
      "street:" + JSON.stringify([fold(term), requested, bbox]),
      {
        q: term,
        bbox,
        lon: centre[0],
        lat: centre[1],
        limit: 30,
        zoom: 12,
        location_bias_scale: 0.1,
        // Photon street layer supports prefix/typo searches, unlike public Nominatim.
        layer: "street",
        ...(/\d/.test(term) ? { layer: "house" } : {}),
      },
    );
    if (data === null) return null;
    const seen = new Set(),
      wanted = fold(term);
    return data.features
      .flatMap((f) => {
        const p = f.properties || {},
          coordinates = f.geometry?.coordinates;
        if (
          !pointValid(coordinates) ||
          !nearby(coordinates, centre) ||
          !countries.has(String(p.countrycode).toUpperCase())
        )
          return [];
        if (
          ![p.city, p.town, p.village, p.municipality, p.county].some((name) =>
            cityMatches(name, requested),
          )
        )
          return [];
        const street = p.street || (p.osm_key === "highway" ? p.name : "");
        if (typeof street !== "string" || street.trim().length < 2) return [];
        // For short queries only show true prefixes, so A never suggests Obala.
        if (wanted.length <= 2 && !fold(street).startsWith(wanted)) return [];
        const name =
          latin(street) +
          (p.housenumber ? " " + p.housenumber : "") +
          ", " +
          city;
        const signature = fold(name);
        if (seen.has(signature)) return [];
        seen.add(signature);
        const place = normalizeLocation({
          name,
          lat: coordinates[1],
          lng: coordinates[0],
          city,
          countryCode: p.countrycode,
          detail: [
            latin(street) + (p.housenumber ? " " + p.housenumber : ""),
            latin(p.district),
            city,
            latin(p.state),
          ]
            .filter(Boolean)
            .join(", "),
        });
        return place ? [place] : [];
      })
      .sort(
        (a, b) =>
          Number(!fold(a.name).startsWith(wanted)) -
            Number(!fold(b.name).startsWith(wanted)) ||
          a.name.localeCompare(b.name, "bs"),
      )
      .slice(0, 12);
  }
  function lookup(key, parameters) {
    return cachedProvider(
      env,
      "photon-v1:" + env.PHOTON_URL + ":" + key,
      "autocomplete",
      async () => {
        const url = new URL("api/", env.PHOTON_URL.replace(/\/?$/, "/"));
        for (const [k, v] of Object.entries({ ...parameters, lang: "en" }))
          url.searchParams.set(k, String(v));
        const data = await fetchJson(env, url);
        if (!Array.isArray(data?.features))
          throw Error("InvalidGeocoderResponse");
        return { features: data.features.slice(0, 40) };
      },
      30 * 86400000,
    );
  }
}
