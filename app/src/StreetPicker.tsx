import { MAP_TILE_URL, MAP_TILE_OPTIONS } from "./map-style";
import { useEffect, useRef, useState } from "react";
import { MapPin, Search, Move } from "lucide-react";
import type { Place } from "./types";
import { api } from "./api";
import { t } from "./i18n";
import { Modal, Button, ErrorBox } from "./ui";
import "leaflet/dist/leaflet.css";
export function PinMap({
  point,
  onChange,
  zoom = 17,
  onReady,
}: {
  point: Place;
  onChange: (point: Place) => void;
  zoom?: number;
  onReady?: (ready: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    latest = useRef(point);
  latest.current = point;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false,
      dispose = () => {};
    import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        const map = L.map(container.current).setView(
            [point.lat, point.lng],
            zoom,
          ),
          marker = L.marker([point.lat, point.lng], {
            draggable: true,
            icon: L.divIcon({
              className: "street-map-pin",
              html: "<span></span>",
              iconSize: [28, 28],
              iconAnchor: [14, 28],
            }),
          }).addTo(map);
        const tiles = L.tileLayer(MAP_TILE_URL, MAP_TILE_OPTIONS).addTo(map);
        tiles.on("tileload", () => onReady?.(true));
        tiles.on("tileerror", () => {
          setFailed(true);
        });
        const update = (lat: number, lng: number) => {
          const p = {
            ...latest.current,
            lat: Math.round(lat * 1e5) / 1e5,
            lng: Math.round(lng * 1e5) / 1e5,
          };
          p.id = `pin_${p.lat.toFixed(5)}_${p.lng.toFixed(5)}`;
          marker.setLatLng([p.lat, p.lng]);
          onChange(p);
        };
        map.on("click", (e) => update(e.latlng.lat, e.latlng.lng));
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          update(p.lat, p.lng);
        });
        dispose = () => map.remove();
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);
  return (
    <>
      <div
        className="street-pin-map"
        ref={container}
        role="region"
        aria-label={t("Pomjeri pin na približno mjesto polaska ili dolaska")}
      />
      <p className="fine-print">
        {failed
          ? t("Mapa se nije učitala. Provjeri adresu prije potvrde.")
          : t(
              "Klikni na kartu ili povuci pin. Potvrđuješ približnu lokaciju, ne kućnu adresu.",
            )}
      </p>
      <small>
        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
      </small>
    </>
  );
}
export function StreetPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: Place;
  onChange: (place: Place | null) => void;
}) {
  const [query, setQuery] = useState(value?.name || ""),
    [results, setResults] = useState<Place[] | null>(null),
    [selected, setSelected] = useState<Place | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [manual, setManual] = useState(false),
    [moved, setMoved] = useState(false),
    [ready, setReady] = useState(false);
  const editing = useRef(false);
  useEffect(() => {
    if (value) setQuery(value.name);
    else if (!editing.current) setQuery("");
    editing.current = false;
  }, [value?.id, value?.name]);
  async function search() {
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const r = await api<{ locations: Place[] }>("/locations/search", {
        query,
      });
      setResults(r.locations);
      if (!r.locations.length)
        setError("Nismo pronašli ulicu. Dodaj približan broj i grad.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="street-picker">
      <label className="street-label">
        {label}
        <div className="street-search-row">
          <MapPin size={18} />
          <input
            aria-label={label}
            value={query}
            placeholder={t("Ulica, približan broj, grad")}
            onChange={(e) => {
              setQuery(e.target.value);
              editing.current = !!value;
              onChange(null);
              setResults(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (query.trim().length >= 5) search();
              }
            }}
          />
          <button
            type="button"
            aria-label={t("Pretraži adresu") + " — " + label}
            disabled={busy || query.trim().length < 5}
            onClick={search}
          >
            <Search size={18} />
          </button>
        </div>
      </label>
      <button
        type="button"
        className="street-adjust"
        disabled={query.trim().length < 5}
        onClick={() => {
          const centers: Record<string, [number, number]> = {
            beograd: [44.8125, 20.4612],
            zagreb: [45.813, 15.977],
            sarajevo: [43.8598, 18.4256],
            "novi sad": [45.2671, 19.8335],
            "banja luka": [44.7722, 17.191],
            mostar: [43.3438, 17.8078],
            tuzla: [44.538, 18.676],
            split: [43.5081, 16.4402],
            ljubljana: [46.0569, 14.5058],
            podgorica: [42.4304, 19.2594],
          };
          const found = Object.entries(centers).find(([city]) =>
              query.toLowerCase().includes(city),
            ),
            center = found?.[1] || [
              value?.lat || 43.8598,
              value?.lng || 18.4256,
            ];
          const p: Place = {
            id: `pin_${center[0].toFixed(5)}_${center[1].toFixed(5)}`,
            name: query.trim(),
            detail: "Približna lokacija ručno označena na karti",
            lat: center[0],
            lng: center[1],
            city: found?.[0] || value?.city || "",
          };
          setManual(true);
          setMoved(false);
          setReady(false);
          setSelected(p);
        }}
      >
        {t("Postavi pin ručno na karti")}
      </button>
      {value && !value.id.startsWith("pin_") && (
        <small className="street-legacy-note">
          {t(
            "Staro beta područje. Za precizniji rezultat odaberi ulicu i pin.",
          )}
        </small>
      )}
      {value?.id.startsWith("pin_") && (
        <button
          type="button"
          className="street-adjust"
          onClick={() => {
            setManual(false);
            setSelected(value);
          }}
        >
          <Move size={13} />
          {t("Provjeri ili pomjeri pin")}
        </button>
      )}
      {busy && <p className="fine-print">{t("Tražimo adresu…")}</p>}
      <ErrorBox error={error} />
      {results && (
        <div
          className="street-results"
          role="list"
          aria-label={t("Pronađene adrese")}
        >
          {results.map((p, i) => (
            <button
              type="button"
              role="listitem"
              key={p.id + ":" + i}
              onClick={() => {
                setSelected(p);
                setResults(null);
              }}
            >
              <strong>{p.name}</strong>
              <small>{p.detail}</small>
            </button>
          ))}
          <small>© OpenStreetMap contributors · Nominatim</small>
        </div>
      )}
      {selected && (
        <Modal
          title={t("Potvrdi približnu lokaciju")}
          onClose={() => setSelected(null)}
        >
          <h3>{selected.name}</h3>
          <PinMap
            point={selected}
            zoom={manual ? 13 : 17}
            onReady={setReady}
            onChange={(p) => {
              setSelected(p);
              setMoved(true);
            }}
          />
          {manual && (
            <p className="fine-print">
              {t("Približi kartu na svoju ulicu i pomjeri pin prije potvrde.")}
            </p>
          )}
          <p className="fine-print">
            {t(
              "Mjesto ulaska i izlaska dogovarate posebno. Pin nije potvrda da se tu smije stati.",
            )}
          </p>
          <Button
            disabled={manual && (!moved || !ready)}
            onClick={() => {
              onChange(selected);
              setQuery(selected.name);
              setSelected(null);
            }}
          >
            {t("Potvrdi ovaj pin")}
          </Button>
        </Modal>
      )}
    </div>
  );
}
