import type { Map as LeafletMap, MaplibreGL } from "leaflet";

// Key-free OpenFreeMap vector data; Leaflet keeps pin/route interactions.
export function addBasemap(
  map: LeafletMap,
  { onReady, onError }: { onReady?: () => void; onError?: () => void } = {},
) {
  let disposed = false,
    layer: MaplibreGL | undefined;
  const attribution =
    '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="/maps/LICENSE.txt" target="_blank" rel="noreferrer">Positron</a>';
  let timeout: ReturnType<typeof setTimeout> | undefined;
  Promise.all([
    import("@maplibre/maplibre-gl-leaflet"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ])
    .then(([{ maplibreGL }]) => {
      if (disposed) return;
      try {
        layer = maplibreGL({
          style: "/maps/usput-positron.json",
          interactive: false,
          attributionControl: { customAttribution: attribution },
          maxZoom: 20,
          canvasContextAttributes: { antialias: false },
          renderWorldCopies: false,
        }).addTo(map);
        map.attributionControl?.addAttribution(attribution);
        const gl = layer.getMaplibreMap();
        let ready = false,
          content = false;
        const finish = () => {
          if (disposed || ready || !content || !gl.loaded()) return;
          ready = true;
          clearTimeout(timeout);
          onReady?.();
        };
        gl.on("load", finish);
        gl.on("sourcedata", (event) => {
          if (
            event.sourceId === "openmaptiles" &&
            event.sourceDataType === "content"
          )
            content = true;
          finish();
        });
        gl.on("idle", finish);
        gl.on("error", () => {
          if (!disposed && !ready) onError?.();
        });
        timeout = setTimeout(() => {
          if (!disposed && !ready) onError?.();
        }, 15000);
      } catch {
        if (!disposed) onError?.();
      }
    })
    .catch(() => {
      if (!disposed) onError?.();
    });
  return () => {
    disposed = true;
    clearTimeout(timeout);
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    map.attributionControl?.removeAttribution(attribution);
  };
}
