import { useState } from "react";
import { MapPin, Plus, X, ArrowUp, ArrowDown, Search } from "lucide-react";
import { t } from "./i18n";
import { api } from "./api";
import { PinMap } from "./StreetPicker";
import { Button, ErrorBox, Modal } from "./ui";
import type { MeetingStop, Place } from "./types";
import "./meeting-stops.css";
export function MeetingStopsEditor({
  stops,
  onChange,
  city,
  route,
  suggestions = [],
}: {
  stops: MeetingStop[];
  onChange: (s: MeetingStop[]) => void;
  city: string;
  route: number[][];
  suggestions?: MeetingStop[];
}) {
  const [edit, setEdit] = useState<{
      point: MeetingStop;
      index: number;
    } | null>(null),
    [searchCity, setSearchCity] = useState(city),
    [search, setSearch] = useState(""),
    [found, setFound] = useState<MeetingStop[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mapReady, setMapReady] = useState(false);
  function patch(i: number, change: Partial<MeetingStop>) {
    const next = { ...stops[i], ...change };
    delete next.catalogId;
    onChange(stops.map((p, j) => (j === i ? next : p)));
  }
  function move(i: number, by: number) {
    const next = [...stops];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  }
  function select(point: Place, index: number) {
    setMapReady(false);
    setEdit({ index, point: { ...point, stopId: `stop_${point.id}` } });
  }
  function along(p: Place) {
    let best = Infinity,
      position = 0,
      travelled = 0;
    const scale = Math.cos((p.lat * Math.PI) / 180);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i];
      const dx = (b[0] - a[0]) * scale,
        dy = b[1] - a[1];
      const x = (p.lng - a[0]) * scale,
        y = p.lat - a[1];
      const f = Math.max(
        0,
        Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)),
      );
      const distance = Math.hypot(x - f * dx, y - f * dy),
        length = Math.hypot(dx, dy);
      if (distance < best) {
        best = distance;
        position = travelled + f * length;
      }
      travelled += length;
    }
    return position;
  }
  function add(point: MeetingStop) {
    const p = {
      ...point,
      stopId: `stop_pin_${point.lat.toFixed(5)}_${point.lng.toFixed(5)}`,
    };
    const index = stops.findIndex((s) => along(s) > along(p));
    const next = [...stops];
    next.splice(index < 0 ? next.length : index, 0, p);
    onChange(next);
  }
  return (
    <div className="meeting-editor">
      <h3>{t("Gdje primaš i ostavljaš putnike?")}</h3>
      <p>
        {t(
          "Predloženi pin nije provjereno mjesto za stajanje. Imenuj tačke, pomjeri ih gdje treba i potvrdi konačnu trasu.",
        )}
      </p>
      {suggestions.length > 0 && (
        <div className="meeting-route-suggestions">
          <strong>{t("Mjesta iz baze u blizini trase")}</strong>
          <p>
            {t(
              "Odaberi samo mjesta na kojima zaista možeš stati. Zatim ponovo proračunaj trasu.",
            )}
          </p>
          {suggestions.map((p) => (
            <button
              type="button"
              className="meeting-catalog-result"
              key={p.catalogId || p.id}
              disabled={
                stops.length >= 10 ||
                stops.some(
                  (s) =>
                    s.catalogId === p.catalogId ||
                    Math.hypot(s.lat - p.lat, s.lng - p.lng) < 0.00001,
                )
              }
              onClick={() => add(p)}
            >
              <strong>{p.name}</strong>
              <small>
                {[p.approach, p.side].filter(Boolean).join(" · ") || p.city}
              </small>
            </button>
          ))}
        </div>
      )}
      <ol>
        {stops.map((p, i) => (
          <li key={p.stopId + ":" + i}>
            <span className="meeting-step">{i + 1}</span>
            <div className="meeting-stop-fields">
              <label>
                {t("Naziv mjesta susreta")}
                <input
                  value={p.name}
                  maxLength={100}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  placeholder={t("Npr. Kod Alte — ulaz na parking")}
                />
              </label>
              <div className="meeting-stop-meta">
                <label>
                  {t("Prilaz / kratka uputa")}
                  <input
                    value={p.approach || ""}
                    maxLength={120}
                    onChange={(e) => patch(i, { approach: e.target.value })}
                    placeholder={t("Npr. ulaz sa bočne ulice")}
                  />
                </label>
                <label>
                  {t("Strana / prostor")}
                  <select
                    value={p.side || ""}
                    onChange={(e) => patch(i, { side: e.target.value })}
                  >
                    <option value="">{t("Nije navedeno")}</option>
                    {["sjeverna", "južna", "istočna", "zapadna", "parking"].map(
                      (s) => (
                        <option key={s} value={s}>
                          {t(s)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMapReady(false);
                  setEdit({ point: p, index: i });
                }}
              >
                <MapPin size={14} />
                {t("Provjeri ili pomjeri pin")}
              </button>
            </div>
            <div className="meeting-stop-actions">
              <button
                type="button"
                disabled={i === 0}
                aria-label={t("Pomjeri tačku gore")}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                disabled={i === stops.length - 1}
                aria-label={t("Pomjeri tačku dolje")}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                disabled={stops.length <= 2}
                aria-label={t("Ukloni tačku")}
                onClick={() => onChange(stops.filter((_, j) => j !== i))}
              >
                <X size={15} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="text-button"
        disabled={stops.length >= 10}
        onClick={() => {
          const coordinate = route[Math.floor(route.length / 2)];
          if (!coordinate) return;
          const p = {
            id: `pin_${coordinate[1].toFixed(5)}_${coordinate[0].toFixed(5)}`,
            lat: coordinate[1],
            lng: coordinate[0],
            city,
            name: "Nova tačka",
            detail: "Mjesto koje potvrđuje vozač",
          };
          select(p, -1);
        }}
      >
        <Plus size={16} />
        {t("Dodaj mjesto susreta")}
      </button>
      <details className="meeting-catalog-picker">
        <summary>{t("Odaberi postojeće mjesto iz gradske baze")}</summary>
        <div className="meeting-stop-meta">
          <label>
            {t("Grad")}
            <input
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
              maxLength={80}
            />
          </label>
          <label>
            {t("Naziv / orijentir")}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
            />
          </label>
        </div>
        <button
          type="button"
          className="text-button"
          disabled={busy || searchCity.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await api<{
                points: (Place & {
                  catalogId?: string;
                  approach?: string;
                  side?: string;
                })[];
              }>(
                "/meeting-points?" +
                  new URLSearchParams({ city: searchCity, query: search }),
              );
              setFound(
                r.points.map((p) => ({
                  ...p,
                  stopId: `stop_${p.id}`,
                  catalogId: p.catalogId || p.id,
                })),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Search size={14} />
          {t("Pretraži mjesta susreta")}
        </button>
        {found.map((p) => (
          <button
            type="button"
            className="meeting-catalog-result"
            key={p.id}
            disabled={
              stops.length >= 10 ||
              stops.some((s) => s.catalogId === p.catalogId)
            }
            onClick={() => add(p)}
          >
            <strong>{p.name}</strong>
            <small>{p.approach || p.detail}</small>
          </button>
        ))}
        <ErrorBox error={error} />
      </details>
      {edit && (
        <Modal
          title={t("Mjesto gdje možeš stati")}
          onClose={() => setEdit(null)}
        >
          <p>
            {t(
              "Pin označava tačno mjesto susreta. Provjeri prilaz i stranu ulice.",
            )}
          </p>
          <PinMap
            point={edit.point}
            onReady={setMapReady}
            onChange={(p) =>
              setEdit({
                ...edit,
                point: {
                  ...edit.point,
                  ...p,
                  stopId: `stop_${p.id}`,
                  catalogId: undefined,
                },
              })
            }
          />
          <Button
            disabled={!mapReady}
            onClick={() => {
              if (edit.index < 0) add(edit.point);
              else patch(edit.index, edit.point);
              setEdit(null);
            }}
          >
            {t("Koristi ovaj pin")}
          </Button>
        </Modal>
      )}
    </div>
  );
}
