import { useEffect, useRef, useState } from "react";
import { MapPin, Radio } from "lucide-react";
import { api } from "./api";
import { Button, ErrorBox } from "./ui";
import { t } from "./i18n";
import { useLiveLocation } from "./LiveLocationProvider";
import {
  GPS_FRESH_MS,
  GPS_HIDE_MS,
  type LiveLocationState,
  type LocationFix,
} from "./live-location-client";
import type { Booking } from "./types";
import type { LiveMapPoint } from "./Map";
export function LiveLocationCard({
  booking: b,
  viewerId,
  onPositions,
}: {
  booking: Booking;
  viewerId: string;
  onPositions?: (id: string, positions: LiveMapPoint[]) => void;
}) {
  const sharing = useLiveLocation(),
    [state, setState] = useState<LiveLocationState>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const offset = useRef(0),
    publish = useRef(onPositions);
  publish.current = onPositions;
  const peerName =
    b.ride.driver.id === viewerId ? b.passenger.name : b.ride.driver.name;
  const terminal =
    !["accepted", "ready"].includes(b.status) ||
    !["open", "matched"].includes(b.ride.status);
  useEffect(() => {
    let alive = true,
      version = 0;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const current = ++version;
      try {
        const data = await api<LiveLocationState>(
          "/bookings/" + b.id + "/location",
        );
        if (!alive || current !== version) return;
        offset.current = data.serverNow - Date.now();
        setState(data);
        setError("");
      } catch (e) {
        if (alive && current === version) setError((e as Error).message);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const visible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("usput:booking-changed", visible);
    return () => {
      alive = false;
      version++;
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("usput:booking-changed", visible);
      publish.current?.(b.id, []);
    };
  }, [b.id, b.status, b.ride.status]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const serverNow = now + offset.current;
  const available =
    !!state?.available &&
    !terminal &&
    serverNow >= state.opensAt &&
    serverNow < state.endsAt;
  const usable = (fix: LocationFix | null | undefined) =>
    available && fix && serverNow - fix.capturedAt <= GPS_HIDE_MS ? fix : null;
  const own = usable(state?.ownLocation),
    peer = usable(state?.peerLocation);
  useEffect(() => {
    const positions: LiveMapPoint[] = [];
    for (const [fix, label, isOwn] of [
      [own, t("Ti"), true],
      [peer, peerName, false],
    ] as const)
      if (fix)
        positions.push({
          ...fix,
          label,
          own: isOwn,
          stale: serverNow - fix.capturedAt > GPS_FRESH_MS,
        });
    publish.current?.(b.id, positions);
  }, [state, Math.floor(serverNow / 1000), terminal, peerName, viewerId]);
  const active = sharing.activeIds.includes(b.id) || !!state?.ownSharing;
  const starting = sharing.startingIds.includes(b.id);
  const stamp = (value: number) =>
    new Intl.DateTimeFormat("bs-BA", {
      timeZone: "Europe/Sarajevo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(value);
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (active || starting) await sharing.stop(b.id);
      else await sharing.start(b.id);
      const data = await api<LiveLocationState>(
        "/bookings/" + b.id + "/location",
      );
      setState(data);
      offset.current = data.serverNow - Date.now();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function freshness(fix: LocationFix) {
    const seconds = Math.max(
      0,
      Math.floor((serverNow - fix.capturedAt) / 1000),
    );
    return (
      <span className={seconds > 30 ? "gps-stale" : "gps-fresh"}>
        {t(
          seconds > 30
            ? "Starija lokacija · prije {seconds} s"
            : "Svježa lokacija · prije {seconds} s",
          { seconds },
        )}{" "}
        · {t("preciznost ±{metres} m", { metres: Math.ceil(fix.accuracy) })}
      </span>
    );
  }
  return (
    <section
      className="live-location-card"
      aria-label={t("Lokacije tokom susreta")}
    >
      <h3>
        <Radio size={18} />
        {t("Lokacije tokom susreta")}
      </h3>
      <p>
        {t("Svoju lokaciju dobrovoljno dijeliš samo sa: {name}.", {
          name: peerName,
        })}
      </p>
      {state && !available && !terminal && (
        <p role="status">
          {serverNow < state.opensAt
            ? t("Dostupno od {time}, pet minuta prije susreta.", {
                time: stamp(state.opensAt),
              })
            : t("Vrijeme za dijeljenje lokacije je isteklo.")}
        </p>
      )}
      {available && (
        <p className="gps-peer-status">
          {peer ? (
            <>
              <strong>{peerName}</strong>
              {freshness(peer)}
            </>
          ) : (
            t(
              state?.peerSharing
                ? "Čekamo svježu lokaciju druge osobe."
                : "Druga osoba još ne dijeli lokaciju.",
            )
          )}
        </p>
      )}
      {own && (
        <p className="gps-own-status">
          <strong>{t("Tvoja podijeljena lokacija")}</strong>
          {freshness(own)}
        </p>
      )}
      <Button
        variant={active ? "outline" : "lime"}
        busy={busy}
        disabled={!active && (!available || starting || busy)}
        onClick={toggle}
      >
        <MapPin size={18} />
        {t(
          active
            ? "Prekini dijeljenje lokacije"
            : starting
              ? "Čekamo GPS dozvolu…"
              : "Dijeli moju lokaciju",
        )}
      </Button>
      <small>
        {t(
          "GPS radi dok je aplikacija otvorena. U pozadini se dijeljenje pauzira. Završetak ili otkazivanje ga gase; zaštitni maksimum je šest sati.",
        )}
      </small>
      <small>
        {t(
          "Plavo: ti. Zeleno: druga osoba. Sivo: starija lokacija. GPS ne potvrđuje da ste se sreli.",
        )}
      </small>
      <ErrorBox error={error} />
    </section>
  );
}
