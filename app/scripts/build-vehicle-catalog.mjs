import { getMakes, getModels, getDataSources } from "@meterapp/vehicle-db";
import { readFile, writeFile } from "node:fs/promises";
const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const pretty = {
  VOLKSWAGEN: "Volkswagen",
  SKODA: "Škoda",
  CITROEN: "Citroën",
  "MERCEDES-BENZ": "Mercedes-Benz",
  BMW: "BMW",
  BYD: "BYD",
  MG: "MG",
  DS: "DS",
  GMC: "GMC",
  MINI: "MINI",
  FIAT: "Fiat",
  DACIA: "Dacia",
  CUPRA: "Cupra",
  SEAT: "SEAT",
  "ALFA ROMEO": "Alfa Romeo",
};
const brands = new Map();
for (const type of [2, 7])
  for (const make of getMakes({ vehicleTypeId: type })) {
    const models = getModels({ makeId: make.makeId, vehicleTypeId: type });
    if (!models.length) continue;
    const id = normalize(make.makeName);
    if (!id) continue;
    if (!brands.has(id))
      brands.set(id, {
        id,
        name:
          pretty[make.makeName] ||
          make.makeName
            .toLowerCase()
            .replace(/\b\p{L}/gu, (c) => c.toUpperCase()),
        models: new Map(),
      });
    const brand = brands.get(id);
    for (const m of models) {
      const key = normalize(m.modelName);
      if (!key || m.modelName.length > 80) continue;
      if (!brand.models.has(key)) brand.models.set(key, m.modelName.trim());
    }
  }
const result = {
  version: "2.19.1",
  provider: "@meterapp/vehicle-db",
  coverage:
    "Passenger Car and Multipurpose Passenger Vehicle (MPV), snapshot; not guaranteed exhaustive",
  brands: [...brands.values()]
    .map((b) => ({
      ...b,
      models: [...b.models.values()].sort((a, b) => a.localeCompare(b, "bs")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "bs")),
};
const json = JSON.stringify(result);
await writeFile("server/vehicle-catalog.json", json + "\n");
await writeFile("public/vehicle-catalog.json", json + "\n");
const license = await readFile(
  "node_modules/@meterapp/vehicle-db/README.md",
  "utf8",
);
const notices = `USPUT vehicle catalogue\n@meterapp/vehicle-db 2.19.1\nhttps://github.com/MeterApp/vehicle-db\n\n${license}\n\nUnderlying data sources and licenses (provided by catalogue publisher):\n${getDataSources()
  .map(
    (s) =>
      `${s.sourceName}\n${s.sourceUrl}\nLicense: ${s.license}${s.licenseUrl ? " — " + s.licenseUrl : ""}\n`,
  )
  .join("\n")}`;
await writeFile("public/vehicle-catalog-notices.txt", notices);
console.log(
  JSON.stringify({
    brands: result.brands.length,
    models: result.brands.reduce((sum, b) => sum + b.models.length, 0),
    bytes: Buffer.byteLength(json),
    regional: result.brands
      .filter((b) =>
        [
          "volkswagen",
          "skoda",
          "dacia",
          "cupra",
          "zastava",
          "renault",
        ].includes(b.id),
      )
      .map((b) => ({ name: b.name, models: b.models.length })),
  }),
);
