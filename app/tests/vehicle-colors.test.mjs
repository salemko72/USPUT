import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import { colors, validateVehicle, vehicleLabel } from "../server/vehicles.mjs";
import { handleApi } from "../server/api.mjs";
import { adaptSqlite } from "../server/db.mjs";
import { getPlace } from "../server/places.mjs";

const existingColors = {
  crna: "Crna",
  bijela: "Bijela",
  siva: "Siva",
  srebrna: "Srebrna",
  zlatna: "Zlatna",
  plava: "Plava",
  crvena: "Crvena",
  zelena: "Zelena",
  smedja: "Smeđa",
  bez: "Bež",
  zuta: "Žuta",
  narandzasta: "Narandžasta",
  ljubicasta: "Ljubičasta",
  druga: "Druga",
};
const addedColors = {
  tamnosiva: "Tamnosiva (antracit)",
  tamnoplava: "Tamnoplava",
  bordo: "Bordo",
  bronzana: "Bronzana",
  sampanj: "Šampanj",
  crna_metalik: "Crna metalik",
  bijela_metalik: "Bijela metalik",
  siva_metalik: "Siva metalik",
  tamnosiva_metalik: "Tamnosiva metalik (antracit)",
  srebrna_metalik: "Srebrna metalik",
  zlatna_metalik: "Zlatna metalik",
  plava_metalik: "Plava metalik",
  tamnoplava_metalik: "Tamnoplava metalik",
  crvena_metalik: "Crvena metalik",
  bordo_metalik: "Bordo metalik",
  zelena_metalik: "Zelena metalik",
  smedja_metalik: "Smeđa metalik",
  bez_metalik: "Bež metalik",
  bronzana_metalik: "Bronzana metalik",
  sampanj_metalik: "Šampanj metalik",
};
const vehicleInput = (color) => ({
  makeId: "volkswagen",
  model: "Golf",
  color,
});

test("all previous vehicle colour IDs and stored labels stay unchanged", () => {
  for (const [id, name] of Object.entries(existingColors)) {
    const vehicle = validateVehicle(vehicleInput(id));
    assert.equal(vehicle.color, id);
    assert.equal(vehicleLabel(vehicle), `Volkswagen GOLF · ${name}`);
  }
});

test("vehicle validation accepts extra automobile hues and explicit metallic variants", () => {
  for (const [id, name] of Object.entries(addedColors)) {
    const vehicle = validateVehicle(vehicleInput(id));
    assert.equal(vehicle.color, id);
    assert.equal(vehicleLabel(vehicle), `Volkswagen GOLF · ${name}`);
  }
});

test("vehicle validation rejects unknown colours and metallic finish without a hue", () => {
  for (const color of ["invisible", "metalik", "metallic", "", null, undefined])
    assert.throws(() => validateVehicle(vehicleInput(color)), /boju vozila/);
});

test("vehicle editor and server generate identical stable labels for every colour", async () => {
  const vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  try {
    const { vehicleDescription, displayVehicleLabel } =
      await vite.ssrLoadModule("/src/VehicleManager.tsx");
    for (const [color, name] of Object.entries({
      ...existingColors,
      ...addedColors,
    })) {
      const vehicle = {
        id: "vehicle",
        ...validateVehicle(vehicleInput(color)),
      };
      assert.equal(vehicleDescription(vehicle), vehicleLabel(vehicle));
      assert.equal(
        displayVehicleLabel(vehicleDescription(vehicle)),
        `Volkswagen GOLF · ${name}`,
      );
    }
    assert.equal(new Set(colors.map((color) => color.id)).size, colors.length);
    assert.equal(displayVehicleLabel("VW Golf · sivi"), "VW Golf · sivi");
  } finally {
    await vite.close();
  }
});

test("vehicle colours translate for display without changing the stored ride label", async () => {
  const vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  try {
    const { vehicleDescription, displayVehicleLabel } =
      await vite.ssrLoadModule("/src/VehicleManager.tsx");
    const { setLanguage, t } = await vite.ssrLoadModule("/src/i18n.ts");
    const vehicle = {
      id: "vehicle",
      ...validateVehicle(vehicleInput("bijela_metalik")),
    };
    const storedLabel = "Volkswagen GOLF · Bijela metalik";
    for (const [language, white, bronze, hues, metallic] of [
      [
        "en",
        "Metallic white",
        "Metallic bronze",
        "Colours and shades",
        "Metallic colours",
      ],
      [
        "hr",
        "Bijela metalik",
        "Brončana metalik",
        "Boje i nijanse",
        "Metalik boje",
      ],
      [
        "sr-Latn",
        "Bela metalik",
        "Bronzana metalik",
        "Boje i nijanse",
        "Metalik boje",
      ],
      [
        "bhs",
        "Bijela metalik",
        "Bronzana metalik",
        "Boje i nijanse",
        "Metalik boje",
      ],
    ]) {
      setLanguage(language);
      assert.equal(vehicleDescription(vehicle), storedLabel);
      assert.equal(
        displayVehicleLabel(storedLabel),
        `Volkswagen GOLF · ${white}`,
      );
      assert.equal(t("Bronzana metalik"), bronze);
      assert.equal(t("Boje i nijanse"), hues);
      assert.equal(t("Metalik boje"), metallic);
    }
  } finally {
    await vite.close();
  }
});

test("expanded colours save and reload while old rides retain their original snapshot", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  const env = {
    DB: adaptSqlite(sqlite),
    secureCookies: false,
    OPENROUTESERVICE_API_KEY: "fixture-only",
    ROUTING_FETCH: async (_url, options) => {
      const points = JSON.parse(options.body).coordinates;
      const segments = points
        .slice(1)
        .map(() => ({ duration: 200, distance: 1000 }));
      return Response.json({
        features: [
          {
            geometry: { coordinates: points },
            properties: {
              summary: {
                duration: segments.length * 200,
                distance: segments.length * 1000,
              },
              segments,
              way_points: points.map((_, index) => index),
            },
          },
        ],
      });
    },
  };
  async function call(path, body, cookie = "") {
    const response = await handleApi(
      new Request(`http://localhost:8787/api${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:8787",
          Cookie: cookie,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  try {
    const registration = await call("/auth/register", {
      name: "Colour Driver",
      email: "vehicle-colour@example.test",
      password: "sigurna-lozinka-123",
      city: "Sarajevo",
      adult: true,
      terms: true,
    });
    const cookie = registration.cookie;
    const saved = await call("/vehicle", vehicleInput("siva"), cookie);
    const offer = {
      from: "cengic",
      to: "marijin",
      date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      time: "07:30",
      vehicleId: saved.data.vehicle.id,
      note: "",
      meetingStops: [getPlace("cengic"), getPlace("marijin")],
    };
    const publish = async (time) => {
      const preview = await call("/routes/preview", { ...offer, time }, cookie);
      return call(
        "/rides",
        {
          ...offer,
          time,
          meetingStops: preview.data.meetingStops,
          previewToken: preview.data.previewToken,
          stopsConfirmed: true,
          routeConfirmed: true,
        },
        cookie,
      );
    };
    const oldRide = await publish("07:30");
    assert.equal(oldRide.data.ride.car, "Volkswagen GOLF · Siva");
    const updated = await call(
      "/vehicle",
      vehicleInput("tamnosiva_metalik"),
      cookie,
    );
    assert.equal(updated.data.vehicle.id, saved.data.vehicle.id);
    assert.equal(
      (await call("/vehicle", null, cookie)).data.vehicle.color,
      "tamnosiva_metalik",
    );
    const newRide = await publish("09:30");
    assert.equal(
      newRide.data.ride.car,
      "Volkswagen GOLF · Tamnosiva metalik (antracit)",
    );
    for (const color of Object.keys(addedColors)) {
      await call("/vehicle", vehicleInput(color), cookie);
      assert.equal(
        (await call("/vehicle", null, cookie)).data.vehicle.color,
        color,
      );
    }
    assert.equal(
      (await call(`/rides/${oldRide.data.ride.id}`, null, cookie)).data.ride
        .car,
      "Volkswagen GOLF · Siva",
    );
    assert.equal(
      (await call(`/rides/${newRide.data.ride.id}`, null, cookie)).data.ride
        .car,
      "Volkswagen GOLF · Tamnosiva metalik (antracit)",
    );
  } finally {
    sqlite.close();
  }
});
