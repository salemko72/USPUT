import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
const style = JSON.parse(
  readFileSync(new URL("../public/maps/usput-positron.json", import.meta.url)),
);
test("standard Positron uses its original light palette on a valid key-free vector style", () => {
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
  assert.equal(colour("background", "background-color"), "rgb(242,243,240)");
  assert.equal(colour("park", "fill-color"), "rgb(230, 233, 229)");
  assert.equal(colour("water", "fill-color"), "rgb(194, 200, 202)");
  assert.equal(colour("waterway", "line-color"), "hsl(195,17%,78%)");
  assert.equal(colour("building", "fill-color"), "rgb(234, 234, 229)");
  assert.equal(colour("building", "fill-outline-color"), "rgb(219, 219, 218)");
  assert.equal(colour("highway_minor", "line-color"), "hsl(0,0%,88%)");
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
