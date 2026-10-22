import { useEffect, useId, useState } from "react";
import { Check, CheckCheck, MapPin } from "lucide-react";
import { t } from "./i18n";
import { dateLabel } from "./types";
import type { Booking, Service, User } from "./types";
import { Button, ErrorBox } from "./ui";
import { RideVehiclePhoto } from "./RideVehiclePhoto";
import { displayVehicleLabel } from "./VehicleManager";
import { MeetingPointLabel, isDemoMeetingPoint } from "./MeetingPointLabel";
import "./upcoming-ride.css";

export function UpcomingRide({
  service,
  user,
}: {
  service: Service;
  user: User;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingId = useId();

  useEffect(() => {
    let alive = true;
    let version = 0;
    setBookings([]);
    setError("");
    const refresh = async () => {
      const current = ++version;
      try {
        const mine = await service.mine();
        if (alive && current === version) setBookings(mine.bookings);
      } catch {
        // Keep an already loaded agreement while a background refresh retries.
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("usput:booking-changed", refresh);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("usput:booking-changed", refresh);
    };
  }, [service, user.id]);

  const now = Date.now();
  const upcoming = bookings
    .filter(
      (booking) =>
        booking.passenger.id === user.id &&
        booking.ride.driver.id !== user.id &&
        ["accepted", "ready"].includes(booking.status) &&
        ["open", "matched"].includes(booking.ride.status) &&
        (booking.match?.pickupAt ?? booking.ride.departure) > now,
    )
    .sort(
      (a, b) =>
        (a.match?.pickupAt ?? a.ride.departure) -
        (b.match?.pickupAt ?? b.ride.departure),
    )[0];
  if (!upcoming) return null;

  const pickup = upcoming.match?.pickup || upcoming.ride.from;
  const pickupAt = upcoming.match?.pickupAt ?? upcoming.ride.departure;
  const pickupDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sarajevo",
  }).format(pickupAt);
  const pickupTime = new Intl.DateTimeFormat("bs-BA", {
    timeZone: "Europe/Sarajevo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(pickupAt);
  const ready = upcoming.status === "ready";

  async function confirmReady() {
    if (!upcoming || busy) return;
    setBusy(true);
    setError("");
    try {
      await service.booking(upcoming.id, "ready");
      setBookings((current) =>
        current.map((booking) =>
          booking.id === upcoming.id
            ? { ...booking, status: "ready" }
            : booking,
        ),
      );
      window.dispatchEvent(new Event("usput:booking-changed"));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="upcoming-ride"
      aria-labelledby={headingId}
      aria-busy={busy}
    >
      <div className="upcoming-ride-details">
        <span className="eyebrow">
          <Check size={14} aria-hidden="true" />
          {t("Tvoja sljedeća vožnja")}
        </span>
        <h2 id={headingId}>
          {ready ? t("Vozač zna da si tu.") : t("Javi da si na mjestu.")}
        </h2>
        <div className="upcoming-ride-driver">
          <RideVehiclePhoto
            ride={upcoming.ride}
            viewerId={user.id}
            bookingStatus={upcoming.status}
          />
          <div>
            <span>
              {t("Vozač: {name}", { name: upcoming.ride.driver.name })}
            </span>
            <strong>{displayVehicleLabel(upcoming.ride.car)}</strong>
          </div>
        </div>
        <div className="upcoming-ride-pickup">
          <MapPin size={18} aria-hidden="true" />
          <div>
            <strong>
              <MeetingPointLabel point={pickup} demo={upcoming.ride.demo} />
            </strong>
            <span>
              {dateLabel(pickupDate)} · {t("Susret oko ")}
              {pickupTime}
            </span>
            {(upcoming.ride.demo || isDemoMeetingPoint(pickup)) && (
              <small className="meeting-point-warning">
                {t(
                  "Demo/test: izmišljena vožnja. Tačka nije provjerena za sigurno zaustavljanje.",
                )}
              </small>
            )}
          </div>
        </div>
      </div>
      <div className="upcoming-ride-actions">
        {ready ? (
          <p className="upcoming-ride-ready" role="status">
            <CheckCheck size={20} aria-hidden="true" />
            {t("Na mjestu si.")}
          </p>
        ) : (
          <Button variant="lime" busy={busy} onClick={confirmReady}>
            <MapPin size={20} aria-hidden="true" />
            {t("Na mjestu sam")}
          </Button>
        )}
        <a href={"#ride/" + upcoming.ride.id}>{t("Pogledaj vožnju")}</a>
      </div>
      <ErrorBox error={error} />
    </section>
  );
}
