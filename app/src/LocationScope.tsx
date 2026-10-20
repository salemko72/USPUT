import { useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { api } from "./api";
import { t } from "./i18n";
import { ErrorBox } from "./ui";
export type LocationScope = { city: string; lat?: number; lng?: number };
export function LocationScopeControl({
  scope,
  onChange,
}: {
  scope: LocationScope;
  onChange: (s: LocationScope) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  async function locate() {
    const ticket = ++generation.current;
    setError("");
    setBusy(true);
    try {
      if (!navigator.geolocation)
        throw Error(t("Lokacija nije dostupna. Upiši grad ručno."));
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 12000,
            maximumAge: 60000,
            enableHighAccuracy: false,
          }),
      );
      // Only approximate coordinates are sent to resolve a city. No tracking.
      const result = await api<LocationScope>("/locations/city", {
        lat: Math.round(position.coords.latitude * 1000) / 1000,
        lng: Math.round(position.coords.longitude * 1000) / 1000,
      });
      if (ticket === generation.current) onChange(result);
    } catch {
      if (ticket === generation.current)
        setError(
          "Lokacija nije dostupna ili grad nije prepoznat. Dozvoli lokaciju ili upiši grad ručno.",
        );
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  return (
    <div className="location-scope">
      <label className="field-label">
        {t("Grad za pretragu ulica")}
        <input
          value={scope.city}
          maxLength={80}
          autoComplete="address-level2"
          placeholder={t("Upiši grad ili mjesto")}
          onChange={(e) => {
            generation.current++;
            setBusy(false);
            setError("");
            onChange({ city: e.target.value });
          }}
        />
      </label>
      <button
        type="button"
        className="street-adjust"
        disabled={busy}
        onClick={locate}
      >
        <LocateFixed size={16} />
        {busy ? t("Tražimo tvoj grad…") : t("Koristi moju lokaciju")}
      </button>
      <small className="fine-print">
        {t(
          "Ulice tražimo u odabranom gradu. Lokacija telefona koristi se samo na tvoj zahtjev.",
        )}
      </small>
      <ErrorBox error={error} />
    </div>
  );
}
