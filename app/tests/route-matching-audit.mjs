// Reproducible algorithm probe: real matching code, isolated SQLite, synthetic pedestrian responses.
// Never creates production users/rides or calls public routing services.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { adaptSqlite } from "../server/db.mjs";
import { proposalMatch } from "../server/pickup-proposals.mjs";
const lat = 44,
  scale = 111195 * Math.cos((lat * Math.PI) / 180);
const p = (id, x, y = 0) => ({
  id,
  name: id,
  city: "Virtualni grad",
  lat: lat + y / 111195,
  lng: 18 + x / scale,
});
const start = p("start", 0),
  end = p("end", 10000),
  departure = Date.now() + 86400000;
const base = {
  from: start,
  to: end,
  departure,
  route: {
    coordinates: [
      [start.lng, start.lat],
      [end.lng, end.lat],
    ],
    distance: 10000,
    duration: 1200,
  },
};
const cases = [];
for (const delta of [
  -3601, -3600, -1200, -901, -900, 0, 900, 901, 1200, 3600, 3601,
])
  cases.push({ name: `vrijeme ${delta}s od željenog susreta`, delta });
for (const limit of [5, 10, 15])
  for (const seconds of [limit * 60 - 1, limit * 60, limit * 60 + 1])
    cases.push({
      name: `hodanje ${seconds}s / limit ${limit}min`,
      limit,
      footSeconds: seconds,
      from: p("home", 2000, 60),
      to: p("work", 8000, 60),
    });
for (const y of [49, 50, 51, 100, 500])
  cases.push({
    name: `ručni pin ${y}m od trase`,
    pickup: p("pickup", 2000, y),
  });
for (const y of [300, 360, 500, 720, 1000, 1080, 1500, 2000])
  cases.push({
    name: `adresa ${y}m od trase / hodanje 10min`,
    from: p("home", 2000, y),
    limit: 10,
  });
cases.push(
  { name: "obrnuti smjer", from: p("home", 8000), to: p("work", 2000) },
  {
    name: "prepreka: 60m zračno, pješački 1800m",
    from: p("home", 2000, 60),
    factor: 30,
    limit: 15,
  },
  {
    name: "pješački servis nedostupan",
    offline: true,
    from: p("home", 2000, 60),
  },
  {
    name: "pješačka ruta neprohodna",
    unreachable: true,
    from: p("home", 2000, 60),
  },
  {
    name: "ista tačka ulaska i izlaska",
    from: p("same", 2000),
    to: p("same", 2000),
  },
  {
    name: "petlja: ulazak na povratku, izlazak na ranije prođenoj lokaciji",
    from: p("home", 4000),
    to: p("work", 2000),
    ride: {
      ...base,
      to: p("end", 0),
      route: {
        coordinates: [
          [18, 44],
          [18 + 6000 / scale, 44],
          [18, 44],
        ],
        distance: 12000,
        duration: 2400,
      },
    },
  },
);
async function run(c) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  const env = {
    DB: adaptSqlite(sqlite),
    OSRM_FOOT_URL: "https://synthetic-foot.invalid/",
    ROUTING_FETCH: async (input) => {
      if (c.offline) return new Response("", { status: 503 });
      if (c.unreachable) return Response.json({ code: "NoRoute" });
      const coords = new URL(input).pathname
        .split("/")
        .at(-1)
        .split(";")
        .map((s) => s.split(",").map(Number));
      const [a, b] = coords,
        distance =
          Math.hypot((a[0] - b[0]) * scale, (a[1] - b[1]) * 111195) *
          (c.factor || 1);
      const duration = c.footSeconds ?? Math.max(1, distance / 1.2);
      return Response.json({
        code: "Ok",
        waypoints: coords.map(() => ({ distance: 0 })),
        routes: [
          {
            distance,
            duration,
            geometry: { coordinates: coords },
            legs: [{ distance, duration }],
          },
        ],
      });
    },
  };
  try {
    const match = await proposalMatch(
      env,
      c.ride || base,
      c.from || p("home", 2000),
      c.to || p("work", 8000),
      departure + 240000 - (c.delta || 0) * 1000,
      c.limit || 10,
      c.pickup,
      undefined,
      {flexible:true},
    );
    return {
      scenario: c.name,
      result: match?.unavailable
        ? "NEPROVJERENO"
        : match
          ? "PONUDA"
          : "NEMA PONUDE",
      ...(match && !match.unavailable
        ? {
            category: match.assessment?.category,
            walkToMinutes: match.walkToMinutes,
            walkFromMinutes: match.walkFromMinutes,
            pickupDeltaSeconds:
              (match.pickupAt - (departure + 240000 - (c.delta || 0) * 1000)) /
              1000,
            extraMinutes: match.extraMinutes,
          }
        : {}),
    };
  } finally {
    sqlite.close();
  }
}
const results = await Promise.all(cases.map(run));
const report = {
  method:
    "Real flexible proposalMatch + isolated SQLite; deterministic foot service at 1.2m/s unless specified. No live map data.",
  results,
};
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
