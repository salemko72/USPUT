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
import type { User, Place, Search, Offer, Service, Vehicle } from "./types";
import { dateLabel } from "./types";
import { Avatar, Button, ErrorBox } from "./ui";
export function SearchFields({
  value,
  onChange,
  places,
}: {
  value: Search;
  onChange: (s: Search) => void;
  places: Place[];
}) {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <>
      <div className="route-fields">
        <label className="location-field">
          <span className="location-symbol origin-dot" />
          <div>
            <span>{t("POLAZIŠTE")}</span>
            <PlacePicker
              label={t("Polazište")}
              value={value.from}
              places={places}
              onChange={(id) => set("from", id)}
            />
          </div>
        </label>
        <button
          className="swap-button"
          type="button"
          aria-label={t("Zamijeni polazište i odredište")}
          onClick={() => onChange({ ...value, from: value.to, to: value.from })}
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
              onChange={(id) => set("to", id)}
            />
          </div>
        </label>
      </div>
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
    [vehicle, setVehicle] = useState<Vehicle | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (
      !places.some((p) => p.id === query.from) ||
      !places.some((p) => p.id === query.to)
    ) {
      setError("Odaberi polazište i odredište iz prijedloga.");
      return;
    }
    if (query.from === query.to) {
      setError("Polazište i odredište trebaju biti različiti.");
      return;
    }
    if (role === "passenger") {
      onSearch();
      return;
    }
    if (!vehicle) {
      setError("Dodaj svoje vozilo prije objave ponude.");
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await onPublish({
        ...query,
        car: vehicleDescription(vehicle),
        vehicleId: vehicle.id,
        note: String(f.get("note")),
        costSharing: f.get("costSharing") === "on",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="home-page">
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
            <Avatar name={user.name} size="small" />
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
          {places.find((p) => p.id === query.from)?.city || t("Beta područje")}
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
          <form onSubmit={submit}>
            <SearchFields value={query} onChange={setQuery} places={places} />
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
              {role === "passenger" ? t("Pronađi vožnju") : t("Objavi vožnju")}
            </Button>
          </form>
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
            <span>{places.find((p) => p.id === query.from)?.name}</span>
            <span className="journey-line" />
            <span>{places.find((p) => p.id === query.to)?.name}</span>
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
                  "Beta podržava odabrana mjesta susreta u Sarajevu. Nova mjesta dodajemo nakon provjere.",
                )}
          </p>
        </section>
      </div>
    </div>
  );
}
