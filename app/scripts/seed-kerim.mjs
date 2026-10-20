// Explicitly requested synthetic beta offers. Does not create a usable login.
import { writeFileSync } from "node:fs";
import { departureMs } from "../server/places.mjs";
import catalog from "../server/vehicle-catalog.json" with { type: "json" };
const output = process.argv[2];
if (!output) throw Error("Usage: node scripts/seed-kerim.mjs /tmp/kerim.sql");
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Sarajevo",
}).format(new Date());
const start = new Date(today + "T12:00:00Z");
start.setUTCDate(start.getUTCDate() + 1);
const end = new Date(today + "T12:00:00Z");
end.setUTCFullYear(end.getUTCFullYear() + 1);
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const driver = "usput-demo-kerim-v1",
  make = catalog.brands.find((b) => b.name === "Volkswagen");
if (!make) throw Error("Volkswagen missing from catalogue");
const now = Date.now();
const sql = [
  `INSERT INTO users(id,name,email,password,salt,created_at) VALUES(${quote(driver)},'Kerim (demo)','kerim.demo@usput.invalid',NULL,NULL,${now}) ON CONFLICT(id) DO NOTHING;`,
  `INSERT INTO vehicles(id,user_id,make_id,make,model,color,manual_model,created_at,updated_at) VALUES('usput-demo-kerim-golf5',${quote(driver)},${quote(make.id)},'Volkswagen','Golf 5','crvena',1,${now},${now}) ON CONFLICT(user_id) DO NOTHING;`,
];
let count = 0;
for (
  let date = new Date(start);
  date <= end;
  date.setUTCDate(date.getUTCDate() + 1)
) {
  const day = date.toISOString().slice(0, 10),
    departure = departureMs(day, "07:30");
  if (!Number.isFinite(departure))
    throw Error("Invalid Sarajevo departure " + day);
  sql.push(
    `INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,note,created_at) VALUES(${quote("usput-demo-kerim-" + day)},${quote(driver)},'bascarsija','ilidza',${quote(day)},'07:30',${departure},'Volkswagen Golf 5 · Crvena','DEMO / TEST: Izmišljeni vozač za testiranje pretrage Baščaršija → Ilidža. Nije stvarna ponuda prevoza.',${now}) ON CONFLICT(id) DO NOTHING;`,
  );
  count++;
}
writeFileSync(output, sql.join("\n") + "\n");
console.log(
  JSON.stringify({
    offers: count,
    first: start.toISOString().slice(0, 10),
    last: end.toISOString().slice(0, 10),
    departure: "07:30 Europe/Sarajevo",
    driver: "Kerim (demo)",
    vehicle: "Volkswagen Golf 5 · Crvena",
    output,
  }),
);
