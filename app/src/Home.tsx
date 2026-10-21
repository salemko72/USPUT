import { MeetingStopsEditor } from "./MeetingStopsEditor";
import { SavedSearches } from "./SavedSearches";
import { savePassengerSearch } from "./saved-searches";
import { LocationScopeControl, type LocationScope } from "./LocationScope";
import { api } from "./api";
import { RouteMap } from "./Map";
import { StreetPicker } from "./StreetPicker";
import { PlacePicker } from "./PlacePicker";
import { t } from "./i18n";
import { VehicleManager, vehicleDescription } from "./VehicleManager";
import { useState } from "react";
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
} from "./types";
import { dateLabel, searchPlace, defaultSearch, today } from "./types";
import { Avatar, Button, ErrorBox, Modal } from "./ui";
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
}) {
  const [role, setRole] = useState<"passenger" | "driver">("passenger"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [vehicle, setVehicle] = useState<Vehicle | null>(null),
    [passengerFormOpen, setPassengerFormOpen] = useState(false),
    [stopsApproved, setStopsApproved] = useState(false),
    [shareMeetingPoints, setShareMeetingPoints] = useState(false),
    [preview, setPreview] = useState<{
      offer: Offer;
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
    } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    setBusy(true);
    try {
      const offer: Offer = {
        ...query,
        car: vehicleDescription(vehicle),
        vehicleId: vehicle.id,
        note: String(f.get("note")),
        costSharing: f.get("costSharing") === "on",
      };
      {
        const result = await api<{
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
        }>("/routes/preview", offer);
        setStopsApproved(false);
        setShareMeetingPoints(false);
        setPreview({ ...result, offer });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="home-page">
      {preview && (
        <Modal
          title={t("Je li ovo ruta kojom stvarno voziš?")}
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <RouteMap
            from={preview.from}
            to={preview.to}
            geometry={preview.route.coordinates}
            provider={preview.route.provider}
            stops={preview.meetingStops}
            large
          />
          <p>
            {Math.round(preview.route.distance / 100) / 10} km ·{" "}
            {Math.ceil(preview.route.duration / 60)} min
          </p>
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
              setPreview({ ...preview, meetingStops, previewToken: undefined });
              setStopsApproved(false);
            }}
          />
          {!preview.previewToken && (
            <p className="meeting-route-outdated">
              {t(
                "Proračunaj konačnu trasu kroz odabrana mjesta susreta prije objave.",
              )}
            </p>
          )}
          <Button
            variant="outline"
            busy={busy}
            disabled={preview.meetingStops.some(
              (p) =>
                p.name.trim().length < 2 || /^Predložena tačka/.test(p.name),
            )}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await api<
                  Omit<NonNullable<typeof preview>, "offer">
                >("/routes/preview", {
                  ...preview.offer,
                  meetingStops: preview.meetingStops,
                });
                setPreview({ ...result, offer: preview.offer });
                setStopsApproved(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Proračunaj trasu s ovim tačkama")}
          </Button>
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
          <ErrorBox error={error} />
          <Button
            busy={busy}
            disabled={!preview.previewToken || !stopsApproved}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onPublish({
                  ...preview.offer,
                  routeConfirmed: true,
                  stopsConfirmed: true,
                  previewToken: preview.previewToken,
                  meetingStops: preview.meetingStops,
                  shareMeetingPoints,
                });
                setPreview(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Vozim ovom trasom — objavi")}
          </Button>
        </Modal>
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
          <div className="search-title">
            <h2>
              {role === "passenger"
                ? t("Gdje se vidimo?")
                : t("Imaš slobodno mjesto?")}
            </h2>
            <p>
              {role === "passenger"
                ? t("Tvoj svakodnevni put, s nekim novim.")
                : t("Tvoja ruta. Tvoje vrijeme. Jedan saputnik.")}
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
              onNew={() => {
                setQuery({ ...defaultSearch(), date: today() });
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
                  <label className="field-label">
                    {t(" Kratka napomena ")}
                    <span className="optional">{t("opcionalno")}</span>
                    <textarea
                      name="note"
                      placeholder={t("Bez pušenja, malo muzike…")}
                      maxLength={280}
                      rows={2}
                    />
                  </label>
                  <label className="cost-sharing-choice">
                    <input type="checkbox" name="costSharing" />
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
                    {t(" Jedno mjesto. Jasan dogovor. Bez obaveze skretanja. ")}
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
