import { LanguageSwitch } from "./LanguageSwitch";
import { t } from "./i18n";
import { useState } from "react";
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Mail,
  LockKeyhole,
  UserRound,
  ArrowLeft,
  Sparkles,
  Leaf,
} from "lucide-react";
import { api } from "./api";
import type { User } from "./types";
import { Brand, Button, ErrorBox, Modal } from "./ui";
export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <div className="landing-art">
        <header>
          <Brand />
          <div className="entry-tools">
            <span className="beta-pill">{t("PRVI KRUG · BETA")}</span>
            <LanguageSwitch />
          </div>
        </header>
        <div className="landing-headline">
          <span className="eyebrow">{t("DOBRO DOŠAO U SVOJ SMJER")}</span>
          <h1>
            {t(" Tvoj put. ")}
            <br />
            {t(" Dobro društvo")}
            <span className="punctuation">.</span>
          </h1>
          <p>
            {t(" Već ideš tamo. ")}
            <br />
            {t(" Nekome si baš usput. ")}
          </p>
        </div>
        <img
          src="/urban-hero.webp"
          className="landing-image"
          alt={t("Zeleni gradski automobil, urbana naselja, tramvaj i drveće")}
          fetchPriority="high"
        />
        <div className="art-sticker">
          <span className="sticker-dots">● ●</span>
          {t(" Manje praznih mjesta. ")}
          <br />
          {t(" Više dobrih jutara. ")}
        </div>
      </div>
      <section className="landing-panel">
        <div className="panel-top">
          <span className="tiny-route">
            <i />
            <span />
            <i />
          </span>
          <span>{t("GRAD JE LJEPŠI ZAJEDNO")}</span>
        </div>
        <h2>
          {t(" Isti smjer. ")}
          <br />
          {t(" Novi ljudi. ")}
        </h2>
        <p>
          {t(
            " Pronađi nekoga ko već ide tvojim putem. Ili ponudi slobodno mjesto na svom. ",
          )}
        </p>
        <div className="landing-perks">
          <span>
            <Leaf size={16} />
            {t(" Dijelimo put ")}
          </span>
          <span>
            <Sparkles size={16} />
            {t(" Svakodnevno, jednostavno ")}
          </span>
        </div>
        <div className="landing-actions">
          <Button arrow onClick={onStart}>
            {t(" Krenimo zajedno ")}
          </Button>
        </div>
        <p className="fine-print">
          {t(" Za korištenje aplikacije prijavi se ili napravi račun. ")}
        </p>
        <div className="landing-footer">
          <Brand />
          <span>
            {t(" Podijeli put. ")}
            <br />
            {t(" Zadrži svoju rutinu. ")}
          </span>
        </div>
      </section>
    </div>
  );
}
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.04H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.59C7.19 7.71 9.4 5.95 12 5.95Z"
      />
    </svg>
  );
}
export function Auth({
  initial = "login",
  googleEnroll = false,
  onUser,
  onBack,
}: {
  initial?: "login" | "register";
  googleEnroll?: boolean;
  onUser: (u: User) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState(initial),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState("");
  const register = mode === "register" || googleEnroll;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await api<{ user: User }>(
        googleEnroll
          ? "/auth/google/enroll"
          : register
            ? "/auth/register"
            : "/auth/login",
        {
          name: f.get("name"),
          city: f.get("city"),
          email: f.get("email"),
          password: f.get("password"),
          adult: f.get("adult") === "on",
          terms: f.get("terms") === "on",
        },
      );
      onUser(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setError("");
    try {
      const config = await api<{ google: boolean }>("/auth/config");
      if (config.google) window.location.assign("/api/auth/google");
      else setModal("google");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <Brand />
        <div>
          <span className="eyebrow">{t("SVAKI DAN, MALO BOLJI.")}</span>
          <h2>
            {t(" Slobodno ")}
            <br />
            {t(" mjesto. ")}
            <br />
            {t(" Dobar početak. ")}
          </h2>
          <p>
            {t(" Za posao, za grad. ")}
            <br />
            {t(" Za ljude kojima si usput. ")}
          </p>
        </div>
        <img
          src="/urban-hero.webp"
          alt={t("Gradska vožnja u zelenom automobilu")}
        />
      </aside>
      <main className="auth-main">
        <header>
          <button className="text-button" onClick={onBack}>
            <ArrowLeft size={18} />
            {t(" Početna ")}
          </button>
          <div className="entry-tools">
            <Brand />
            <LanguageSwitch />
          </div>
        </header>
        <div className="auth-form-wrap">
          <span className="eyebrow">
            {register ? t("TVOJ PRVI KORAK") : t("TU SI. LIJEPO.")}
          </span>
          <h1>
            {register ? (
              <>
                {t(" Dobro društvo ")}
                <br />
                {t(" počinje tobom. ")}
              </>
            ) : (
              <>
                {t(" Dobro došao ")}
                <br />
                {t(" nazad. ")}
              </>
            )}
          </h1>
          <p className="subtitle">
            {googleEnroll
              ? t("Još samo ime i dvije važne potvrde.")
              : register
                ? t("Napravi račun. Pronađi svoj smjer.")
                : t("Tvoje mjesto u gradu te čeka.")}
          </p>
          {!googleEnroll && (
            <>
              <button
                className="google-button"
                onClick={google}
                disabled={busy}
              >
                <GoogleMark />
                {t(" Nastavi s Googleom ")}
              </button>
              <div className="divider">
                <span>{t("ili emailom")}</span>
              </div>
            </>
          )}
          <form onSubmit={submit}>
            {register && (
              <label className="field-label">
                {t(" Tvoje ime ")}
                <div className="input-wrap">
                  <UserRound size={18} />
                  <input
                    name="name"
                    placeholder={t("Kako da te zovemo?")}
                    autoComplete="given-name"
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </div>
              </label>
            )}
            {register && (
              <label className="field-label">
                {t("Grad ili mjesto")}
                <div className="input-wrap">
                  <input
                    name="city"
                    aria-label={t("Grad ili mjesto")}
                    autoComplete="address-level2"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder={t("Npr. Sarajevo, Zagreb, Beograd…")}
                  />
                </div>
                <small className="fine-print">
                  {t(
                    "Ovdje ćemo prvo tražiti tvoje ulice. Grad možeš promijeniti.",
                  )}
                </small>
              </label>
            )}
            {!googleEnroll && (
              <>
                <label className="field-label">
                  {t(" Email adresa ")}
                  <div className="input-wrap">
                    <Mail size={18} />
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder={t("ime@primjer.ba")}
                      maxLength={254}
                      required
                    />
                  </div>
                </label>
                <label className="field-label">
                  {t(" Lozinka ")}
                  <div className="input-wrap">
                    <LockKeyhole size={18} />
                    <input
                      name="password"
                      type={show ? "text" : "password"}
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      placeholder={
                        register ? t("Najmanje 10 znakova") : t("Tvoja lozinka")
                      }
                      minLength={register ? 10 : 1}
                      maxLength={128}
                      required
                    />
                    <button
                      type="button"
                      aria-label={
                        show ? t("Sakrij lozinku") : t("Prikaži lozinku")
                      }
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
              </>
            )}
            {register && (
              <div className="consent">
                <label>
                  <input type="checkbox" name="adult" required />
                  <span>{t("Imam najmanje 18 godina.")}</span>
                </label>
                <label>
                  <input type="checkbox" name="terms" required />
                  <span>
                    {t(" Prihvatam")}{" "}
                    <button type="button" onClick={() => setModal("terms")}>
                      {t(" pravila beta verzije i privatnost ")}
                    </button>
                    .
                  </span>
                </label>
              </div>
            )}
            <ErrorBox error={error} />
            <Button type="submit" busy={busy} arrow>
              {register ? t("Napravi račun") : t("Prijavi se")}
            </Button>
          </form>
          {!googleEnroll && (
            <p className="auth-switch">
              {register ? t("Već imaš račun?") : t("Prvi put si ovdje?")}{" "}
              <button
                onClick={() => {
                  setMode(register ? "login" : "register");
                  setError("");
                }}
              >
                {register ? t("Prijavi se") : t("Napravi račun")}
              </button>
            </p>
          )}
          <p className="fine-print">
            {t(
              " Beta verzija. Bez plaćanja u aplikaciji i bez automatskog praćenja. ",
            )}
          </p>
        </div>
      </main>
      {modal && (
        <Modal
          title={
            modal === "google"
              ? t("Google veza se priprema.")
              : t("Pravila beta verzije")
          }
          onClose={() => setModal("")}
        >
          {modal === "google" ? (
            <>
              <p>
                {t(
                  " Google prijava je pripremljena, ali administrator još treba dodati OAuth podatke za ovu adresu aplikacije. ",
                )}
              </p>
              <p>
                {t(
                  " Do tada koristi email i lozinku. Ništa nije poslano Googleu. ",
                )}
              </p>
              <Button onClick={() => setModal("")}>{t("U redu")}</Button>
            </>
          ) : (
            <>
              <p>
                {t(
                  " Ovo je razvojna beta verzija USPUT-a za punoljetne osobe. Još nije odobrena za organizaciju stvarnih vožnji. ",
                )}
              </p>
              <p>
                {t(
                  " Ime, email, objavljene vožnje i dogovori čuvaju se u bazi ovog okruženja. Lozinke su hashirane, a prijava koristi sesijski kolačić. Email nije javno prikazan drugim korisnicima. ",
                )}
              </p>
              <p>
                {t(
                  " Podatke koristi samo za testiranje; ne unosi privatnu adresu, dokumente ni osjetljive podatke. Kontakt i pravila za stvarnu probu bit će određeni prije njenog početka. Za uklanjanje probnog računa obrati se administratoru projekta. ",
                )}
              </p>
              <p>
                {t(
                  " Demo koristi izmišljene podatke i čuva ih samo u ovom pregledniku. Mapa se učitava s OpenStreetMapa tek kada je uključiš, pri čemu njihov servis prima uobičajene mrežne podatke. ",
                )}
              </p>
              <Button onClick={() => setModal("")}>{t("Razumijem")}</Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
