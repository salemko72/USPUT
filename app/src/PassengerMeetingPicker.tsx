import { useState } from "react";
import { RouteMap } from "./Map";
import { t } from "./i18n";
import type { Place, Ride, Search, RouteViaPoint } from "./types";
export function PassengerMeetingPicker({
  ride,
  query,
  onChange,
}: {
  ride: Ride;
  query: Search;
  onChange: (q: Partial<Search>) => void;
}) {
  const [mode, setMode] = useState<"pickup" | "dropoff">("pickup");
  const [draft, setDraft] = useState<{ pickup?: Place; dropoff?: Place }>({});
  const pickup = draft.pickup || ride.match?.pickup || ride.from;
  const dropoff = draft.dropoff || ride.match?.dropoff || ride.to;
  const selected = mode === "pickup" ? pickup : dropoff;
  function move(p: RouteViaPoint) {
    const point = {
      ...p,
      id: `pin_${p.lat}_${p.lng}`,
      name: t(mode === "pickup" ? "Predloženi ulazak" : "Predloženi izlazak"),
      city: ride.from.city || "",
      detail: "",
    };
    setDraft((old) => ({ ...old, [mode]: point }));
    onChange({
      [mode === "pickup" ? "pickupLocation" : "dropoffLocation"]:
        JSON.stringify(point),
      meetingProposal: "1",
    });
  }
  return (
    <div className="passenger-meeting-picker">
      <RouteMap
        animated={false}
        from={ride.from}
        to={ride.to}
        geometry={ride.geometry}
        provider={ride.routeProvider}
        focusPoint={selected}
        meetingDraft={selected}
        onMeetingMove={move}
        onMapAdd={move}
        large
      />
      <div className="passenger-map-controls">
        <button
          type="button"
          className={"small-pill " + (mode === "pickup" ? "active" : "")}
          onClick={() => setMode("pickup")}
        >
          {t("Ulazak na mapi")}
        </button>
        <details
          onToggle={(event) =>
            setMode(event.currentTarget.open ? "dropoff" : "pickup")
          }
        >
          <summary>{t("Dodaj mjesto izlaska (opcionalno)")}</summary>
          <p>
            {t(
              "Izlazak možeš dogovoriti s vozačem. Ako želiš, pomjeri i njegov pin na mapi.",
            )}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => setMode("dropoff")}
          >
            {t("Uredi izlazak na mapi")}
          </button>
        </details>
        <p>
          {t(
            "Povuci zelenu tačku ili klikni uz trasu. Vozač mora potvrditi predloženo mjesto ulaska.",
          )}
        </p>
      </div>
    </div>
  );
}
