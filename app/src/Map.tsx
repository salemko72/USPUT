import { addBasemap } from "./map-style";
import { t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import type { Place, RouteViaPoint } from "./types";
import { routeMidpoint } from "./route-midpoint";
import { Layers, MapPin, Plus, Minus, Expand } from "lucide-react";
import type { Map as LeafletMap, LayerGroup, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
const emptyStops: Place[] = [];
export type MapInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
export type LiveMapPoint = {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: number;
  label: string;
  own: boolean;
  stale: boolean;
};
const emptyPositions: LiveMapPoint[] = [];
type RouteSnapshot = {
  positions?: LiveMapPoint[];
  from: Place;
  to: Place;
  geometry?: number[][];
  stops: Place[];
  insets?: MapInsets;
  viaPoints?: RouteViaPoint[];
  onViaMove?: (index: number, point: RouteViaPoint) => void;
  onMapAdd?: (point: RouteViaPoint) => void;
  focusPoint?: RouteViaPoint;
  meetingDraft?: RouteViaPoint;
  onMeetingMove?: (point: RouteViaPoint) => void;
};
type LiveRoute = {
  map: LeafletMap;
  L: typeof import("leaflet");
  layers: LayerGroup;
  locationLayers: LayerGroup;
  fittedLocations?: boolean;
  bounds?: LatLngBounds;
  routeKey?: string;
};
function drawRoute(view: LiveRoute, data: RouteSnapshot) {
  const { map, L, layers } = view,
    { from, to, geometry, stops, insets } = data;
  layers.clearLayers();
  for (const p of [from, to])
    L.circleMarker([p.lat, p.lng], {
      radius: 9,
      color: "#151815",
      weight: 4,
      fillColor: "#d7f56a",
      fillOpacity: 1,
    }).addTo(layers);
  stops.forEach((p, i) => {
    const label = document.createElement("span");
    label.textContent = `${i + 1}. ${p.name || t("Mjesto susreta")}`;
    L.circleMarker([p.lat, p.lng], {
      radius: 6,
      weight: 2,
      color: "#151815",
      fillColor: "#d7f56a",
      fillOpacity: 1,
    })
      .addTo(layers)
      .bindTooltip(label);
  });
  const line: [number, number][] = geometry?.length
    ? geometry.map((p) => [p[1], p[0]])
    : [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ];
  L.polyline(line, {
    color: "#151815",
    weight: 4,
    dashArray: geometry ? undefined : "7 10",
  }).addTo(layers);
  if (data.onViaMove && geometry?.length) {
    const midpoint = routeMidpoint(geometry);
    const controls = data.viaPoints?.length
      ? data.viaPoints
      : midpoint
        ? [midpoint]
        : [];
    controls.forEach((p, index) => {
      const label = t("Povuci da promijeniš trasu");
      const icon = document.createElement("span");
      icon.className = "route-via-dot";
      const marker = L.marker([p.lat, p.lng], {
        draggable: true,
        title: label,
        alt: label,
        icon: L.divIcon({
          className: "route-via-handle",
          html: icon,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      })
        .addTo(layers)
        .bindTooltip(label);
      marker.on("dragend", () => {
        const next = marker.getLatLng();
        data.onViaMove?.(index, {
          lat: Math.round(next.lat * 1e5) / 1e5,
          lng: Math.round(next.lng * 1e5) / 1e5,
        });
      });
      const element = marker.getElement();
      if (element) L.DomEvent.disableClickPropagation(element);
    });
  }
  if (data.meetingDraft && data.onMeetingMove) {
    const p = data.meetingDraft;
    const marker = L.marker([p.lat, p.lng], {
      draggable: true,
      title: t("Mjesto susreta"),
      alt: t("Mjesto susreta"),
      icon: L.divIcon({
        className: "route-meeting-handle",
        html: "<span></span>",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    }).addTo(layers);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      data.onMeetingMove?.({
        lat: Math.round(p.lat * 1e5) / 1e5,
        lng: Math.round(p.lng * 1e5) / 1e5,
      });
    });
    const element = marker.getElement();
    if (element) L.DomEvent.disableClickPropagation(element);
  }
  view.bounds = L.latLngBounds([
    ...line,
    ...stops.map((p) => [p.lat, p.lng] as [number, number]),
  ]);
  const routeKey = JSON.stringify([line, insets, data.focusPoint]);
  // A label or stop edit updates the overlay without discarding the user's zoom/pan.
  if (view.routeKey !== routeKey) {
    if (data.focusPoint)
      map.setView([data.focusPoint.lat, data.focusPoint.lng], 17);
    else map.fitBounds(view.bounds, fitOptions(insets));
    view.routeKey = routeKey;
  }
}
function drawLocations(view: LiveRoute, points: LiveMapPoint[], from: Place) {
  const { L, locationLayers } = view;
  locationLayers.clearLayers();
  for (const p of points) {
    L.circle([p.lat, p.lng], {
      radius: p.accuracy,
      color: p.stale ? "#888" : p.own ? "#378ac7" : "#238d55",
      weight: 1,
      fillOpacity: 0.1,
      interactive: false,
    }).addTo(locationLayers);
    const label = document.createElement("span");
    label.textContent = p.label;
    L.marker([p.lat, p.lng], {
      title: p.label,
      alt: p.label,
      icon: L.divIcon({
        className:
          "gps-location-marker" +
          (p.own ? " own" : "") +
          (p.stale ? " stale" : ""),
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    })
      .addTo(locationLayers)
      .bindTooltip(label);
  }
  if (points.length && !view.fittedLocations) {
    view.map.fitBounds(
      L.latLngBounds([
        [from.lat, from.lng],
        ...points.map((p) => [p.lat, p.lng] as [number, number]),
      ]),
      { padding: [40, 40], maxZoom: 17, animate: false },
    );
    view.fittedLocations = true;
  }
}
function fitOptions(insets?: MapInsets) {
  return {
    paddingTopLeft: [insets?.left ?? 35, insets?.top ?? 45] as [number, number],
    paddingBottomRight: [insets?.right ?? 35, insets?.bottom ?? 45] as [
      number,
      number,
    ],
    maxZoom: 14,
  };
}

export function RouteMap({
  from,
  to,
  large = false,
  geometry,
  provider,
  stops = emptyStops,
  insets,
  animated = true,
  viaPoints,
  onViaMove,
  onMapAdd,
  meetingDraft,
  focusPoint,
  onMeetingMove,
  onReady,
  positions = emptyPositions,
}: {
  from: Place;
  to: Place;
  large?: boolean;
  geometry?: number[][];
  provider?: string;
  stops?: Place[];
  insets?: MapInsets;
  animated?: boolean;
  viaPoints?: RouteViaPoint[];
  onViaMove?: (index: number, point: RouteViaPoint) => void;
  onMapAdd?: (point: RouteViaPoint) => void;
  focusPoint?: RouteViaPoint;
  meetingDraft?: RouteViaPoint;
  onMeetingMove?: (point: RouteViaPoint) => void;
  onReady?: (ready: boolean) => void;
  positions?: LiveMapPoint[];
}) {
  const [live, setLive] = useState(Boolean(geometry)),
    [failed, setFailed] = useState(false),
    [mapReady, setMapReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<LiveRoute | null>(null);
  const latest = useRef<RouteSnapshot>({ from, to, geometry, stops, insets });
  latest.current = {
    from,
    to,
    geometry,
    stops,
    insets,
    viaPoints,
    onViaMove,
    onMapAdd,
    meetingDraft,
    focusPoint,
    onMeetingMove,
    positions,
  };
  useEffect(() => {
    onReady?.(live && mapReady && !failed);
  }, [live, mapReady, failed, onReady]);
  useEffect(() => {
    if (geometry || positions.length) setLive(true);
  }, [geometry, positions.length]);
  useEffect(() => {
    if (!live || !container.current) return;
    let cancelled = false,
      cleanup = () => {};
    setMapReady(false);
    setFailed(false);
    import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        const map = L.map(container.current, {
          zoomControl: false,
          scrollWheelZoom: true,
          touchZoom: true,
          minZoom: 2,
          maxZoom: 20,
          // Full-screen resizing can be followed immediately by closing. Leaflet
          // 1.9 does not cancel its CSS zoom-transition timer on map.remove().
          zoomAnimation: animated,
          markerZoomAnimation: animated,
        });
        const layers = L.layerGroup().addTo(map),
          locationLayers = L.layerGroup().addTo(map),
          current: LiveRoute = { map, L, layers, locationLayers };
        const basemap = addBasemap(map, {
          onReady: () => setFailed(false),
          onError: () => setFailed(true),
        });
        view.current = current;
        map.on("click", (event) =>
          latest.current.onMapAdd?.({
            lat: Math.round(event.latlng.lat * 1e5) / 1e5,
            lng: Math.round(event.latlng.lng * 1e5) / 1e5,
          }),
        );
        drawRoute(current, latest.current);
        drawLocations(
          current,
          latest.current.positions || [],
          latest.current.from,
        );
        const observer = new ResizeObserver(() =>
          map.invalidateSize({ pan: false }),
        );
        observer.observe(container.current);
        setMapReady(true);
        cleanup = () => {
          observer.disconnect();
          view.current = null;
          basemap();
          map.remove();
        };
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [live, animated]);
  useEffect(() => {
    if (view.current) drawRoute(view.current, latest.current);
  }, [
    from,
    to,
    geometry,
    stops,
    insets,
    viaPoints,
    Boolean(onViaMove),
    Boolean(onMapAdd),
    meetingDraft,
    focusPoint?.lat,
    focusPoint?.lng,
  ]);
  useEffect(() => {
    if (view.current) drawLocations(view.current, positions, from);
  }, [positions]);
  return (
    <div className={`route-map ${large ? "large" : ""}`}>
      {positions.length > 0 && (
        <button
          type="button"
          className="map-live-fit"
          onClick={() => {
            const v = view.current;
            if (v)
              v.map.fitBounds(
                v.L.latLngBounds([
                  [from.lat, from.lng],
                  ...positions.map((p) => [p.lat, p.lng] as [number, number]),
                ]),
                { padding: [40, 40], maxZoom: 17, animate: false },
              );
          }}
        >
          {t("Prikaži učesnike na mapi")}
        </button>
      )}
      <svg
        className="schematic-map"
        viewBox="0 0 600 380"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="blocks"
            width="100"
            height="80"
            patternTransform="rotate(-23)"
            patternUnits="userSpaceOnUse"
          >
            <rect width="100" height="80" fill="#eeeee8" />
            <rect x="9" y="9" width="31" height="23" rx="3" fill="#e2e4dc" />
            <rect x="49" y="9" width="40" height="23" rx="3" fill="#e2e4dc" />
            <rect x="9" y="41" width="80" height="28" rx="3" fill="#e4e6de" />
            <path d="M0 0H100M0 0V80" stroke="#fff" strokeWidth="8" />
          </pattern>
        </defs>
        <rect width="600" height="380" fill="url(#blocks)" />
        <path
          d="M-30 350 Q130 270 240 300T640 200"
          stroke="#c9dbce"
          strokeWidth="25"
          fill="none"
        />
        <path
          d="M-30 350 Q130 270 240 300T640 200"
          stroke="#c8dad9"
          strokeWidth="13"
          fill="none"
        />
        <path
          d="M20 275L130 210 295 230 370 140 570 100"
          stroke="#fff"
          strokeWidth="28"
          fill="none"
        />
        <path
          d="M85 247L175 213 295 230 365 148 480 120"
          stroke="#151815"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray="1 0"
        />
        <g fill="#b9d4a4">
          <circle cx="235" cy="100" r="20" />
          <circle cx="259" cy="113" r="14" />
          <circle cx="410" cy="285" r="23" />
          <circle cx="438" cy="276" r="15" />
          <circle cx="85" cy="112" r="11" />
        </g>
        <g fill="#d7f56a" stroke="#151815" strokeWidth="6">
          <circle cx="85" cy="247" r="13" />
          <circle cx="480" cy="120" r="13" />
        </g>
        <rect x="24" y="268" width="150" height="36" rx="16" fill="white" />
        <text
          x="99"
          y="291"
          textAnchor="middle"
          fontSize="15"
          fontFamily="sans-serif"
          fill="#151815"
        >
          {from.name}
        </text>
        <rect x="388" y="63" width="174" height="37" rx="16" fill="white" />
        <text
          x="475"
          y="87"
          textAnchor="middle"
          fontSize="15"
          fontFamily="sans-serif"
          fill="#151815"
        >
          {to.name}
        </text>
        <text
          x="300"
          y="345"
          textAnchor="middle"
          fill="#7b8478"
          fontFamily="sans-serif"
          fontSize="12"
          letterSpacing="5"
        >
          {t(" PRIKAZ MJESTA ")}
        </text>
      </svg>
      {live && (
        <>
          <div
            className="leaflet-container-wrap"
            ref={container}
            role="region"
            aria-label={t("Mapa rute")}
          />
          <div className="route-map-controls">
            <button
              type="button"
              aria-label={t("Približi mapu")}
              title={t("Približi mapu")}
              disabled={!mapReady}
              onClick={() => view.current?.map.zoomIn()}
            >
              <Plus size={19} />
            </button>
            <button
              type="button"
              aria-label={t("Udalji mapu")}
              title={t("Udalji mapu")}
              disabled={!mapReady}
              onClick={() => view.current?.map.zoomOut()}
            >
              <Minus size={19} />
            </button>
            <button
              type="button"
              aria-label={t("Prikaži cijelu trasu")}
              title={t("Prikaži cijelu trasu")}
              disabled={!mapReady}
              onClick={() => {
                const current = view.current;
                if (current?.bounds)
                  current.map.fitBounds(
                    current.bounds,
                    fitOptions(latest.current.insets),
                  );
              }}
            >
              <Expand size={17} />
            </button>
          </div>
        </>
      )}
      <button
        className="map-toggle"
        onClick={() => {
          setLive(!live);
          setFailed(false);
        }}
        aria-label={live ? t("Prikaži skicu") : t("Uključi OpenStreetMap")}
      >
        <Layers size={16} />
        {live ? t("Skica") : t("Mapa")}
      </button>
      {geometry && provider === "openrouteservice" && (
        <small className="route-provider-credit">
          <a
            href="https://openrouteservice.org/"
            target="_blank"
            rel="noreferrer"
          >
            © openrouteservice.org by HeiGIT
          </a>
        </small>
      )}
      <span className="map-note">
        <MapPin size={12} />
        {failed
          ? t("Mapa nije dostupna · koristi skicu")
          : live
            ? t(
                geometry
                  ? t("Cestovna trasa · bez gužve uživo")
                  : "OSM · linija nije cestovna ruta",
              )
            : t("Ilustrativna skica · nije navigacija")}
      </span>
    </div>
  );
}
