import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
const style = JSON.parse(
  readFileSync(new URL("../public/maps/usput-positron.json", import.meta.url)),
);
test("custom Positron is a valid key-free vector style with the requested physical-feature colours", () => {
  assert.deepEqual(
    validateStyleMin(style).map((e) => e.message),
    [],
  );
  assert.equal(style.sources.openmaptiles.type, "vector");
  assert.match(
    style.sources.openmaptiles.url,
    /^https:\/\/tiles\.openfreemap\.org\//,
  );
  const colour = (id, property) =>
    style.layers.find((l) => l.id === id).paint[property];
  assert.equal(colour("background", "background-color"), "#E0E0E0");
  assert.equal(colour("park", "fill-color"), "#ABBEA7");
  assert.equal(colour("water", "fill-color"), "#79858B");
  assert.equal(colour("waterway", "line-color"), "#8799A1");
  assert.equal(colour("building", "fill-color"), "#D1D1D1");
  assert.equal(colour("building", "fill-outline-color"), "#A5A8A3");
  assert.equal(colour("highway_minor", "line-color"), "#DCDBDB");
  assert.equal(colour("landcover_grass", "fill-color"), "#C9D5C8");
});
test("map labels prefer Latin without duplicate scripts and omit distracting POIs and shields", () => {
  const labels = style.layers.filter((l) => l.type === "symbol");
  assert.ok(labels.length > 0);
  for (const layer of labels) {
    assert.deepEqual(layer.layout["text-field"].slice(0, 2), [
      "coalesce",
      ["get", "name:latin"],
    ]);
    assert.ok(!JSON.stringify(layer.layout).includes("name:nonlatin"));
    assert.ok(!layer.id.includes("shield"));
  }
  assert.ok(!style.layers.some((l) => l["source-layer"] === "poi"));
});
