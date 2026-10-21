import { MeetingStopsEditor } from "./MeetingStopsEditor";
import { SavedSearches } from "./SavedSearches";
import { savePassengerSearch } from "./saved-searches";
import { LocationScopeControl, type LocationScope } from "./LocationScope";
import { api } from "./api";
import { RoutePlanner } from "./RoutePlanner";
import { StreetPicker } from "./StreetPicker";
import { PlacePicker } from "./PlacePicker";
import { t } from "./i18n";
import { VehicleManager, vehicleDescription } from "./VehicleManager";
import { UpcomingRide } from "./UpcomingRide";
import { useEffect, useRef, useState } from "react";
import { DatePicker, TimePicker } from "./DatePicker";
import {
  Car,
  UserRound,
  ArrowDownUp,
  MapPin,
  Leaf,
  ArrowUpRight,
} from "lucide-react";
import type {
  User,
  Place,
  Search,
  Offer,
  Service,
  Vehicle,
  MeetingStop,
  Ride,
} from "./types";
import { dateLabel, searchPlace, defaultSearch, tomorrow } from "./types";
import { Avatar, Button, ErrorBox, Modal } from "./ui";

type RoutePreviewResult = {
  route: {
    coordinates: number[][];
    duration: number;
    distance: number;
    provider?: string;
  };
  from: Place;
  to: Place;
  meetingStops: MeetingStop[];
  catalogSuggestions?: MeetingStop[];
  previewToken?: string;
};
type RoutePreview = RoutePreviewResult & {
  offer: Offer;
  confirmedMeetingStops?: MeetingStop[];
};

export function SearchFields({
  value,
  onChange,
  places,
  defaultCity = "",
}: {
  defaultCity?: string;
  value: Search;
  onChange: (s: Search) => void;
  places: Place[];
}) {
  const [scope, setScope] = useState<LocationScope>({ city: defaultCity });
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <>
      <LocationScopeControl scope={scope} onChange={setScope} />
      <div className="street-fields">
        <StreetPicker
          label={t("Polazište")}
          scope={scope}
          value={searchPlace(value, "from", places)}
          onChange={(p) =>
            onChange({
              ...value,
              from: p?.id || "",
              fromLocation: p ? JSON.stringify(p) : undefined,
            })
          }
        />
        <button
          className="street-swap"
          type="button"
          aria-label={t("Zamijeni polazište i odredište")}
          onClick={() =>
            onChange({
              ...value,
              from: value.to,
              to: value.from,
              fromLocation: value.toLocation,
              toLocation: value.fromLocation,
            })
          }
        >
          <ArrowDownUp size={17} />
        </button>
        <StreetPicker
          label={t("Odredište")}
          scope={scope}
          value={searchPlace(value, "to", places)}
          onChange={(p) =>
            onChange({
              ...value,
              to: p?.id || "",
              toLocation: p ? JSON.stringify(p) : undefined,
            })
          }
        />
      </div>
      <details className="legacy-places">
        <summary>{t("Probna mjesta iz prethodne bete")}</summary>
        <div className="route-fields">
          <label className="location-field">
            <span className="location-symbol origin-dot" />
            <div>
              <span>{t("POLAZIŠTE")}</span>
              <PlacePicker
                label={t("Polazište")}
                value={value.from}
                places={places}
                onChange={(id) =>
                  onChange({ ...value, from: id, fromLocation: undefined })
                }
              />
            </div>
          </label>
          <button
            className="swap-button"
            type="button"
            aria-label={t("Zamijeni polazište i odredište")}
            onClick={() =>
              onChange({ ...value, from: value.to, to: value.from })
            }
          >
            <ArrowDownUp size={17} />
          </button>
          <label className="location-field">
            <MapPin size={20} />
            <div>
              <span>{t("ODREDIŠTE")}</span>
              <PlacePicker
                label={t("Odredište")}
                value={value.to}
                places={places}
                onChange={(id) =>
                  onChange({ ...value, to: id, toLocation: undefined })
                }
              />
            </div>
          </label>
        </div>
      </details>
      <div className="date-time-fields">
        <DatePicker value={value.date} onChange={(date) => set("date", date)} />
        <TimePicker value={value.time} onChange={(time) => set("time", time)} />
      </div>
    </>
  );
}
export function Home({
  user,
  places,
  query,
  setQuery,
  onSearch,
  onPublish,
  onProfile,
  demo,
  service,
  repeatRide,
  onRepeatConsumed,
}: {
  user: User;
  places: Place[];
  query: Search;
  setQuery: (q: Search) => void;
  onSearch: () => void;
  onPublish: (o: Offer) => Promise<void>;
  onProfile: () => void;
  demo: boolean;
  service: Service;
  repeatRide?: Ride;
  onRepeatConsumed?: () => void;
}) {
  const [role, setRole] = useState<"passenger" | "driver">("passenger"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [seats, setSeats] = useState(1),
    [note, setNote] = useState(""),
    [costSharing, setCostSharing] = useState(false),
    [repeatDraft, setRepeatDraft] = useState(false),
    [draftStops, setDraftStops] = useState<MeetingStop[] | undefined>(),
    [vehicle, setVehicle] = useState<Vehicle | null>(null),
    [passengerFormOpen, setPassengerFormOpen] = useState(false),
    [stopsApproved, setStopsApproved] = useState(false),
    [shareMeetingPoints, setShareMeetingPoints] = useState(false),
    [routeCalculating, setRouteCalculating] = useState(false),
    [routePreviewError, setRoutePreviewError] = useState(""),
    [preview, setPreview] = useState<RoutePreview | null>(null);
  const consumedRepeat = useRef<string | undefined>(undefined);
  const draftRouteKey = useRef("");
  const publishTrigger = useRef<HTMLButtonElement>(null);
  const previewRequest = useRef(0),
    previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    mounted = useRef(true);

  function cancelRoutePreview() {
    clearTimeout(previewTimer.current);
    previewTimer.current = undefined;
    return ++previewRequest.current;
  }

  function updateRoutePreview(draft: RoutePreview) {
    const request = cancelRoutePreview();
    // Keep the editable text, including optional blank names, while publishing
    // the server-normalized stops covered by the signed token.
    const next = {
      ...draft,
      previewToken: undefined,
      confirmedMeetingStops: undefined,
    };
    setPreview(next);
    setDraftStops(next.meetingStops);
    setStopsApproved(false);
    setError("");
    setRoutePreviewError("");
    const invalidPin = next.meetingStops.some(
        (p) =>
          !Number.isFinite(p.lat) ||
          !Number.isFinite(p.lng) ||
          Math.abs(p.lat) > 90 ||
          Math.abs(p.lng) > 180,
      ),
      duplicatePin =
        new Set(next.meetingStops.map((p) => `${p.lat},${p.lng}`)).size !==
        next.meetingStops.length;
    if (invalidPin || duplicatePin) {
      setRouteCalculating(false);
      setRoutePreviewError(
        invalidPin
          ? "Svako mjesto susreta treba ispravan pin."
          : "Mjesta susreta trebaju imati različite pinove.",
      );
      return;
    }
    setRouteCalculating(true);
    previewTimer.current = setTimeout(async () => {
      previewTimer.current = undefined;
      try {
        const result = await api<RoutePreviewResult>("/routes/preview", {
          ...next.offer,
          meetingStops: next.meetingStops,
        });
        if (!mounted.current || request !== previewRequest.current) return;
        if (!result.previewToken)
          throw new Error("Proračun trenutno nije dostupan.");
        setPreview({
          ...next,
          ...result,
          meetingStops: next.meetingStops,
          confirmedMeetingStops: result.meetingStops,
        });
      } catch (e) {
        if (mounted.current && request === previewRequest.current)
          setRoutePreviewError((e as Error).message);
      } finally {
        if (mounted.current && request === previewRequest.current)
          setRouteCalculating(false);
      }
    }, 400);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRoutePreview();
    };
  }, []);
  useEffect(() => {
    if (!repeatRide) {
      consumedRepeat.current = undefined;
      return;
    }
    if (consumedRepeat.current === repeatRide.id) return;
    consumedRepeat.current = repeatRide.id;
    setRole("driver");
    setError("");
    cancelRoutePreview();
    setRouteCalculating(false);
    setRoutePreviewError("");
    setPreview(null);
    setStopsApproved(false);
    setShareMeetingPoints(false);
    setSeats(repeatRide.seats ?? 1);
    setNote(repeatRide.note);
    setCostSharing(Boolean(repeatRide.costSharing));
    setDraftStops(repeatRide.meetingStops?.map((stop) => ({ ...stop })));
    draftRouteKey.current = JSON.stringify([
      repeatRide.from.id,
      repeatRide.to.id,
    ]);
    setRepeatDraft(true);
    setQuery({
      from: repeatRide.from.id,
      to: repeatRide.to.id,
      fromLocation: JSON.stringify(repeatRide.from),
      toLocation: JSON.stringify(repeatRide.to),
      date: tomorrow(),
      time: repeatRide.time,
    });
    onRepeatConsumed?.();
  }, [repeatRide, onRepeatConsumed, setQuery]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    publishTrigger.current = e.currentTarget.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    setError("");
    if (
      !(query.fromLocation || places.some((p) => p.id === query.from)) ||
      !(query.toLocation || places.some((p) => p.id === query.to))
    ) {
      setError("Odaberi polazište i odredište iz prijedloga.");
      return;
    }
    if (query.from === query.to) {
      setError("Polazište i odredište trebaju biti različiti.");
      return;
    }
    if (role === "passenger") {
      if (!["5", "10", "15"].includes(query.walkMinutes || "")) {
        setError("Odaberi koliko minuta si spreman hodati.");
        return;
      }
      setBusy(true);
      try {
        await savePassengerSearch(query);
        onSearch();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!vehicle) {
      setError("Dodaj svoje vozilo prije objave ponude.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const request = cancelRoutePreview();
    setRouteCalculating(false);
    setRoutePreviewError("");
    setBusy(true);
    try {
      const offer: Offer = {
        ...query,
        car: vehicleDescription(vehicle),
        vehicleId: vehicle.id,
        note: String(f.get("note")),
        costSharing: f.get("costSharing") === "on",
        seats,
      };
      {
        const preservedStops =
          draftRouteKey.current === JSON.stringify([offer.from, offer.to])
            ? draftStops
            : undefined;
        const result = await api<RoutePreviewResult>("/routes/preview", {
          ...offer,
          ...(preservedStops ? { meetingStops: preservedStops } : {}),
        });
        if (!mounted.current || request !== previewRequest.current) return;
        setStopsApproved(false);
        setShareMeetingPoints(false);
        draftRouteKey.current = JSON.stringify([offer.from, offer.to]);
        const next = {
          ...result,
          offer,
          meetingStops: preservedStops || result.meetingStops,
          confirmedMeetingStops: result.previewToken
            ? result.meetingStops
            : undefined,
        };
        if (result.previewToken) setPreview(next);
        else updateRoutePreview(next);
      }
    } catch (e) {
      if (mounted.current && request === previewRequest.current)
        setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="home-page">
      <UpcomingRide service={service} user={user} />
      {preview && (
        <RoutePlanner
          from={preview.from}
          to={preview.to}
          route={preview.route}
          stops={preview.meetingStops}
          busy={busy}
          returnFocusTo={publishTrigger}
          onClose={() => {
            if (!busy) {
              cancelRoutePreview();
              setRouteCalculating(false);
              setRoutePreviewError("");
              setDraftStops(preview.meetingStops);
              setPreview(null);
            }
          }}
          action={
            <Button
              busy={busy}
              arrow
              disabled={
                routeCalculating || !preview.previewToken || !stopsApproved
              }
              onClick={async () => {
                if (
                  busy ||
                  routeCalculating ||
                  !preview.previewToken ||
                  !stopsApproved
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  await onPublish({
                    ...preview.offer,
                    routeConfirmed: true,
                    stopsConfirmed: true,
                    previewToken: preview.previewToken,
                    meetingStops:
                      preview.confirmedMeetingStops || preview.meetingStops,
                    shareMeetingPoints,
                  });
                  cancelRoutePreview();
                  setPreview(null);
                  setDraftStops(undefined);
                  draftRouteKey.current = "";
                  setRepeatDraft(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Vozim ovom trasom — objavi")}
            </Button>
          }
        >
          <p>
            {t(
              "Ako ova trasa nije tvoj put, nemoj je potvrditi. Vrati se i promijeni polazište ili odredište.",
            )}
          </p>
          <MeetingStopsEditor
            stops={preview.meetingStops}
            city={preview.from.city || user.city || ""}
            route={preview.route.coordinates}
            suggestions={preview.catalogSuggestions}
            onChange={(meetingStops) => {
              updateRoutePreview({ ...preview, meetingStops });
            }}
          />
          {routeCalculating && (
            <p className="meeting-route-outdated" role="status">
              {t("Preračunavam trasu kroz odabrana mjesta susreta…")}
            </p>
          )}
          {routePreviewError && (
            <>
              <ErrorBox error={routePreviewError} />
              <Button
                variant="outline"
                onClick={() => updateRoutePreview(preview)}
              >
                {t("Pokušaj ponovo")}
              </Button>
            </>
          )}
          <label className="stop-confirmation">
            <input
              type="checkbox"
              checked={stopsApproved}
              disabled={!preview.previewToken}
              onChange={(e) => setStopsApproved(e.target.checked)}
            />
            <span>
              {t(
                "Potvrđujem da ovdje mogu stati, primiti i ostaviti putnika. Ovo je trasa kojom ću voziti.",
              )}
            </span>
          </label>
          <details className="route-planner-extra">
            <summary>{t("Dodatne postavke")}</summary>
            <label className="community-contribution">
              <input
                type="checkbox"
                checked={shareMeetingPoints}
                onChange={(e) => setShareMeetingPoints(e.target.checked)}
              />
              <span>
                {t(
                  "Predloži ova javna mjesta zajedničkoj gradskoj bazi. Ne dijeli privatne kućne adrese.",
                )}
              </span>
            </label>
          </details>
          <ErrorBox error={error} />
        </RoutePlanner>
      )}

      <section className="home-hero">
        <div className="home-top">
          <span className="eyebrow">
            {t(" DOBRO JUTRO, ")}
            {user.name.split(" ")[0].toLocaleUpperCase("bs")}.
          </span>
          <button
            className="avatar-button"
            aria-label={t("Otvori profil")}
            onClick={onProfile}
          >
            <Avatar userId={user.id} name={user.name} size="small" />
          </button>
        </div>
        <h1>
          {t(" Tvoj put. ")}
          <br />
          {t(" Dobro društvo")}
          <span className="punctuation">.</span>
        </h1>
        <p>{t("Zajedno do posla.")}</p>
        <img
          src="/urban-hero.webp"
          alt={t(
            "Zeleni automobil na gradskoj ruti, poslovne zgrade, tramvaj i zelenilo",
          )}
        />
        <span className="home-hero-tag">
          <i />
          {searchPlace(query, "from", places)?.city || t("Beta područje")}
          {t(" · prvi krug")}
        </span>
      </section>
      <div className="home-bottom">
        <section className="search-card">
          <div className="role-switch" aria-label={t("Tvoja uloga")}>
            <button
              className={role === "passenger" ? "selected" : ""}
              aria-pressed={role === "passenger"}
              onClick={() => {
                setRole("passenger");
                setError("");
              }}
            >
              <UserRound size={18} />
              {t(" Tražim vožnju ")}
            </button>
            <button
              className={role === "driver" ? "selected" : ""}
              aria-pressed={role === "driver"}
              onClick={() => {
                setRole("driver");
                setError("");
              }}
            >
              <Car size={18} />
              {t(" Nudim vožnju ")}
            </button>
          </div>
          {role === "driver" && repeatDraft && (
            <p className="repeat-draft-note" role="status">
              {t("Provjeri datum i mjesta susreta, pa objavi novu vožnju.")}
            </p>
          )}
          <div className="search-title">
            <h2>
              {role === "passenger"
                ? t("Gdje se vidimo?")
                : t("Imaš slobodno mjesto?")}
            </h2>
            <p>
              {role === "passenger"
                ? t("Tvoj svakodnevni put, s nekim novim.")
                : t("Tvoja ruta. Tvoje vrijeme. Tvoji saputnici.")}
            </p>
          </div>
          {role === "passenger" && (
            <p className="search-flexibility-note">
              {t(
                "Više fleksibilnosti, više prilika za vožnju. Ako ti odgovara malo drugačije vrijeme ili obližnje mjesto susreta, lakše ćeš pronaći saputnika.",
              )}
            </p>
          )}
          {role === "passenger" && !passengerFormOpen && (
            <SavedSearches
              key={user.id}
              selectedDate={query.date}
              onDateChange={(date) => setQuery({ ...query, date })}
              onNew={() => {
                setQuery({ ...defaultSearch(), date: query.date });
                setPassengerFormOpen(true);
                setError("");
              }}
              onLoad={(q) => {
                setQuery(q);
                setPassengerFormOpen(true);
                setError("");
              }}
            />
          )}
          {role === "passenger" && passengerFormOpen && (
            <button
              type="button"
              className="text-button"
              onClick={() => setPassengerFormOpen(false)}
            >
              {t("Sačuvane pretrage")}
            </button>
          )}
          {(role === "driver" || passengerFormOpen) && (
            <form onSubmit={submit}>
              <SearchFields
                value={query}
                onChange={setQuery}
                places={places}
                defaultCity={
                  user.city || searchPlace(query, "from", places)?.city || ""
                }
              />
              {role === "passenger" && (
                <label className="walking-budget">
                  {t("Koliko si spreman hodati?")}
                  <select
                    aria-label={t("Najviše minuta hodanja")}
                    value={query.walkMinutes || ""}
                    onChange={(e) =>
                      setQuery({ ...query, walkMinutes: e.target.value })
                    }
                  >
                    <option value="">{t("Odaberi 5, 10 ili 15 minuta")}</option>
                    {[5, 10, 15].map((n) => (
                      <option key={n} value={String(n)}>
                        {n} min
                      </option>
                    ))}
                  </select>
                  <small>
                    {t(
                      "Najviše po dionici: do mjesta ulaska i od mjesta izlaska.",
                    )}
                  </small>
                </label>
              )}
              {role === "driver" && (
                <div className="offer-fields">
                  <VehicleManager
                    service={service}
                    onChange={setVehicle}
                    compact
                  />
                  <label className="passenger-seats">
                    {t("Slobodna mjesta za putnike")}
                    <select
                      name="seats"
                      aria-label={t("Slobodna mjesta za putnike")}
                      value={seats}
                      onChange={(e) => setSeats(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                    <small>{t("Vozač se ne računa u ovaj broj.")}</small>
                  </label>
                  <label className="field-label">
                    {t(" Kratka napomena ")}
                    <span className="optional">{t("opcionalno")}</span>
                    <textarea
                      name="note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("Bez pušenja, malo muzike…")}
                      maxLength={280}
                      rows={2}
                    />
                  </label>
                  <label className="cost-sharing-choice">
                    <input
                      type="checkbox"
                      name="costSharing"
                      checked={costSharing}
                      onChange={(e) => setCostSharing(e.target.checked)}
                    />
                    <span>
                      <strong>{t("Očekujem dijeljenje troškova")}</strong>
                      <small>
                        {t(
                          "Iznos i način podjele dogovorite prije potvrde vožnje. Plaćanje nije dio aplikacije.",
                        )}
                      </small>
                    </span>
                  </label>
                  <div className="soft-note">
                    <Leaf size={17} />
                    {t(
                      "Slobodna mjesta. Jasan dogovor. Bez obaveze skretanja.",
                    )}
                  </div>
                </div>
              )}
              <ErrorBox error={error} />
              <Button type="submit" arrow busy={busy}>
                {role === "passenger"
                  ? t("Pronađi vožnju")
                  : t("Objavi vožnju")}
              </Button>
            </form>
          )}
          <p className="search-footnote">
            <Leaf size={13} />{" "}
            {role === "passenger"
              ? t("Zajedno do posla. Troškovi su označeni na ponudi.")
              : t("Putnik prvo šalje zahtjev. Ti potvrđuješ dogovor.")}
          </p>
        </section>
        <section className="home-aside">
          <div className="aside-heading">
            <span className="eyebrow">{t("MALI DOGOVOR. DOBAR DAN.")}</span>
            <span className="circle-arrow">
              <ArrowUpRight size={23} />
            </span>
          </div>
          <h2>
            {t(" Nekome si ")}
            <br />
            {t(" baš usput. ")}
          </h2>
          <p>
            {t(" Ne mijenjaš svoj dan. ")}
            <br />
            {t(" Samo ga podijeliš. ")}
          </p>
          <div className="journey-preview">
            <span className="line-dot" />
            <span>{searchPlace(query, "from", places)?.name}</span>
            <span className="journey-line" />
            <span>{searchPlace(query, "to", places)?.name}</span>
            <MapPin size={17} />
          </div>
          <div className="aside-bottom">
            <span>
              {dateLabel(query.date)}
              <strong>{query.time}</strong>
            </span>
            <span className="small-pill">{t("1 slobodno mjesto")}</span>
          </div>
          <p className="fine-print">
            {demo
              ? t(
                  "Razgledaj s probnim profilima. Stvarne vožnje se ovdje ne dogovaraju.",
                )
              : t(
                  "Vozač potvrđuje mjesta susreta na svojoj trasi. Putnik dolazi do odabrane tačke.",
                )}
          </p>
        </section>
      </div>
    </div>
  );
}
