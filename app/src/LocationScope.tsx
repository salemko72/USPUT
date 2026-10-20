import { t } from "./i18n";
export type LocationScope = { city: string; lat?: number; lng?: number };
export function LocationScopeControl({
  scope,
  onChange,
}: {
  scope: LocationScope;
  onChange: (s: LocationScope) => void;
}) {
  return (
    <div className="location-scope">
      <label className="field-label">
        {t("Grad za pretragu ulica")}
        <input
          value={scope.city}
          maxLength={80}
          autoComplete="address-level2"
          placeholder={t("Upiši grad ili mjesto")}
          onChange={(e) => onChange({ city: e.target.value })}
        />
      </label>
      <small className="fine-print">
        {t("Ulice tražimo u odabranom gradu. Grad možeš promijeniti ručno.")}
      </small>
    </div>
  );
}
