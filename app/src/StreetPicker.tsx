import cityCentres from "../shared/city-centres.json";
import type { LocationScope } from "./LocationScope";
import { addBasemap } from "./map-style";
import { useEffect, useId, useRef, useState } from "react";
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
        const map = L.map(container.current, {
            minZoom: 2,
            maxZoom: 20,
          }).setView([point.lat, point.lng], zoom),
          marker = L.marker([point.lat, point.lng], {
            draggable: true,
            icon: L.divIcon({
              className: "street-map-pin",
              html: "<span></span>",
              iconSize: [28, 28],
              iconAnchor: [14, 28],
            }),
          }).addTo(map);
        const basemap = addBasemap(map, {
          onReady: () => {
            setFailed(false);
            onReady?.(true);
          },
          onError: () => setFailed(true),
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
        const observer = new ResizeObserver(() =>
          map.invalidateSize({ pan: false }),
        );
        observer.observe(container.current);
        dispose = () => {
          observer.disconnect();
          basemap();
          map.remove();
        };
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
  scope: defaultScope,
  onChange,
}: {
  label: string;
  scope: LocationScope;
  value?: Place;
  onChange: (place: Place | null) => void;
}) {
  const [scope, setScope] = useState<LocationScope>(() => ({
    city: value?.city || defaultScope.city,
  }));
  const [inferredScope, setInferredScope] = useState<LocationScope | null>(
      null,
    ),
    [cityOpen, setCityOpen] = useState(false),
    [cityDraft, setCityDraft] = useState("");
  const [query, setQuery] = useState(value?.name || ""),
    [results, setResults] = useState<Place[] | null>(null),
    [selected, setSelected] = useState<Place | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attribution, setAttribution] = useState(""),
    [active, setActive] = useState(-1);
  const [manual, setManual] = useState(false),
    [moved, setMoved] = useState(false),
    [ready, setReady] = useState(false);
  const editing = useRef(false),
    requestId = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listId = useId();
  useEffect(() => {
    if (value?.city) {
      setScope({ city: value.city });
      setInferredScope(null);
    }
  }, [value?.id, value?.city]);
  useEffect(() => {
    if (selected || !query.trim() || value?.name === query) return;
    timer.current = setTimeout(() => search(false), 650);
    return () => clearTimeout(timer.current);
  }, [query, scope.city, scope.lat, scope.lng, value?.name, selected !== null]);
  useEffect(
    () => () => {
      requestId.current++;
      clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    requestId.current++;
    setResults(null);
    setError("");
    setNotice("");
    setBusy(false);
    setSelected(null);
  }, [scope.city, scope.lat, scope.lng]);
  useEffect(() => {
    requestId.current++;
    setResults(null);
    setError("");
    setNotice("");
    setBusy(false);
    if (value) setQuery(value.name);
    else if (!editing.current) setQuery("");
    editing.current = false;
  }, [value?.id, value?.name]);
  function selectPin(place: Place, manuallyPlaced = false) {
    clearTimeout(timer.current);
    requestId.current++;
    setResults(null);
    setError("");
    setNotice("");
    setActive(-1);
    setBusy(false);
    setManual(
      manuallyPlaced || place.kind === "city" || place.approximate === true,
    );
    setMoved(false);
    setReady(false);
    setSelected(place);
  }
  async function search(explicit = true) {
    clearTimeout(timer.current);
    if (
      value?.id.startsWith("pin_") &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng) &&
      query.trim() === value.name.trim()
    ) {
      selectPin(value);
      return;
    }
    const city = scope.city.trim();
    const ticket = ++requestId.current;
    setBusy(true);
    setError("");
    setNotice("");
    setActive(-1);
    setResults(null);
    try {
      const payload = { query, scope: { ...scope, city }, explicit };
      let r: {
        locations: Place[];
        fallback?: boolean;
        attribution?: string;
        resolvedScope?: LocationScope;
      };
      try {
        r = await api<typeof r>("/locations/suggest", payload);
      } catch (e) {
        if (!explicit || query.trim().length < 3) throw e;
        r = await api<typeof r>("/locations/search", payload);
      }
      if (explicit && !r.locations.length && query.trim().length >= 3)
        r = await api<typeof r>("/locations/search", payload);
      if (ticket !== requestId.current) return;
      setResults(r.locations);
      setInferredScope(r.resolvedScope || null);
      setAttribution(r.attribution || "© OpenStreetMap contributors");
      if (r.fallback)
        setNotice(
          "Nema tačnog rezultata. Ovo su ulice s istim početnim slovima — odaberi odgovarajuću i provjeri pin.",
        );
      if (!r.locations.length)
        setNotice(
          "Još nema prijedloga. Probaj kraći naziv ili postavi pin na karti.",
        );
    } catch (e) {
      if (ticket === requestId.current) setError((e as Error).message);
    } finally {
      if (ticket === requestId.current) setBusy(false);
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
            autoComplete="street-address"
            autoCapitalize="words"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!results?.length}
            aria-controls={results?.length ? listId : undefined}
            aria-activedescendant={
              active >= 0 ? listId + "-" + active : undefined
            }
            value={query}
            placeholder={t("Ulica, naselje ili grad")}
            onChange={(e) => {
              requestId.current++;
              clearTimeout(timer.current);
              setBusy(false);
              setError("");
              setNotice("");
              setActive(-1);
              setQuery(e.target.value);
              setInferredScope(null);
              editing.current = !!value;
              onChange(null);
              setResults(null);
            }}
            onKeyDown={(e) => {
              if (
                (e.key === "ArrowDown" || e.key === "ArrowUp") &&
                results?.length
              ) {
                e.preventDefault();
                setActive((i) =>
                  i < 0
                    ? e.key === "ArrowDown"
                      ? 0
                      : results.length - 1
                    : (i + (e.key === "ArrowDown" ? 1 : results.length - 1)) %
                      results.length,
                );
                return;
              }
              if (e.key === "Escape") {
                clearTimeout(timer.current);
                requestId.current++;
                setResults(null);
                setBusy(false);
                setActive(-1);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (active >= 0 && results?.[active])
                  selectPin(results[active]);
                else if (query.trim().length >= 1) search();
              }
            }}
          />
          <button
            type="button"
            aria-label={t("Pretraži adresu") + " — " + label}
            disabled={busy || query.trim().length < 1}
            onClick={() => search()}
          >
            <Search size={18} />
          </button>
        </div>
      </label>
      <div className="street-city-hint">
        <span>
          {t("Pretražujemo {city}", {
            city: inferredScope?.city || scope.city || t("odabrani grad"),
          })}
        </span>
        <button
          type="button"
          aria-label={t("Promijeni grad") + " — " + label}
          onClick={() => {
            setCityDraft(inferredScope?.city || scope.city);
            setCityOpen(!cityOpen);
          }}
        >
          {t("Promijeni")}
        </button>
      </div>
      {cityOpen && (
        <div className="street-city-editor">
          <label>
            {t("Grad za ovu lokaciju")}
            <input
              aria-label={t("Grad za ovu lokaciju") + " — " + label}
              value={cityDraft}
              maxLength={80}
              autoComplete="address-level2"
              onChange={(e) => setCityDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
                if (e.key === "Escape") {
                  e.preventDefault();
                  setCityOpen(false);
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={cityDraft.trim().length < 2}
            onClick={() => {
              clearTimeout(timer.current);
              requestId.current++;
              setScope({ city: cityDraft.trim() });
              setInferredScope(null);
              setResults(null);
              setSelected(null);
              setQuery("");
              editing.current = false;
              onChange(null);
              setCityOpen(false);
            }}
          >
            {t("Primijeni grad")}
          </button>
        </div>
      )}
      <button
        type="button"
        className="street-adjust"
        disabled={!(inferredScope?.city || scope.city).trim()}
        onClick={async () => {
          const ticket = ++requestId.current;
          const cityScope = inferredScope || scope;
          const normal = (s: string) =>
            s
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase();
          let center = cityCentres.find(
            (c) => normal(c.name) === normal(cityScope.city),
          );
          let lat = center?.lat ?? cityScope.lat ?? value?.lat,
            lng = center?.lng ?? cityScope.lng ?? value?.lng;
          if (lat === undefined || lng === undefined) {
            try {
              const result = await api<{ locations: Place[] }>(
                "/locations/suggest",
                { query: cityScope.city, scope: cityScope, explicit: true },
              );
              if (ticket !== requestId.current) return;
              const city = result.locations.find((p) => p.kind === "city");
              lat = city?.lat;
              lng = city?.lng;
            } catch (e) {
              if (ticket === requestId.current) setError((e as Error).message);
              return;
            }
          }
          if (lat === undefined || lng === undefined) {
            setError(
              "Grad nije prepoznat. Promijeni grad ili pretraži adresu.",
            );
            return;
          }
          selectPin(
            {
              id: `pin_${lat.toFixed(5)}_${lng.toFixed(5)}`,
              name:
                query.trim().length >= 2
                  ? query.trim()
                  : t("Pin na karti") + ", " + cityScope.city,
              detail: "Približna lokacija ručno označena na karti",
              lat,
              lng,
              city: cityScope.city,
            },
            true,
          );
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
          onClick={() => selectPin(value)}
        >
          <Move size={13} />
          {t("Provjeri ili pomjeri pin")}
        </button>
      )}
      {busy && <p className="fine-print">{t("Tražimo adresu…")}</p>}
      {notice && (
        <p className="fine-print" role="status">
          {t(notice)}
        </p>
      )}
      <ErrorBox error={error} />
      {results && (
        <div
          className="street-results"
          role="listbox"
          id={listId}
          aria-label={t("Pronađene adrese")}
        >
          {results.map((p, i) => (
            <button
              type="button"
              role="option"
              id={listId + "-" + i}
              aria-selected={active === i}
              key={p.id + ":" + i}
              onClick={() => selectPin(p)}
            >
              <strong>{p.name}</strong>
              <small>{p.kind === "city" ? t("Grad — odaberi približnu lokaciju na karti.") : p.detail}</small>
            </button>
          ))}
          {!!results.length && <small>{attribution}</small>}
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
              setSelected(
                p.kind === "city"
                  ? {
                      ...p,
                      kind: undefined,
                      name: t("Pin na karti") + ", " + p.city,
                    }
                  : { ...p, approximate: undefined },
              );
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
              requestId.current++;
              setResults(null);
              setError("");
              setBusy(false);
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
