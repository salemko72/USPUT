import { useEffect, useState } from "react";
import type { Booking } from "./types";
import { t } from "./i18n";
import { Button, ErrorBox, Modal } from "./ui";
export function bookingLabel(booking: Booking, fallback: string) {
  const reports = booking.noShowReports || [];
  if (reports.length > 1) return t("Obje strane su prijavile nedolazak");
  if (reports.length)
    return t(
      reports[0].reportedRole === "driver"
        ? "Prijavljeno: vozač se nije pojavio"
        : "Prijavljeno: putnik se nije pojavio",
    );
  return t(fallback);
}
export function NoShowReport({
  booking,
  viewerId,
  onReport,
}: {
  booking: Booking;
  viewerId: string;
  onReport: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const reports = booking.noShowReports || [];
  const pickup = booking.match?.pickupAt || booking.ride.departure;
  const allowed =
    (["accepted", "ready"].includes(booking.status) ||
      (booking.status === "cancelled" && reports.length > 0)) &&
    now >= pickup + 10 * 60000 &&
    now <= pickup + 86400000 &&
    !reports.some((r) => r.reporterId === viewerId) &&
    [booking.ride.driver.id, booking.passenger.id].includes(viewerId);
  const title = t(
    viewerId === booking.ride.driver.id
      ? "Putnik se nije pojavio"
      : "Vozač se nije pojavio",
  );
  return (
    <div className="no-show-report">
      {reports.length > 0 && (
        <p role="status">
          {bookingLabel(booking, "")}.{" "}
          {t("Ovo je prijava učesnika, bez automatske kazne.")}
        </p>
      )}
      {allowed && (
        <button
          type="button"
          className="text-button"
          onClick={() => setOpen(true)}
        >
          {title}
        </button>
      )}
      {open && (
        <Modal
          title={title}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            {t(
              "Potvrdi da druga osoba nije došla na dogovoreno mjesto. Prijava ostaje zabilježena uz dogovor; druga strana može prijaviti svoju verziju.",
            )}
          </p>
          <ErrorBox error={error} />
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onReport();
                setOpen(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Potvrdi prijavu nedolaska")}
          </Button>
        </Modal>
      )}
    </div>
  );
}
