import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  GitMerge,
  MapPin,
  Pencil,
  Plus,
  Search,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { api, HttpError } from "./api";
import { useLanguage, t, locale } from "./i18n";
import type { Place } from "./types";
import { PinMap, StreetPicker } from "./StreetPicker";
import { Button, ErrorBox, Modal } from "./ui";
import translations from "./meeting-catalog-translations.json";
import "./meeting-catalog.css";

type Availability = "candidate" | "active" | "inactive";
export type CatalogPoint = {
  id: string;
  catalogId: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  detail: string;
  approach?: string;
  side?: string;
  aliases: string[];
  availability: Availability;
  version: number;
  redirectId?: string | null;
  source: "editor" | "contribution";
  feedback: {
    participants: number;
    completedBookings: number;
    positive: number;
    negative: number;
    lastAt: number | null;
    recentParticipants: number;
  };
};
type CatalogMerge = {
  id: string;
  sourceId: string;
  targetId: string;
  createdAt: number;
  undoneAt: number | null;
};
type Duplicate = {
  sourceId: string;
  targetId: string;
  distanceMeters: number;
  conflicts: { side: boolean; approach: boolean };
};
type Catalog = {
  points: CatalogPoint[];
  merges: CatalogMerge[];
  duplicateSuggestions: Duplicate[];
};
type Translate = (
  source: string,
  values?: Record<string, string | number>,
) => string;
function useCatalogText(): Translate {
  const language = useLanguage();
  return (source, values = {}) => {
    let result =
      language === "en"
        ? (translations as Record<string, string>)[source] || source
        : t(source);
    for (const [key, value] of Object.entries(values))
      result = result.replaceAll("{" + key + "}", String(value));
    return result;
  };
}
const statusLabel = (status: Availability) =>
  ({
    candidate: "Kandidat za pregled",
    active: "Aktivno",
    inactive: "Nedostupno",
  })[status];
const folded = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
function meters(a: CatalogPoint, b: CatalogPoint) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(a.lat - b.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(a.lng - b.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const conflicts = (a: CatalogPoint, b: CatalogPoint) =>
  (!!a.side && !!b.side && folded(a.side) !== folded(b.side)) ||
  (!!a.approach && !!b.approach && folded(a.approach) !== folded(b.approach));

function PointEditor({
  current,
  initialCity,
  onClose,
  onSaved,
}: {
  current?: CatalogPoint;
  initialCity: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useCatalogText();
  const [name, setName] = useState(current?.name || "");
  const [city, setCity] = useState(current?.city || initialCity);
  const [detail, setDetail] = useState(current?.detail || "");
  const [approach, setApproach] = useState(current?.approach || "");
  const [side, setSide] = useState(current?.side || "");
  const [aliases, setAliases] = useState(
    current?.aliases.filter((a) => a !== current.name).join("\n") || "",
  );
  const [availability, setAvailability] = useState<Availability>(
    current?.availability || "candidate",
  );
  const [pin, setPin] = useState<Place | null>(
    current ? { ...current, detail: current.detail || "" } : null,
  );
  const [searchPin, setSearchPin] = useState(!current);
  const [mapKey, setMapKey] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!pin || name.trim().length < 2 || city.trim().length < 2) {
      setError("Unesi naziv, grad i ispravan pin mjesta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/admin/meeting-points" + (current ? "/" + current.id : ""), {
        name,
        city,
        detail,
        approach,
        side,
        lat: pin.lat,
        lng: pin.lng,
        aliases: aliases
          .split("\n")
          .map((a) => a.trim())
          .filter(Boolean),
        availability,
        ...(current ? { version: current.version } : {}),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={tr(current ? "Uredi mjesto" : "Novi kandidat")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="meeting-editor" onSubmit={save}>
        <fieldset disabled={busy} className="meeting-fields">
          <label>
            {tr("Naziv mjesta")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={160}
            />
          </label>
          <label>
            {tr("Grad")}
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            {tr("Kratka uputa za prepoznavanje")}
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              maxLength={600}
              placeholder={tr("npr. ulaz sa glavne ulice")}
            />
          </label>
          <div className="meeting-two-fields">
            <label>
              {tr("Prilaz")}
              <input
                value={approach}
                onChange={(e) => setApproach(e.target.value)}
                maxLength={160}
                placeholder={tr("npr. iz smjera centra")}
              />
            </label>
            <label>
              {tr("Strana ceste / ulaz")}
              <input
                value={side}
                onChange={(e) => setSide(e.target.value)}
                maxLength={100}
                placeholder={tr("npr. sjeverna strana / istočni ulaz")}
              />
            </label>
          </div>
          <label>
            {tr("Drugi nazivi, svaki u novom redu")}
            <textarea
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              rows={3}
            />
          </label>
          <label>
            {tr("Status")}
            <select
              value={availability}
              onChange={(e) => setAvailability(e.target.value as Availability)}
            >
              {(["candidate", "active", "inactive"] as Availability[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {tr(statusLabel(s))}
                  </option>
                ),
              )}
            </select>
          </label>
          <p className="meeting-note">
            {tr(
              "Aktivna mjesta su vidljiva u javnoj pretrazi. Ovo nije potvrda sigurnog ili dozvoljenog zaustavljanja.",
            )}
          </p>
          {pin && (
            <div className="meeting-pin">
              <PinMap
                key={mapKey}
                point={{ ...pin, name, city, detail }}
                onChange={setPin}
              />
            </div>
          )}
          {pin && (
            <button
              className="meeting-text-button"
              type="button"
              onClick={() => setSearchPin((s) => !s)}
            >
              {tr("Pronađi drugi pin")}
            </button>
          )}
          {searchPin &&
            (city.trim().length < 2 ? (
              <p>{tr("Prvo unesi grad, pa odaberi i provjeri pin.")}</p>
            ) : (
              <StreetPicker
                label={tr("Pronađi približnu lokaciju")}
                scope={{ city }}
                onChange={(p) => {
                  if (!p) return;
                  setPin(p);
                  if (!name.trim()) setName(p.name);
                  setSearchPin(false);
                  setMapKey((k) => k + 1);
                }}
              />
            ))}
        </fieldset>
        <ErrorBox error={tr(error)} />
        <div className="meeting-actions">
          <Button type="submit" variant="lime" busy={busy} disabled={!pin}>
            {tr("Sačuvaj mjesto")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {tr("Odustani")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MergeEditor({
  source,
  points,
  initialTargetId,
  onClose,
  onSaved,
}: {
  source: CatalogPoint;
  points: CatalogPoint[];
  initialTargetId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useCatalogText();
  const targets = points.filter(
    (p) =>
      !p.redirectId &&
      p.id !== source.id &&
      folded(p.city) === folded(source.city) &&
      meters(source, p) <= 40,
  );
  const [targetId, setTargetId] = useState(initialTargetId || "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const target = targets.find((p) => p.id === targetId);
  async function merge() {
    if (!confirmed || !target) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/meeting-points/${source.id}/merge`, {
        targetId: target.id,
        version: source.version,
        targetVersion: target.version,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const metadata = (point: CatalogPoint) => (
    <p className="meeting-note">
      {tr("Prilaz")}: {point.approach || tr("Nije navedeno")}
      <br />
      {tr("Strana ceste / ulaz")}: {point.side || tr("Nije navedeno")}
      <br />
      {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
    </p>
  );
  return (
    <Modal
      title={tr("Spoji mjesta")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="meeting-editor">
        <p className="meeting-note">{tr("Izvorno mjesto")}</p>
        <strong>{source.name}</strong>
        {metadata(source)}
        {targets.length ? (
          <label>
            {tr("Glavno mjesto koje zadržava pin")}
            <select
              disabled={busy}
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">{tr("Odaberi glavno mjesto")}</option>
              {targets.map((p) => (
                <option key={p.id} value={p.id} disabled={conflicts(source, p)}>
                  {p.name} · {Math.round(meters(source, p))} m
                  {conflicts(source, p)
                    ? " · " + tr("Različita strana ili prilaz")
                    : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>{tr("Nema drugih mjesta unutar 40 m u ovom gradu.")}</p>
        )}
        {target && (
          <>
            {metadata(target)}
            <p className="meeting-note">
              {tr(
                "Sličan naziv i blizina nisu dovoljni: provjeri prilaz i stranu ceste prije spajanja.",
              )}
            </p>
          </>
        )}
        <p>
          {tr(
            "Izvorni pin i nazivi ostaju u historiji. Postojeći dogovori se ne mijenjaju; spajanje možeš poništiti.",
          )}
        </p>
        <label className="meeting-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={!target || busy || conflicts(source, target)}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {tr("Provjerio/la sam oba pina, prilaz i stranu ceste.")}
        </label>
        <ErrorBox error={tr(error)} />
        <div className="meeting-actions">
          <Button
            busy={busy}
            disabled={!confirmed || !target || conflicts(source, target)}
            onClick={merge}
          >
            {tr("Potvrdi spajanje")}
          </Button>
          <Button disabled={busy} variant="outline" onClick={onClose}>
            {tr("Odustani")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CandidateImport({ onSaved }: { onSaved: (message: string) => void }) {
  const tr = useCatalogText();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function importPoints(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let points: unknown;
    try {
      points = JSON.parse(raw);
    } catch {
      /* Validated below, before writing. */
    }
    if (
      !Array.isArray(points) ||
      !points.length ||
      points.length > 30 ||
      points.some(
        (p) =>
          !p ||
          typeof p !== "object" ||
          typeof p.name !== "string" ||
          p.name.trim().length < 2 ||
          typeof p.city !== "string" ||
          p.city.trim().length < 2 ||
          typeof p.lat !== "number" ||
          !Number.isFinite(p.lat) ||
          Math.abs(p.lat) > 90 ||
          typeof p.lng !== "number" ||
          !Number.isFinite(p.lng) ||
          Math.abs(p.lng) > 180 ||
          (p.aliases !== undefined &&
            (!Array.isArray(p.aliases) ||
              p.aliases.length > 30 ||
              p.aliases.some((a: unknown) => typeof a !== "string"))),
      )
    ) {
      setError(
        "JSON treba sadržavati niz od 1 do 30 ispravno navedenih mjesta.",
      );
      return;
    }
    setBusy(true);
    let count = 0;
    try {
      for (const point of points) {
        await api("/admin/meeting-points", {
          ...point,
          availability: "candidate",
        });
        count++;
      }
      setRaw("");
    } catch (e) {
      setError((e as Error).message);
      if (count) setRaw(JSON.stringify(points.slice(count), null, 2));
    } finally {
      setBusy(false);
      if (count) onSaved(tr("Uvezeno kandidata: {count}.", { count }));
    }
  }
  return (
    <details className="meeting-import">
      <summary>{tr("Uvezi kandidate iz JSON-a")}</summary>
      <form onSubmit={importPoints}>
        <p>
          {tr(
            "Zalijepi JSON niz mjesta s nazivom, gradom i koordinatama. Svi unosi ostaju kandidati za pregled.",
          )}
        </p>
        <label>
          {tr("JSON kandidata")}
          <textarea
            value={raw}
            disabled={busy}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={
              '[{"name":"…","city":"…","lat":0,"lng":0,"approach":"…","side":"…"}]'
            }
          />
        </label>
        <ErrorBox error={tr(error)} />
        <Button
          type="submit"
          busy={busy}
          disabled={!raw.trim()}
          variant="outline"
        >
          {tr("Uvezi kandidate")}
        </Button>
      </form>
    </details>
  );
}

export function MeetingAdmin({
  initialCity = "",
  onBack,
}: {
  initialCity?: string;
  onBack?: () => void;
}) {
  const tr = useCatalogText(),
    language = useLanguage();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">(
    "checking",
  );
  const [data, setData] = useState<Catalog>({
    points: [],
    merges: [],
    duplicateSuggestions: [],
  });
  const [city, setCity] = useState(initialCity),
    [query, setQuery] = useState("");
  const [filter, setFilter] = useState({ city: initialCity, query: "" });
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [editing, setEditing] = useState<CatalogPoint | "new" | null>(null);
  const [merging, setMerging] = useState<{
    source: CatalogPoint;
    targetId?: string;
  } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [retry, setRetry] = useState(0);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<Catalog>(
        "/admin/meeting-points?" + new URLSearchParams(filter),
      );
      if (ticket === requestId.current) setData(result);
    } catch (e) {
      if (ticket === requestId.current) {
        setError((e as Error).message);
        setData({ points: [], merges: [], duplicateSuggestions: [] });
        if (e instanceof HttpError && [401, 403].includes(e.status))
          setAccess("denied");
      }
    } finally {
      if (ticket === requestId.current) setLoading(false);
    }
  }, [filter]);
  useEffect(() => {
    let alive = true;
    api<{ allowed: true }>("/admin/meeting-points/access")
      .then(() => {
        if (alive) setAccess("allowed");
      })
      .catch((e) => {
        if (alive) {
          setAccess("denied");
          setError(e.message);
        }
      });
    return () => {
      alive = false;
      requestId.current++;
    };
  }, [retry]);
  useEffect(() => {
    if (access === "allowed") void load();
  }, [access, load]);
  function saved(message = "Mjesto je sačuvano.") {
    setEditing(null);
    setMerging(null);
    setMessage(message);
    void load();
  }
  async function availability(point: CatalogPoint) {
    setBusyId(point.id);
    setError("");
    try {
      await api(`/admin/meeting-points/${point.id}/availability`, {
        availability: point.availability === "active" ? "inactive" : "active",
        version: point.version,
      });
      saved("Status je promijenjen.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  }
  async function undo(merge: CatalogMerge) {
    setBusyId(merge.id);
    setError("");
    try {
      await api(`/admin/meeting-points/merges/${merge.id}/undo`, {});
      saved("Spajanje je poništeno.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  }
  const visible = data.points.filter(
    (p) =>
      status === "all" ||
      (status === "merged"
        ? !!p.redirectId
        : !p.redirectId && p.availability === status),
  );
  const byId = new Map(data.points.map((p) => [p.id, p]));
  return (
    <section className="meeting-admin">
      {onBack && (
        <button className="meeting-text-button" onClick={onBack}>
          <ArrowLeft size={17} />
          {tr("Nazad")}
        </button>
      )}
      <header className="meeting-heading">
        <span className="eyebrow">{tr("KATALOG MJESTA SUSRETA")}</span>
        <h1>{tr("Mjesta koja prepoznajemo.")}</h1>
        <p>
          {tr(
            "Uređuj javne prijedloge po gradu. Vozač za svaku vožnju potvrđuje tačan pin i mogućnost zaustavljanja.",
          )}
        </p>
      </header>
      {access === "checking" ? (
        <p role="status">{tr("Provjeravamo pristup…")}</p>
      ) : access === "denied" ? (
        <div>
          <h2>{tr("Pristup uređivanju nije dostupan.")}</h2>
          <ErrorBox error={tr(error)} />
          <Button
            variant="outline"
            onClick={() => {
              setAccess("checking");
              setRetry((r) => r + 1);
            }}
          >
            {tr("Pokušaj ponovo")}
          </Button>
        </div>
      ) : (
        <>
          <form
            className="meeting-search"
            onSubmit={(e) => {
              e.preventDefault();
              setMessage("");
              setFilter({ city: city.trim(), query: query.trim() });
            }}
          >
            <label>
              {tr("Grad")}
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={100}
                autoComplete="address-level2"
              />
            </label>
            <label>
              {tr("Naziv ili drugi naziv")}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={160}
              />
            </label>
            <Button type="submit" disabled={loading}>
              <Search size={17} />
              {tr("Pretraži")}
            </Button>
          </form>
          <div className="meeting-toolbar">
            <label>
              <span className="sr-only">{tr("Status")}</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{tr("Svi statusi")}</option>
                {(["candidate", "active", "inactive"] as Availability[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {tr(statusLabel(s))}
                    </option>
                  ),
                )}
                <option value="merged">{tr("Spojeno")}</option>
              </select>
            </label>
            <Button variant="lime" onClick={() => setEditing("new")}>
              <Plus size={17} />
              {tr("Dodaj kandidata")}
            </Button>
          </div>
          <p className="meeting-note">
            {tr(
              "Novi doprinosi ostaju kandidati dok ih urednik ne pregleda i aktivira.",
            )}
          </p>
          <ErrorBox error={tr(error)} />
          {message && (
            <p className="meeting-success" role="status">
              <Check size={17} />
              {tr(message)}
            </p>
          )}
          {loading ? (
            <p role="status">{tr("Učitavamo mjesta…")}</p>
          ) : (
            <>
              {!visible.length && (
                <p className="meeting-empty">
                  {tr("Nema mjesta za ovu pretragu.")}
                </p>
              )}
              <ul className="meeting-points">
                {visible.map((point) => (
                  <li
                    key={point.id}
                    className={
                      "meeting-card" +
                      (point.redirectId ? " meeting-merged" : "")
                    }
                  >
                    <div className="meeting-card-top">
                      <span
                        className={
                          "meeting-badge " +
                          (point.redirectId ? "merged" : point.availability)
                        }
                      >
                        {tr(
                          point.redirectId
                            ? "Spojeno"
                            : statusLabel(point.availability),
                        )}
                      </span>
                      <small>
                        {tr(
                          point.source === "contribution"
                            ? "Doprinos uz pristanak"
                            : "Unos urednika",
                        )}
                      </small>
                    </div>
                    <h2>
                      <MapPin size={19} />
                      {point.name}
                    </h2>
                    <p className="meeting-city">
                      {point.city} · {point.lat.toFixed(5)},{" "}
                      {point.lng.toFixed(5)}
                    </p>
                    {point.detail && <p>{point.detail}</p>}
                    <p className="meeting-aliases">
                      {point.aliases
                        .filter((a) => a !== point.name)
                        .join(" · ")}
                    </p>
                    <dl className="meeting-metadata">
                      <div>
                        <dt>{tr("Prilaz")}</dt>
                        <dd>{point.approach || tr("Nije navedeno")}</dd>
                      </div>
                      <div>
                        <dt>{tr("Strana ceste / ulaz")}</dt>
                        <dd>{point.side || tr("Nije navedeno")}</dd>
                      </div>
                    </dl>
                    <div className="meeting-feedback">
                      <span
                        aria-label={
                          tr("Pozitivne ocjene") +
                          ": " +
                          point.feedback.positive
                        }
                      >
                        <ThumbsUp size={14} />
                        {point.feedback.positive}
                      </span>
                      <span
                        aria-label={
                          tr("Negativne ocjene") +
                          ": " +
                          point.feedback.negative
                        }
                      >
                        <ThumbsDown size={14} />
                        {point.feedback.negative}
                      </span>
                      <small>
                        {tr("{people} učesnika · {bookings} završenih vožnji", {
                          people: point.feedback.participants,
                          bookings: point.feedback.completedBookings,
                        })}
                      </small>
                    </div>
                    {point.feedback.lastAt && (
                      <p className="meeting-note">
                        {tr("Posljednja ocjena: {date}", {
                          date: new Intl.DateTimeFormat(locale()).format(
                            point.feedback.lastAt,
                          ),
                        })}
                        <br />
                        {tr("Posljednjih 90 dana: {people} učesnika", {
                          people: point.feedback.recentParticipants,
                        })}
                      </p>
                    )}
                    {point.redirectId ? (
                      <p className="meeting-note">
                        →{" "}
                        {byId.get(point.redirectId)?.name ||
                          tr("Glavno mjesto koje zadržava pin")}
                      </p>
                    ) : (
                      <div className="meeting-card-actions">
                        <button
                          disabled={!!busyId}
                          onClick={() => setEditing(point)}
                        >
                          <Pencil size={15} />
                          {tr("Uredi")}
                        </button>
                        <button
                          disabled={!!busyId}
                          onClick={() => void availability(point)}
                        >
                          {tr(
                            point.availability === "active"
                              ? "Označi nedostupnim"
                              : "Aktiviraj",
                          )}
                        </button>
                        <button
                          disabled={!!busyId}
                          onClick={() => setMerging({ source: point })}
                        >
                          <GitMerge size={15} />
                          {tr("Spoji")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {data.duplicateSuggestions.length > 0 && (
                <details className="meeting-review">
                  <summary>
                    {tr("Mogući duplikati")} ·{" "}
                    {data.duplicateSuggestions.length}
                  </summary>
                  <p>
                    {tr(
                      "Sličan naziv i blizina nisu dovoljni: provjeri prilaz i stranu ceste prije spajanja.",
                    )}
                  </p>
                  {data.duplicateSuggestions.map((pair) => {
                    const source = byId.get(pair.sourceId),
                      target = byId.get(pair.targetId);
                    if (!source || !target) return null;
                    return (
                      <div
                        className="meeting-history-row"
                        key={pair.sourceId + pair.targetId}
                      >
                        <span>
                          <strong>
                            {source.name} · {target.name}
                          </strong>
                          <small>
                            {pair.distanceMeters} m
                            {pair.conflicts.side || pair.conflicts.approach
                              ? " · " + tr("Različita strana ili prilaz")
                              : ""}
                          </small>
                        </span>
                        <button
                          disabled={!!busyId}
                          className="meeting-text-button"
                          onClick={() =>
                            setMerging({ source, targetId: target.id })
                          }
                        >
                          {tr("Pregledaj spajanje")}
                        </button>
                      </div>
                    );
                  })}
                </details>
              )}
              {data.merges.length > 0 && (
                <details className="meeting-review">
                  <summary>
                    {tr("Historija spajanja")} · {data.merges.length}
                  </summary>
                  {data.merges.map((merge) => (
                    <div className="meeting-history-row" key={merge.id}>
                      <span>
                        <strong>
                          {byId.get(merge.sourceId)?.name ||
                            tr("Izvorno mjesto")}{" "}
                          →{" "}
                          {byId.get(merge.targetId)?.name ||
                            tr("Glavno mjesto koje zadržava pin")}
                        </strong>
                        <small>
                          {new Intl.DateTimeFormat(locale(), {
                            dateStyle: "medium",
                          }).format(merge.createdAt)}
                        </small>
                      </span>
                      {merge.undoneAt ? (
                        <small>{tr("Spajanje poništeno")}</small>
                      ) : (
                        <button
                          className="meeting-text-button"
                          disabled={!!busyId}
                          onClick={() => void undo(merge)}
                        >
                          <Undo2 size={15} />
                          {tr("Poništi spajanje")}
                        </button>
                      )}
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
          <CandidateImport
            onSaved={(message) => {
              setMessage(message);
              void load();
            }}
          />
        </>
      )}
      {access === "allowed" && editing && (
        <PointEditor
          current={editing === "new" ? undefined : editing}
          initialCity={filter.city}
          onClose={() => setEditing(null)}
          onSaved={() => saved()}
        />
      )}
      {access === "allowed" && merging && (
        <MergeEditor
          source={merging.source}
          points={data.points}
          initialTargetId={merging.targetId}
          onClose={() => setMerging(null)}
          onSaved={() => saved("Mjesta su spojena.")}
        />
      )}
    </section>
  );
}
