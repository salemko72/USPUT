// Synthetic integration fixture. No real provider requests or actual street routes.
process.env.PORT = process.env.PORT || "8796";
process.env.USPUT_DATA_DIR =
  process.env.USPUT_DATA_DIR || "/tmp/usput-street-fixture-" + Date.now();
const { env } = await import("../server/local.mjs");
env.OPENROUTESERVICE_API_KEY = "fixture-only";
env.GEOCODER_URL = "https://geocoder.example.test/";
env.ROUTING_FETCH = async (input, options = {}) => {
  const url = new URL(input);
  if (url.pathname.endsWith("/search")) {
    const query = url.searchParams.get("q"),
      end = /ilid|butmir|30/i.test(query),
      middle = /marij|10/i.test(query),
      dest = /nedzar|20/i.test(query),
      lng = end ? 18.3097 : middle ? 18.4056 : dest ? 18.3445 : 18.4314,
      lat = end ? 43.8293 : middle ? 43.8553 : dest ? 43.8401 : 43.8598;
    return new Response(
      JSON.stringify([
        {
          lat: String(lat),
          lon: String(lng),
          display_name: query,
          address: {
            road: query.split(",")[0],
            city: "Sarajevo",
            country_code: "ba",
          },
        },
      ]),
    );
  }
  const coords = JSON.parse(options.body).coordinates,
    foot = url.pathname.includes("foot-walking");
  const meters = coords
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum +
        Math.hypot(
          (p[0] - coords[i][0]) * 80000,
          (p[1] - coords[i][1]) * 111195,
        ),
      0,
    );
  let geometry = coords;
  if (
    !foot &&
    coords.length === 2 &&
    coords[0][0] > 18.42 &&
    coords[1][0] < 18.32
  )
    geometry = [coords[0], [18.4056, 43.8553], [18.3445, 43.8401], coords[1]];
  const duration = foot ? meters / 1.25 : 600,
    legs = coords.slice(1).map(() => ({
      duration: duration / (coords.length - 1),
      distance: meters / (coords.length - 1),
    }));
  return new Response(
    JSON.stringify({
      features: [
        {
          geometry: { coordinates: geometry },
          properties: {
            summary: { duration, distance: meters },
            segments: legs,
            way_points: coords.map((p) =>
              geometry.findIndex((q) => q[0] === p[0] && q[1] === p[1]),
            ),
          },
        },
      ],
    }),
  );
};
