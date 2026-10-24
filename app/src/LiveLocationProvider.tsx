import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, HttpError } from "./api";
import {
  getDevicePosition,
  gpsError,
  GPS_SEND_INTERVAL,
} from "./live-location-client";
import type { LiveLocationState } from "./live-location-client";
import { t } from "./i18n";
import "./live-location.css";
type Job = {
  bookingId: string;
  sharingId: string;
  endsAt: number;
  offset: number;
  nextSend: number;
  inFlight: boolean;
  leaseUntil: number;
  controller?: AbortController;
};
type LiveContext = {
  automatic: boolean;
  activeIds: string[];
  startingIds: string[];
  notice: string;
  start: (id: string) => Promise<void>;
  stop: (id: string, token?: string) => Promise<void>;
};
const Context = createContext<LiveContext | null>(null);
const pageIsHidden = () => document.visibilityState === "hidden";
export function LiveLocationProvider({
  userId,
  gpsAuto = false,
  demo = false,
  children,
}: {
  userId: string;
  gpsAuto?: boolean;
  demo?: boolean;
  children: ReactNode;
}) {
  const autoEnabled = useRef(gpsAuto),
    paused = useRef(new Set<string>());
  autoEnabled.current = gpsAuto;
  const jobs = useRef(new Map<string, Job>()),
    starting = useRef(new Map<string, symbol>()),
    alive = useRef(true),
    watch = useRef<number | undefined>(undefined),
    last = useRef<GeolocationPosition | undefined>(undefined),
    sender = useRef<(job: Job, position: GeolocationPosition) => Promise<void>>(
      async () => {},
    );
  const [activeIds, setActiveIds] = useState<string[]>([]),
    [startingIds, setStartingIds] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  function sync() {
    if (alive.current) {
      setActiveIds([...jobs.current.keys()]);
      setStartingIds([...starting.current.keys()]);
    }
  }
  function clearWatch() {
    if (watch.current !== undefined) {
      navigator.geolocation?.clearWatch(watch.current);
      watch.current = undefined;
    }
    last.current = undefined;
  }
  function revoke(id: string, token?: string, keepalive = false) {
    return fetch(
      "/api/bookings/" + encodeURIComponent(id) + "/location-sharing",
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          ...(token ? { sharingId: token } : {}),
        }),
        keepalive,
      },
    )
      .then((response) => {
        if (!response.ok && alive.current)
          setNotice(
            "GPS na uređaju je isključen; server će prekinuti pristup najkasnije za 60 sekundi.",
          );
      })
      .catch(() => {
        if (alive.current)
          setNotice(
            "GPS na uređaju je isključen; server će prekinuti pristup najkasnije za 60 sekundi.",
          );
      });
  }
  const stop = useCallback(
    async (id: string, token?: string, manual = true) => {
      const job = jobs.current.get(id);
      if (token && (!job || job.sharingId !== token)) {
        await revoke(id, token);
        return;
      }
      if (manual) paused.current.add(id);
      job?.controller?.abort();
      jobs.current.delete(id);
      starting.current.delete(id);
      if (!jobs.current.size) clearWatch();
      sync();
      await revoke(id, token || job?.sharingId);
    },
    [],
  );
  function stopAll(message = "", keepalive = false) {
    const old = [...jobs.current.values()];
    if (!keepalive)
      for (const id of [...jobs.current.keys(), ...starting.current.keys()])
        paused.current.add(id);
    for (const job of old) job.controller?.abort();
    jobs.current.clear();
    starting.current.clear();
    clearWatch();
    sync();
    for (const job of old) void revoke(job.bookingId, job.sharingId, keepalive);
    if (message && alive.current) setNotice(message);
  }
  sender.current = async (job, position) => {
    if (
      !alive.current ||
      jobs.current.get(job.bookingId) !== job ||
      job.inFlight ||
      Date.now() < job.nextSend
    )
      return;
    if (Date.now() + job.offset >= job.endsAt) {
      await stop(job.bookingId, job.sharingId, false);
      return;
    }
    if (Date.now() - position.timestamp > 45000) return;
    job.nextSend = Date.now() + GPS_SEND_INTERVAL;
    job.inFlight = true;
    const controller = new AbortController();
    job.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await api<{ serverNow: number }>(
        "/bookings/" + job.bookingId + "/location",
        {
          sharingId: job.sharingId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: Math.round(position.timestamp + job.offset),
        },
        controller.signal,
      );
      job.offset = response.serverNow - Date.now();
      job.leaseUntil = Math.min(response.serverNow + 60000, job.endsAt);
    } catch (error) {
      if (!alive.current || jobs.current.get(job.bookingId) !== job) return;
      if (alive.current)
        setNotice(
          (error as Error).name === "AbortError"
            ? "Dijeljenje lokacije trenutno nije dostupno."
            : gpsError(error),
        );
      if (
        error instanceof HttpError &&
        [401, 403, 404, 409].includes(error.status)
      )
        await stop(job.bookingId, job.sharingId, false);
    } finally {
      clearTimeout(timeout);
      job.controller = undefined;
      job.inFlight = false;
    }
  };
  function ensureWatch() {
    if (watch.current !== undefined || !jobs.current.size) return;
    watch.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!alive.current || pageIsHidden()) return;
        setNotice("");
        last.current = position;
        for (const job of jobs.current.values())
          void sender.current(job, position);
      },
      (error) => {
        if (!alive.current) return;
        setNotice(gpsError(error));
        if (error.code === 1) stopAll(gpsError(error));
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
  }
  async function start(id: string, automatic = false) {
    if (automatic && (!autoEnabled.current || paused.current.has(id))) return;
    if (!automatic) paused.current.delete(id);
    if (starting.current.has(id) || jobs.current.has(id)) return;
    if (pageIsHidden())
      throw new Error("Otvori aplikaciju da uključiš lokaciju.");
    const attempt = Symbol(id);
    starting.current.set(id, attempt);
    const ownsAttempt = () =>
      alive.current &&
      starting.current.get(id) === attempt &&
      (!automatic || autoEnabled.current);
    setNotice("");
    sync();
    let token: string | undefined;
    try {
      const access = await api<LiveLocationState>(
        "/bookings/" + id + "/location",
      );
      if (!access.available)
        throw new Error(
          "Lokacija se dijeli od pet minuta prije susreta do završetka dogovora.",
        );
      if (!ownsAttempt() || pageIsHidden()) return;
      const position = await getDevicePosition();
      if (!ownsAttempt() || pageIsHidden()) return;
      type Enabled = { sharingId: string; endsAt: number; serverNow: number };
      let expected = access.ownSharingId ?? null;
      let state: Enabled;
      try {
        state = await api<Enabled>("/bookings/" + id + "/location-sharing", {
          enabled: true,
          automatic,
          expectedSharingId: expected,
        });
      } catch (error) {
        if (
          !(error instanceof HttpError) ||
          error.status !== 409 ||
          !ownsAttempt() ||
          pageIsHidden()
        )
          throw error;
        const current = await api<LiveLocationState>(
          "/bookings/" + id + "/location",
        );
        if (!ownsAttempt() || pageIsHidden()) return;
        if (!current.available) throw error;
        expected = current.ownSharingId ?? null;
        state = await api<Enabled>("/bookings/" + id + "/location-sharing", {
          enabled: true,
          automatic,
          expectedSharingId: expected,
        });
      }
      token = state.sharingId;
      if (!ownsAttempt() || pageIsHidden()) {
        void revoke(id, token, true);
        return;
      }
      const job: Job = {
        bookingId: id,
        sharingId: token,
        endsAt: state.endsAt,
        offset: state.serverNow - Date.now(),
        nextSend: 0,
        inFlight: false,
        leaseUntil: Math.min(state.serverNow + 60000, state.endsAt),
      };
      jobs.current.set(id, job);
      last.current = position;
      sync();
      await sender.current(job, position);
      ensureWatch();
    } catch (error) {
      if (token && jobs.current.get(id)?.sharingId === token) {
        jobs.current.delete(id);
        if (!jobs.current.size) clearWatch();
        sync();
      }
      if (token) void revoke(id, token, true);
      if (!ownsAttempt()) return;
      const message = gpsError(error);
      setNotice(message);
      throw new Error(message);
    } finally {
      if (starting.current.get(id) === attempt) starting.current.delete(id);
      sync();
    }
  }
  const automaticStart = useRef(start);
  automaticStart.current = start;
  useEffect(() => {
    if (!gpsAuto) {
      stopAll();
      return;
    }
    paused.current.clear();
    if (demo) return;
    let disposed = false,
      running = false;
    const retryAfter = new Map<string, number>();
    async function discover() {
      if (disposed || running || pageIsHidden()) return;
      running = true;
      try {
        const data = await api<{ gpsAuto: boolean; bookingIds: string[] }>(
          "/location-agreements",
        );
        if (disposed || pageIsHidden()) return;
        if (!data.gpsAuto) {
          stopAll();
          return;
        }
        const eligible = new Set(data.bookingIds);
        for (const job of jobs.current.values())
          if (!eligible.has(job.bookingId))
            void stop(job.bookingId, job.sharingId, false);
        for (const id of data.bookingIds) {
          if (disposed || !autoEnabled.current || pageIsHidden()) break;
          if (
            jobs.current.has(id) ||
            starting.current.has(id) ||
            paused.current.has(id) ||
            (retryAfter.get(id) || 0) > Date.now()
          )
            continue;
          // Do not repeatedly prompt if device permission was revoked after setup.
          let permitted = false;
          try {
            permitted =
              (await navigator.permissions?.query({ name: "geolocation" }))
                ?.state === "granted";
          } catch {
            /* Require explicit permission confirmation; never prompt automatically. */
          }
          if (disposed || pageIsHidden()) break;
          if (!permitted) {
            setNotice(
              "Dozvoli GPS u profilu da se automatsko dijeljenje nastavi.",
            );
            break;
          }
          retryAfter.set(id, Date.now() + 60000);
          await automaticStart.current(id, true).catch(() => {});
          if (jobs.current.has(id)) retryAfter.delete(id);
        }
      } catch {
        /* Offline discovery never starts GPS. */
      } finally {
        running = false;
      }
    }
    void discover();
    const timer = setInterval(() => void discover(), 15000);
    const visible = () => {
      if (!pageIsHidden()) void discover();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("usput:booking-changed", visible);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("usput:booking-changed", visible);
    };
  }, [gpsAuto, userId, demo, stop]);
  useEffect(() => {
    alive.current = true;
    let refreshing = false;
    const timer = setInterval(() => {
      if (pageIsHidden() || !jobs.current.size) return;
      for (const job of jobs.current.values()) {
        if (Date.now() + job.offset >= job.leaseUntil) {
          setNotice(
            "Dijeljenje je zaustavljeno jer GPS ili veza nisu osvježeni.",
          );
          void stop(job.bookingId, job.sharingId, false);
        } else if (Date.now() + job.offset >= job.endsAt)
          void stop(job.bookingId, job.sharingId, false);
      }
      if (last.current && Date.now() - last.current.timestamp < 30000) {
        for (const job of jobs.current.values())
          void sender.current(job, last.current);
      } else if (!refreshing) {
        refreshing = true;
        getDevicePosition()
          .then((position) => {
            if (alive.current && jobs.current.size && !pageIsHidden()) {
              setNotice("");
              last.current = position;
              for (const job of jobs.current.values())
                void sender.current(job, position);
            }
          })
          .catch((error) => {
            if (alive.current) setNotice(gpsError(error));
          })
          .finally(() => {
            refreshing = false;
          });
      }
    }, 1000);
    const hidden = () => {
      if (pageIsHidden() && (jobs.current.size || starting.current.size))
        stopAll("Dijeljenje je pauzirano jer aplikacija nije otvorena.", true);
    };
    const pagehide = () => stopAll("", true);
    const changed = () => {
      for (const job of jobs.current.values())
        void api<LiveLocationState>("/bookings/" + job.bookingId + "/location")
          .then((state) => {
            if (
              !state.available ||
              !state.ownSharing ||
              state.ownSharingId !== job.sharingId
            )
              void stop(job.bookingId, job.sharingId, false);
          })
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("usput:booking-changed", changed);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("usput:booking-changed", changed);
      stopAll("", true);
    };
  }, [userId, stop]);
  return (
    <Context.Provider
      value={{
        automatic: gpsAuto,
        activeIds,
        startingIds,
        notice,
        start,
        stop,
      }}
    >
      {children}
      {(activeIds.length > 0 || notice) && (
        <aside className="live-sharing-banner" aria-live="polite">
          <span>
            {activeIds.length > 0
              ? t(
                  activeIds.length === 1
                    ? "Dijeliš GPS lokaciju za jedan dogovor."
                    : "Dijeliš GPS lokaciju za {count} dogovora.",
                  {
                    count: activeIds.length,
                  },
                )
              : t(notice)}
          </span>
          {activeIds.length > 0 ? (
            <button type="button" onClick={() => stopAll()}>
              {t("Prekini dijeljenje")}
            </button>
          ) : (
            <button type="button" onClick={() => setNotice("")}>
              {t("Zatvori")}
            </button>
          )}
          {activeIds.length > 0 && notice && <small>{t(notice)}</small>}
        </aside>
      )}
    </Context.Provider>
  );
}
export function useLiveLocation() {
  const value = useContext(Context);
  if (!value) throw new Error("Live location provider missing");
  return value;
}
