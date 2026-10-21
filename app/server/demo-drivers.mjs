import { getPlace } from "./places.mjs";
import { normalizeLocation } from "./route-provider.mjs";

const detail =
  "Isključivo testna tačka za izmišljenu vožnju. Nije provjereno mjesto za zaustavljanje.";
// Street coordinates were checked against OSM/Nominatim. These remain approximate
// demo pins; they are not reviewed public pickup locations or catalogue entries.
const street = (name, lat, lng) =>
  normalizeLocation({
    name,
    lat,
    lng,
    city: "Sarajevo",
    countryCode: "BA",
    detail,
  });
const aleja = street("Aleja lipa, Sarajevo", 43.85107, 18.38276);
const ante = street("Ante Babića, Sarajevo", 43.83469, 18.3447);
const obala = street("Obala Kulina bana, Sarajevo", 43.85698, 18.42585);
const driver = (key, name, from, to, points, vehicle) => ({
  key,
  name: `${name} (demo)`,
  driverId: `usput-demo-${key}-v1`,
  ridePrefix: `usput-demo-${key}-`,
  email: `${key}.demo@usput.invalid`,
  from,
  to,
  vehicle,
  stops: points.map((p) => ({ ...p, name: "Demo — " + p.name, detail })),
});

export const demoDrivers = [
  driver(
    "kerim",
    "Kerim",
    getPlace("bascarsija"),
    getPlace("ilidza"),
    ["bascarsija", "marijin", "cengic", "nedzarici", "ilidza"].map(getPlace),
    {
      id: "usput-demo-kerim-golf5",
      makeId: "volkswagen",
      make: "Volkswagen",
      model: "Golf 5",
      color: "crvena",
      manualModel: true,
    },
  ),
  driver(
    "senad",
    "Senad",
    aleja,
    obala,
    [aleja, getPlace("skenderija"), obala],
    {
      id: "usput-demo-senad-kamiq",
      makeId: "skoda",
      make: "Škoda",
      model: "Kamiq",
      color: "bijela",
      manualModel: false,
    },
  ),
  driver(
    "vesna",
    "Vesna",
    ante,
    obala,
    [
      ante,
      getPlace("nedzarici"),
      getPlace("cengic"),
      getPlace("skenderija"),
      obala,
    ],
    {
      id: "usput-demo-vesna-cooper",
      makeId: "mini",
      make: "MINI",
      model: "Cooper",
      color: "zlatna",
      manualModel: false,
    },
  ),
];

// Neither a client flag, a display name nor a note containing "demo" grants
// simulator privileges. Only the seeded user AND its exact offer identity do.
export function demoDriverForRide(row) {
  return demoDrivers.find(
    (d) =>
      row?.driver_id === d.driverId &&
      typeof row.id === "string" &&
      row.id.startsWith(d.ridePrefix) &&
      /^\d{4}-\d{2}-\d{2}$/.test(row.id.slice(d.ridePrefix.length)),
  );
}
