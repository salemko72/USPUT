import { useState } from "react";
import {
  Car,
  UserRound,
  ArrowDownUp,
  Clock3,
  MapPin,
  CalendarDays,
  Leaf,
  ArrowUpRight,
} from "lucide-react";
import type { User, Place, Search, Offer } from "./types";
import { dateLabel, today } from "./types";
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
            <span>POLAZIŠTE</span>
            <select
              aria-label="Polazište"
              value={value.from}
              onChange={(e) => set("from", e.target.value)}
            >
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </label>
        <button
          className="swap-button"
          type="button"
          aria-label="Zamijeni polazište i odredište"
          onClick={() => onChange({ ...value, from: value.to, to: value.from })}
        >
          <ArrowDownUp size={17} />
        </button>
        <label className="location-field">
          <MapPin size={20} />
          <div>
            <span>ODREDIŠTE</span>
            <select
              aria-label="Odredište"
              value={value.to}
              onChange={(e) => set("to", e.target.value)}
            >
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>
      <div className="date-time-fields">
        <label className="native-picker">
          <CalendarDays size={18} />
          <span className="picker-display">{dateLabel(value.date)}</span>
          <span className="sr-only">Datum polaska</span>
          <input
            aria-label="Datum polaska"
            type="date"
            value={value.date}
            min={today()}
            required
            onChange={(e) => set("date", e.target.value)}
          />
        </label>
        <label className="native-picker">
          <Clock3 size={18} />
          <span className="picker-display">{value.time}</span>
          <span className="sr-only">Vrijeme polaska</span>
          <input
            aria-label="Vrijeme polaska"
            type="time"
            value={value.time}
            required
            onChange={(e) => set("time", e.target.value)}
          />
        </label>
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
}: {
  user: User;
  places: Place[];
  query: Search;
  setQuery: (q: Search) => void;
  onSearch: () => void;
  onPublish: (o: Offer) => Promise<void>;
  onProfile: () => void;
  demo: boolean;
}) {
  const [role, setRole] = useState<"passenger" | "driver">("passenger"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (query.from === query.to) {
      setError("Polazište i odredište trebaju biti različiti.");
      return;
    }
    if (role === "passenger") {
      onSearch();
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await onPublish({
        ...query,
        car: String(f.get("car")),
        note: String(f.get("note")),
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
            DOBRO JUTRO, {user.name.split(" ")[0].toLocaleUpperCase("bs")}.
          </span>
          <button
            className="avatar-button"
            aria-label="Otvori profil"
            onClick={onProfile}
          >
            <Avatar name={user.name} size="small" />
          </button>
        </div>
        <h1>
          Tvoj put.
          <br />
          Dobro društvo<span className="punctuation">.</span>
        </h1>
        <p>Zajedno do posla.</p>
        <img
          src="/urban-hero.webp"
          alt="Zeleni automobil na gradskoj ruti, poslovne zgrade, tramvaj i zelenilo"
        />
        <span className="home-hero-tag">
          <i /> Sarajevo · prvi krug
        </span>
      </section>
      <div className="home-bottom">
        <section className="search-card">
          <div className="role-switch" aria-label="Tvoja uloga">
            <button
              className={role === "passenger" ? "selected" : ""}
              aria-pressed={role === "passenger"}
              onClick={() => {
                setRole("passenger");
                setError("");
              }}
            >
              <UserRound size={18} /> Tražim vožnju
            </button>
            <button
              className={role === "driver" ? "selected" : ""}
              aria-pressed={role === "driver"}
              onClick={() => {
                setRole("driver");
                setError("");
              }}
            >
              <Car size={18} /> Nudim vožnju
            </button>
          </div>
          <div className="search-title">
            <h2>
              {role === "passenger"
                ? "Gdje se vidimo?"
                : "Imaš slobodno mjesto?"}
            </h2>
            <p>
              {role === "passenger"
                ? "Tvoj svakodnevni put, s nekim novim."
                : "Tvoja ruta. Tvoje vrijeme. Jedan saputnik."}
            </p>
          </div>
          <form onSubmit={submit}>
            <SearchFields value={query} onChange={setQuery} places={places} />
            {role === "driver" && (
              <div className="offer-fields">
                <label className="field-label">
                  Vozilo i boja
                  <div className="input-wrap">
                    <Car size={18} />
                    <input
                      name="car"
                      placeholder="npr. VW Golf · sivi"
                      minLength={3}
                      maxLength={80}
                      required
                    />
                  </div>
                </label>
                <label className="field-label">
                  Kratka napomena <span className="optional">opcionalno</span>
                  <textarea
                    name="note"
                    placeholder="Bez pušenja, malo muzike…"
                    maxLength={280}
                    rows={2}
                  />
                </label>
                <div className="soft-note">
                  <Leaf size={17} /> Jedno mjesto. Bez naplate. Bez obaveze
                  skretanja.
                </div>
              </div>
            )}
            <ErrorBox error={error} />
            <Button type="submit" arrow busy={busy}>
              {role === "passenger" ? "Pronađi vožnju" : "Objavi vožnju"}
            </Button>
          </form>
          <p className="search-footnote">
            <Leaf size={13} />{" "}
            {role === "passenger"
              ? "Besplatno. Zajedno do posla."
              : "Putnik prvo šalje zahtjev. Ti potvrđuješ dogovor."}
          </p>
        </section>
        <section className="home-aside">
          <div className="aside-heading">
            <span className="eyebrow">MALI DOGOVOR. DOBAR DAN.</span>
            <span className="circle-arrow">
              <ArrowUpRight size={23} />
            </span>
          </div>
          <h2>
            Nekome si
            <br />
            baš usput.
          </h2>
          <p>
            Ne mijenjaš svoj dan.
            <br />
            Samo ga podijeliš.
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
            <span className="small-pill">1 slobodno mjesto</span>
          </div>
          <p className="fine-print">
            {demo
              ? "Razgledaj s probnim profilima. Stvarne vožnje se ovdje ne dogovaraju."
              : "Beta podržava odabrana mjesta susreta u Sarajevu. Nova mjesta dodajemo nakon provjere."}
          </p>
        </section>
      </div>
    </div>
  );
}
