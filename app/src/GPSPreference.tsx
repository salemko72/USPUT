import { MapPin } from "lucide-react";
import { useState } from "react";
import { t } from "./i18n";
import { getDevicePosition, gpsError } from "./live-location-client";
import { ErrorBox } from "./ui";
export function GPSPreference({
  enabled,
  onChange,
  unknown = false,
}: {
  enabled: boolean;
  onChange: (value: boolean) => Promise<void>;
  unknown?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [decided, setDecided] = useState(false);
  async function change(value: boolean) {
    setBusy(true);
    setError("");
    try {
      // Explicit setup gesture obtains browser permission. Discard this fix.
      if (value) await getDevicePosition();
      await onChange(value);
      setDecided(true);
    } catch (e) {
      setError(gpsError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="gps-preference">
      <h3>
        <MapPin size={18} />
        {t("GPS tokom susreta")}
      </h3>
      <p>
        <strong>
          {t(
            "Preporučujemo GPS da se lakše pronađete na mjestu susreta. Uključivanje je dobrovoljno.",
          )}
        </strong>
      </p>
      {unknown && !decided && !enabled && (
        <p>
          {t(
            "Odaberi želiš li automatsko GPS dijeljenje tokom dogovorene vožnje.",
          )}
        </p>
      )}
      {unknown && !decided && !enabled ? (
        <div className="gps-preference-actions">
          <button
            type="button"
            className="button lime"
            disabled={busy}
            onClick={() => void change(true)}
          >
            {t("Uključi GPS")}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void change(false)}
          >
            {t("Ne želim automatsko dijeljenje")}
          </button>
        </div>
      ) : (
        <label>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => void change(e.target.checked)}
          />
          <span>{t("Automatski dijeli GPS tokom dogovorene vožnje")}</span>
        </label>
      )}
      <p>
        {t(
          "GPS pomaže da se lakše pronađete. Lokacija se dijeli samo s osobom s kojom imaš dogovorenu vožnju — od 5 minuta prije susreta do završetka vožnje. Nakon završetka automatski se gasi. Uključivanje je dobrovoljno.",
        )}
      </p>
      <small>
        {t(
          "Dozvola preglednika traži se sada; trenutna lokacija se ne šalje niti čuva. Dijeljenje radi dok je aplikacija otvorena i nastavlja se kada se vratiš.",
        )}
      </small>
      {busy && <p role="status">{t("Čekamo GPS dozvolu…")}</p>}
      <ErrorBox error={error} />
    </section>
  );
}
