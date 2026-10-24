import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Car, ZoomIn } from "lucide-react";
import { getRidePhotos } from "./photo-client";
import type { PhotoMeta } from "./photo-client";
import type { Booking, Ride } from "./types";
import { displayVehicleLabel } from "./VehicleManager";
import { Modal } from "./ui";
import { DemoImage, hasDemoImage } from "./DemoImage";
import { api } from "./api";
import { t } from "./i18n";
import "./ride-vehicle-photo.css";

export function RideVehiclePhoto({
  ride,
  viewerId,
  bookingStatus,
  offer = false,
  compact = false,
}: {
  ride: Ride;
  viewerId?: string;
  offer?: boolean;
  compact?: boolean;
  bookingStatus?: Booking["status"];
}) {
  const permitted =
    (offer &&
      (ride.driver.id === viewerId ||
        (["open", "matched"].includes(ride.status) &&
          ride.departure > Date.now()))) ||
    (ride.driver.id !== viewerId &&
      (bookingStatus === "accepted" || bookingStatus === "ready") &&
      (ride.status === "open" || ride.status === "matched") &&
      ride.departure > Date.now() - 86400000);
  // Scope the loaded image and open preview to this account and agreement.
  // A cancelled booking or account change hides it during render, before cleanup.
  const scope = JSON.stringify([
    viewerId,
    ride.id,
    ride.car,
    bookingStatus,
    ride.status,
    permitted,
    offer,
  ]);
  const [loaded, setLoaded] = useState<{
    scope: string;
    photo: PhotoMeta | null;
  }>();
  const [zoom, setZoom] = useState<{ scope: string; id: string }>();
  useEffect(() => {
    if (!permitted) return;
    let alive = true,
      version = 0,
      controller: AbortController | undefined;
    const refresh = () => {
      const current = ++version;
      controller?.abort();
      controller = new AbortController();
      (offer
        ? api<{ vehicle: PhotoMeta | null }>("/photos/offer/" + ride.id)
        : getRidePhotos(ride.id, controller.signal)
      )
        .then((photos) => {
          if (alive && current === version)
            setLoaded({ scope, photo: photos.vehicle });
        })
        .catch(() => {
          if (alive && current === version) setLoaded({ scope, photo: null });
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("usput:booking-changed", refresh);
    return () => {
      alive = false;
      controller?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("usput:booking-changed", refresh);
    };
  }, [scope, permitted, ride.id]);
  const photo = permitted && loaded?.scope === scope ? loaded.photo : null;
  const label = displayVehicleLabel(ride.car);
  const unavailable = t("Fotografija automobila nije dostupna.");
  function failed() {
    setLoaded((current) =>
      current?.scope === scope ? { scope, photo: null } : current,
    );
    setZoom((current) => (current?.scope === scope ? undefined : current));
  }
  if (ride.demo && hasDemoImage(ride.driver.id))
    return (
      <span className="ride-vehicle-thumb">
        <DemoImage userId={ride.driver.id} car />
      </span>
    );
  if (!photo)
    return (
      <span
        className="ride-vehicle-thumb is-empty"
        role="img"
        aria-label={unavailable}
        title={label + ". " + unavailable}
      >
        <Car size={25} aria-hidden="true" />
      </span>
    );
  if (compact)
    return (
      <span className="ride-vehicle-thumb">
        <img
          src={photo.url}
          alt={t("Automobil za ovu vožnju")}
          loading="lazy"
          decoding="async"
          onError={failed}
        />
      </span>
    );
  return (
    <>
      <button
        type="button"
        className="ride-vehicle-thumb"
        aria-label={t("Povećaj fotografiju automobila")}
        title={label}
        onClick={() => setZoom({ scope, id: photo.id })}
      >
        <img
          src={photo.url}
          alt={t("Automobil za dogovorenu vožnju")}
          loading="lazy"
          decoding="async"
          onError={failed}
        />
        <span className="vehicle-thumb-zoom" aria-hidden="true">
          <ZoomIn size={10} />
        </span>
      </button>
      {zoom?.scope === scope &&
        zoom.id === photo.id &&
        createPortal(
          <Modal
            title={t("Za lakši susret.")}
            onClose={() => setZoom(undefined)}
          >
            <img
              className="photo-zoom"
              src={photo.url}
              alt={t("Automobil za dogovorenu vožnju")}
              onError={failed}
            />
            <p className="vehicle-photo-caption">{label}</p>
          </Modal>,
          document.body,
        )}
    </>
  );
}
