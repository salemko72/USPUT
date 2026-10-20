import { t } from "./i18n";
import { useLanguage } from "./i18n";
import { LanguageSwitch } from "./LanguageSwitch";
import { useEffect, useState } from "react";
import {
  Home as HomeIcon,
  Users,
  UserRound,
  ArrowUpRight,
  Leaf,
  FlaskConical,
  Menu,
  X,
} from "lucide-react";
import { api, realService } from "./api";
import type { User, Place, Search, Offer } from "./types";
import { defaultSearch } from "./types";
import { Brand, Dock, Loading, Toast, ErrorBox } from "./ui";
import { Landing, Auth } from "./Auth";
import { Home } from "./Home";
import { Results, RideDetails, Trips } from "./Rides";
import { Profile } from "./Profile";
function route() {
  return window.location.hash.slice(1) || "home";
}
function go(path: string) {
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: "instant" });
}
export default function App() {
  useLanguage();
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [auth, setAuth] = useState<"landing" | "login" | "register">("landing"),
    [places, setPlaces] = useState<Place[]>([]),
    [query, setQuery] = useState<Search>(defaultSearch),
    [path, setPath] = useState(route),
    [toast, setToast] = useState(""),
    [error, setError] = useState(
      new URLSearchParams(location.search).has("authError")
        ? t(
            "Google prijava je otkazana. Možeš pokušati ponovo ili se prijaviti emailom.",
          )
        : "",
    );
  const demo = false;
  const service = realService;
  useEffect(() => {
    const handler = () => setPath(route());
    window.addEventListener("hashchange", handler);
    let alive = true;
    const init = async () => {
      try {
        try {
          const r = await api<{ user: User }>("/auth/me");
          if (alive) setUser(r.user);
        } catch (e) {
          if ((e as { status: number }).status !== 401 && alive)
            setError((e as Error).message);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    init();
    return () => {
      alive = false;
      window.removeEventListener("hashchange", handler);
    };
  }, []);
  useEffect(() => {
    let active = true;
    service
      .places()
      .then((p) => {
        if (active) {
          setPlaces(p);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [service]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        (document.querySelector(".modal-close") as HTMLButtonElement)?.click();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  function loggedIn(u: User) {
    setUser(u);
    setAuth("landing");
    window.history.replaceState(null, "", window.location.pathname + "#home");
    setPath("home");
  }
  async function logout() {
    if (!demo) await api("/auth/logout", {});
    setUser(null);
    setAuth("landing");
    go("home");
  }
  async function publish(q: Offer) {
    const r = await service.publish(q);
    setToast(
      demo
        ? t("Demo ponuda je sačuvana. Dodan je probni zahtjev putnika.")
        : t("Ponuda je objavljena. Ti potvrđuješ zahtjeve."),
    );
    go("ride/" + r.id);
  }
  if (loading)
    return (
      <div className="boot-screen">
        <Brand />
        <Loading />
      </div>
    );
  const googleEnroll =
    new URLSearchParams(location.search).get("google") === "onboard";
  if (!user)
    return (
      <>
        <ErrorBox error={error} />
        {auth === "landing" && !googleEnroll ? (
          <Landing onStart={() => setAuth("login")} />
        ) : (
          <Auth
            initial={auth === "register" ? "register" : "login"}
            googleEnroll={googleEnroll}
            onUser={loggedIn}

            onBack={() => {
              setAuth("landing");
              if (googleEnroll)
                window.history.replaceState(null, "", window.location.pathname);
            }}
          />
        )}
      </>
    );
  const active =
    path === "profile" ? "profile" : path === "trips" ? "trips" : "home";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand-button"
          onClick={() => go("home")}
          aria-label={t("USPUT početna")}
        >
          <Brand />
        </button>
        <span className="sidebar-edition">{t("TVOJ GRAD. TVOJ KRUG.")}</span>
        <nav aria-label={t("Bočna navigacija")}>
          {[
            [HomeIcon, t("Početna"), "home"],
            [Users, t("Vožnje"), "trips"],
            [UserRound, t("Profil"), "profile"],
          ].map(([Icon, label, id]) => {
            const I = Icon as typeof HomeIcon;
            return (
              <button
                key={String(id)}
                className={active === id ? "active" : ""}
                onClick={() => go(String(id))}
                aria-current={active === id ? "page" : undefined}
              >
                <I size={21} />
                {String(label)}
                {active === id && <ArrowUpRight size={18} />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-message">
          <span className="tiny-route">
            <i />
            <span />
            <i />
          </span>
          <h3>
            {t(" Već ideš tamo. ")}
            <br />
            {t(" Nekome si usput. ")}
          </h3>
          <span>
            <Leaf size={14} />
            {t(" Dogovor na tvom putu. ")}
          </span>
        </div>
        <div className="sidebar-bottom">
          <span className="beta-dot" />
          {t(" Prvi krug · beta")}
          <span>© USPUT 2026</span>
        </div>
      </aside>
      <div className="app-column">
        <header className="app-header">
          <button
            className="brand-button mobile-brand"
            onClick={() => go("home")}
            aria-label={t("USPUT početna")}
          >
            <Brand />
          </button>
          <div className="header-context">
            <span className="live-dot" />
            {places
              .find((p) => p.id === query.from)
              ?.city?.toLocaleUpperCase() || "BETA"}{" "}
            <span>/</span>
            {t(" TVOJ SVAKODNEVNI SMJER ")}
          </div>
          <LanguageSwitch />
          <button
            className="header-profile"
            aria-label={t("Otvori profil")}
            onClick={() => go("profile")}
          >
            <span className="small-avatar">{user.name.charAt(0)}</span>
            <span>{user.name.split(" ")[0]}</span>
            <ArrowUpRight size={16} />
          </button>
        </header>
        {demo && (
          <div className="demo-banner">
            <FlaskConical size={14} />
            <span>
              {t("Demo · izmišljeni profili i lokalni probni dogovori")}
            </span>
            <button onClick={logout}>{t("Izađi")}</button>
          </div>
        )}
        <main className="app-main" id="main-content">
          <ErrorBox error={error} />
          {places.length === 0 ? (
            <>
              <Loading />
              <button className="text-button" onClick={() => location.reload()}>
                {t(" Pokušaj ponovo ")}
              </button>
            </>
          ) : path === "home" ? (
            <Home
              service={service}
              user={user}
              places={places}
              query={query}
              setQuery={setQuery}
              onSearch={() => go("results")}
              onPublish={publish}
              onProfile={() => go("profile")}
              demo={demo}
            />
          ) : path === "results" ? (
            <Results
              service={service}
              query={query}
              onBack={() => go("home")}
              onRide={(id) =>
                go("ride/" + id + "?" + new URLSearchParams(query))
              }
            />
          ) : path.startsWith("ride/") ? (
            <RideDetails
              key={path}
              id={path.slice(5).split("?")[0]}
              query={
                path.includes("?")
                  ? (Object.fromEntries(
                      new URLSearchParams(path.split("?")[1]),
                    ) as Search)
                  : undefined
              }
              service={service}
              user={user}
              demo={demo}
              onBack={() => go("results")}
              onTrips={() => go("trips")}
              onToast={setToast}
            />
          ) : path === "trips" ? (
            <Trips
              service={service}
              user={user}
              onRide={(id) => go("ride/" + id)}
              onHome={() => go("home")}
            />
          ) : path === "profile" ? (
            <Profile
              user={user}
              service={service}
              demo={demo}
              onUser={setUser}
              onLogout={logout}
              onToast={setToast}
            />
          ) : (
            <div className="not-found">
              <h1>{t("Ovdje nema puta.")}</h1>
              <button className="text-button" onClick={() => go("home")}>
                {t(" Vrati se na početnu ")}
              </button>
            </div>
          )}
        </main>
        <Dock active={active} onNav={go} />
        <footer className="app-footer">
          <span>{t("Podijeli put. Zadrži svoju rutinu.")}</span>
          <span>{t("USPUT · Razvojna beta")}</span>
        </footer>
      </div>
      <Toast text={toast} />
    </div>
  );
}
