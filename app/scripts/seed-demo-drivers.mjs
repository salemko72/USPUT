// Generates idempotent SQL for the explicitly requested fictional beta offers.
// It creates neither passwords nor sessions and never changes existing offers.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demoDrivers } from "../server/demo-drivers.mjs";
import { departureMs } from "../server/places.mjs";
import { validateVehicle, vehicleLabel } from "../server/vehicles.mjs";

const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
export function buildDemoSeed({
  today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sarajevo",
  }).format(new Date()),
  now = Date.now(),
  keys = ["senad", "vesna"],
} = {}) {
  if (!Number.isFinite(departureMs(today, "07:30")))
    throw Error("Invalid seed date");
  const start = new Date(today + "T12:00:00Z"),
    end = new Date(start);
  start.setUTCDate(start.getUTCDate() + 1);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const statements = [],
    summary = [];
  for (const d of demoDrivers.filter((d) => keys.includes(d.key))) {
    const vehicle = validateVehicle(d.vehicle);
    // Canonical catalogue model in the profile, familiar casing in the offer.
    const car = vehicleLabel({ ...vehicle, model: d.vehicle.model });
    statements.push(
      `INSERT INTO users(id,name,email,password,salt,city,created_at) VALUES(${quote(d.driverId)},${quote(d.name)},${quote(d.email)},NULL,NULL,'Sarajevo',${now}) ON CONFLICT(id) DO NOTHING;`,
      `INSERT INTO vehicles(id,user_id,make_id,make,model,color,manual_model,created_at,updated_at) VALUES(${quote(d.vehicle.id)},${quote(d.driverId)},${quote(vehicle.makeId)},${quote(vehicle.make)},${quote(vehicle.model)},${quote(vehicle.color)},${vehicle.manualModel ? 1 : 0},${now},${now}) ON CONFLICT(user_id) DO NOTHING;`,
    );
    let offers = 0;
    const note = `DEMO / TEST: Izmišljeni vozač za testiranje pretrage ${d.from.name} → ${d.to.name}. Nije stvarna ponuda prevoza.`;
    for (
      let date = new Date(start);
      date <= end;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const day = date.toISOString().slice(0, 10),
        departure = departureMs(day, "07:30");
      if (!Number.isFinite(departure))
        throw Error("Invalid Sarajevo departure " + day);
      statements.push(
        `INSERT INTO rides(id,driver_id,from_id,to_id,from_json,to_json,date,time,departure,car,note,created_at) VALUES(${quote(d.ridePrefix + day)},${quote(d.driverId)},${quote(d.from.id)},${quote(d.to.id)},${quote(JSON.stringify(d.from))},${quote(JSON.stringify(d.to))},${quote(day)},'07:30',${departure},${quote(car)},${quote(note)},${now}) ON CONFLICT(id) DO NOTHING;`,
      );
      offers++;
    }
    summary.push({
      driver: d.name,
      vehicle: car,
      offers,
      first: start.toISOString().slice(0, 10),
      last: end.toISOString().slice(0, 10),
      departure: "07:30 Europe/Sarajevo",
    });
  }
  return { statements, summary };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = process.argv[2];
  if (!output)
    throw Error(
      "Usage: node scripts/seed-demo-drivers.mjs /tmp/usput-demo.sql [YYYY-MM-DD]",
    );
  const { statements, summary } = buildDemoSeed({
    today: process.argv[3],
    ...(process.argv[4] ? { keys: process.argv[4].split(",") } : {}),
  });
  writeFileSync(output, statements.join("\n") + "\n");
  console.log(JSON.stringify({ drivers: summary, output }));
}
