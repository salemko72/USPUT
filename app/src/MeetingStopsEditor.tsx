import { useState } from "react";
import { MapPin, Plus, X, ArrowUp, ArrowDown, Search } from "lucide-react";
import { t } from "./i18n";
import { api } from "./api";
import { PinMap } from "./StreetPicker";
import { routeMidpoint } from "./route-midpoint";
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
    if (change.name !== undefined && change.name !== stops[i].name)
      delete next.automaticName;
    if (
      (["lat", "lng", "name", "city", "approach", "side"] as const).some(
        (key) => next[key] !== stops[i][key],
      )
    )
      delete next.catalogId;
    onChange(stops.map((p, j) => (j === i ? next : p)));
  }
  function move(i: number, by: number) {
    const next = [...stops];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  }
  function along(p: Place) {
    let best = Infinity,
      position = 0,
      travelled = 0;
    const scale = Math.cos((p.lat * Math.PI) / 180);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i],
        dx = (b[0] - a[0]) * scale,
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
    // A catalogue choice fills the initial blank meeting field; Add creates an additional one.
    const blank = p.name.trim()
      ? stops.findIndex(
          (s, i) => i > 0 && i < stops.length - 1 && !s.name.trim(),
        )
      : -1;
    const next = stops.filter((_, i) => i !== blank);
    const index = next.findIndex((s, i) => i > 0 && along(s) > along(p));
    next.splice(index < 0 ? next.length - 1 : index, 0, p);
    onChange(next);
  }
  function openAdd() {
    const coordinate = routeMidpoint(route);
    if (!coordinate) return;
    const point = {
      id: `pin_${coordinate.lat.toFixed(5)}_${coordinate.lng.toFixed(5)}`,
      lat: coordinate.lat,
      lng: coordinate.lng,
      city,
      name: "",
      detail: "Mjesto koje potvrđuje vozač",
    };
    setMapReady(false);
    setEdit({ index: -1, point: { ...point, stopId: `stop_${point.id}` } });
  }
  function row(p: MeetingStop, i: number) {
    const endpoint = i === 0 || i === stops.length - 1;
    return (
      <li
        key={p.stopId + ":" + i}
        className={endpoint ? "meeting-endpoint" : "meeting-stop"}
        data-stop-role={i === 0 ? "start" : endpoint ? "end" : "meeting"}
      >
        <span className="meeting-step">{i + 1}</span>
        {endpoint ? (
          <div className="meeting-endpoint-text">
            <span>{t(i === 0 ? "Polazište vozača" : "Završna tačka")}</span>
            <strong>{p.name}</strong>
          </div>
        ) : (
          <>
            <div className="meeting-stop-fields">
              <label>
                {t("Naziv mjesta susreta (opcionalno)")}
                <input
                  aria-label={t("Naziv mjesta susreta")}
                  value={p.name}
                  maxLength={100}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  placeholder={t("Npr. Kod Alte — ulaz na parking")}
                />
              </label>
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
              <details className="meeting-extra-fields">
                <summary>{t("Prilaz i strana ulice (opcionalno)")}</summary>
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
                      {[
                        "sjeverna",
                        "južna",
                        "istočna",
                        "zapadna",
                        "parking",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {t(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </div>
            <div className="meeting-stop-actions">
              <button
                type="button"
                disabled={i === 1}
                aria-label={t("Pomjeri tačku gore")}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                disabled={i === stops.length - 2}
                aria-label={t("Pomjeri tačku dolje")}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                aria-label={t("Ukloni tačku")}
                onClick={() => onChange(stops.filter((_, j) => j !== i))}
              >
                <X size={15} />
              </button>
            </div>
          </>
        )}
      </li>
    );
  }
  function result(p: MeetingStop) {
    const duplicate = stops.some(
      (s) =>
        s.catalogId === p.catalogId ||
        Math.hypot(s.lat - p.lat, s.lng - p.lng) < 0.00001,
    );
    const hasBlank = stops.slice(1, -1).some((s) => !s.name.trim());
    return (
      <button
        type="button"
        className="meeting-catalog-result"
        key={p.catalogId || p.id}
        disabled={(!hasBlank && stops.length >= 10) || duplicate}
        onClick={() => add(p)}
      >
        <strong>{p.name}</strong>
        <small>
          {[p.approach, p.side].filter(Boolean).join(" · ") || p.city}
        </small>
      </button>
    );
  }
  const duplicatePin =
    edit &&
    stops.some(
      (p, i) =>
        i !== edit.index &&
        Math.hypot(p.lat - edit.point.lat, p.lng - edit.point.lng) < 0.00001,
    );
  return (
    <div className="meeting-editor">
      <h3>{t("Mjesta na tvojoj ruti")}</h3>
      <p>
        {t(
          "Krećeš od polazišta, biraš mjesto susreta i završavaš na odredištu. Dodatne tačke dodaj samo gdje želiš stati.",
        )}
      </p>
      <ol>
        {stops.slice(0, -1).map(row)}
        <li className="meeting-add-slot">
          <button type="button" disabled={stops.length >= 10} onClick={openAdd}>
            <Plus size={17} />
            {t("Dodaj mjesto susreta")}
          </button>
        </li>
        {row(stops[stops.length - 1], stops.length - 1)}
      </ol>
      <small className="meeting-endpoint-hint">
        {t("Polazište i odredište mijenjaš u prethodnom koraku.")}{" "}
        {t(
          "Naziv nije obavezan. Neimenovane tačke dobiju redni broj i ne predlažu se gradskoj bazi.",
        )}
      </small>
      <details className="meeting-catalog-picker">
        <summary>{t("Odaberi postojeće mjesto iz gradske baze")}</summary>
        {suggestions.length > 0 && (
          <div className="meeting-route-suggestions">
            <strong>{t("Mjesta iz baze u blizini trase")}</strong>
            <p>
              {t(
                "Odaberi samo mjesta na kojima zaista možeš stati. Ruta se automatski preračunava.",
              )}
            </p>
            {suggestions.map(result)}
          </div>
        )}
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
        {found.map(result)}
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
          {duplicatePin && (
            <p className="fine-print">
              {t("Ta tačka je već na ruti. Pomjeri pin na drugo mjesto.")}
            </p>
          )}
          <Button
            disabled={!mapReady || !!duplicatePin}
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
