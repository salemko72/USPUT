import { t } from "./i18n";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Car,
  Check,
  ChevronDown,
  Plus,
  Search,
  Pencil,
  LoaderCircle,
} from "lucide-react";
import type { Service, Vehicle, VehicleInput } from "./types";
import { Button, ErrorBox, Modal } from "./ui";
type Brand = { id: string; name: string; models: string[] };
type Catalog = { brands: Brand[]; version: string };
const colors = [
  ["crna", "Crna", "#262a29"],
  ["bijela", "Bijela", "#fafafa"],
  ["siva", "Siva", "#858b8b"],
  ["srebrna", "Srebrna", "#c8cdd0"],
  ["plava", "Plava", "#3f6ca3"],
  ["crvena", "Crvena", "#b94743"],
  ["zelena", "Zelena", "#4e755b"],
  ["smedja", "Smeđa", "#866a50"],
  ["bez", "Bež", "#d7c7a4"],
  ["zuta", "Žuta", "#e8cf4c"],
  ["narandzasta", "Narandžasta", "#d88a44"],
  ["ljubicasta", "Ljubičasta", "#826a9b"],
  ["druga", "Druga", "#c1bcae"],
];
export const vehicleDescription = (v: Vehicle) =>
  `${v.make} ${v.model} · ${colors.find((c) => c[0] === v.color)?.[1] || v.color}`;
export function displayVehicleLabel(value: string) {
  const parts = value.split(" · ");
  if (parts.length < 2) return value;
  const color = parts.pop()!;
  return parts.join(" · ") + " · " + t(color);
}
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
let catalogPromise: Promise<Catalog> | undefined;
function loadCatalog() {
  if (!catalogPromise)
    catalogPromise = fetch("/vehicle-catalog.json")
      .then(async (r) => {
        if (!r.ok)
          throw Error(t("Katalog trenutno nije dostupan. Pokušaj ponovo."));
        return r.json();
      })
      .catch((e) => {
        catalogPromise = undefined;
        throw e;
      });
  return catalogPromise;
}
function SearchSelect({
  label,
  options,
  value,
  onSelect,
  placeholder,
  aliases = {},
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onSelect: (v: string) => void;
  placeholder: string;
  aliases?: Record<string, string>;
}) {
  const id = useId(),
    ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const selected = options.find((o) => o.value === value);
  useEffect(() => {
    setText(selected?.label || "");
    setActive(-1);
  }, [selected?.label, value]);
  const results = useMemo(() => {
    let term = fold(text);
    term = aliases[term] || term;
    if (selected && fold(selected.label) === term) term = "";
    return options
      .filter((o) => fold(o.label).includes(term))
      .sort(
        (a, b) =>
          Number(fold(b.label) === term) - Number(fold(a.label) === term),
      )
      .slice(0, 50);
  }, [text, options, selected, aliases]);
  function pick(v: string) {
    onSelect(v);
    setText(options.find((o) => o.value === v)?.label || "");
    setOpen(false);
    setActive(-1);
  }
  return (
    <div
      className="vehicle-combobox"
      ref={ref}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
          setText(selected?.label || "");
        }
      }}
    >
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="input-wrap">
        <Search size={17} />
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id + "-options"}
          aria-activedescendant={
            open && active >= 0 ? id + "-option-" + active : undefined
          }
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((x) => Math.min(x + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((x) => Math.max(x - 1, 0));
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (results[active < 0 ? 0 : active])
                pick(results[active < 0 ? 0 : active].value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setText(selected?.label || "");
            }
          }}
        />
        <ChevronDown size={16} />
      </div>
      {open && (
        <div
          id={id + "-options"}
          role="listbox"
          aria-label={label + t(" — prijedlozi")}
          className="vehicle-options"
        >
          {results.length ? (
            results.map((o, i) => (
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                id={id + "-option-" + i}
                key={o.value}
                className={active === i ? "highlighted" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o.value)}
              >
                {o.label}
                {o.value === value && <Check size={16} />}
              </button>
            ))
          ) : (
            <p>{t("Nema rezultata. Koristi ručni unos ispod polja.")}</p>
          )}
        </div>
      )}
    </div>
  );
}
function VehicleEditor({
  current,
  service,
  onSaved,
}: {
  current: Vehicle | null;
  service: Service;
  onSaved: (v: Vehicle) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [makeId, setMakeId] = useState(current?.makeId || ""),
    [make, setMake] = useState(current?.make || ""),
    [model, setModel] = useState(current?.model || ""),
    [manualModel, setManualModel] = useState(current?.manualModel || false),
    [color, setColor] = useState(current?.color || "");
  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((c) => {
        if (alive) {
          setCatalog(c);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [retry]);
  const brand = catalog?.brands.find((b) => b.id === makeId);
  const makeOptions = useMemo(
    () => catalog?.brands.map((b) => ({ value: b.id, label: b.name })) || [],
    [catalog],
  );
  const modelOptions = useMemo(
    () => brand?.models.map((m) => ({ value: m, label: m })) || [],
    [brand],
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError("");
    if (!makeId || !model.trim() || !color) {
      setError("Odaberi marku, model i boju vozila.");
      return;
    }
    setBusy(true);
    try {
      const value: VehicleInput = {
        makeId,
        make: brand?.name || make,
        model: model.trim(),
        color,
        manualModel: manualModel || makeId === "other",
      };
      const v = await service.saveVehicle(value);
      onSaved(v);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="vehicle-editor" onSubmit={save}>
      <p className="vehicle-intro">
        {t(" Da te saputnik lakše prepozna. Podatke možeš kasnije urediti. ")}
      </p>
      {!catalog ? (
        <>
          <ErrorBox error={error} />
          {error ? (
            <>
              <Button variant="outline" onClick={() => setRetry((r) => r + 1)}>
                {t(" Učitaj katalog ponovo ")}
              </Button>
              <Button
                onClick={() => {
                  setCatalog({ brands: [], version: "manual" });
                  setMakeId("other");
                  setModel("");
                  setManualModel(true);
                  setError("");
                }}
              >
                {t(" Unesi vozilo ručno ")}
              </Button>
            </>
          ) : (
            <div className="catalog-loading">
              <LoaderCircle className="spin" size={20} />
              {t(" Učitavamo marke i modele… ")}
            </div>
          )}
        </>
      ) : (
        <>
          {makeId === "other" ? (
            <label className="field-label">
              {t(" Naziv marke ")}
              <div className="input-wrap">
                <Car size={17} />
                <input
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  maxLength={80}
                  minLength={2}
                  required
                />
              </div>
            </label>
          ) : (
            <SearchSelect
              label={t("Marka vozila")}
              value={makeId}
              options={makeOptions}
              aliases={{ vw: "volkswagen", merc: "mercedesbenz" }}
              placeholder={t("Pretraži marku, npr. VW ili Škoda")}
              onSelect={(id) => {
                setMakeId(id);
                setMake("");
                setModel("");
                setManualModel(false);
              }}
            />
          )}
          <button
            type="button"
            className="catalog-fallback"
            onClick={() => {
              if (makeId === "other" && catalog?.version === "manual") {
                setCatalog(null);
                setRetry((x) => x + 1);
              }
              setMakeId(makeId === "other" ? "" : "other");
              setMake("");
              setModel("");
              setManualModel(false);
            }}
          >
            {makeId === "other"
              ? t("Vrati se na katalog marki")
              : t("Marka nije na listi")}
          </button>
          {makeId &&
            (manualModel || makeId === "other" ? (
              <label className="field-label">
                {t(" Naziv modela ")}
                <div className="input-wrap">
                  <Car size={17} />
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={t("npr. Golf")}
                    maxLength={80}
                    required
                  />
                </div>
              </label>
            ) : (
              <SearchSelect
                label={t("Model vozila")}
                value={model}
                options={modelOptions}
                placeholder={t("Pretraži model svog vozila")}
                onSelect={setModel}
              />
            ))}
          {makeId && makeId !== "other" && (
            <button
              type="button"
              className="catalog-fallback"
              onClick={() => {
                setManualModel(!manualModel);
                setModel("");
              }}
            >
              {manualModel
                ? t("Vrati se na katalog modela")
                : t("Model nije na listi")}
            </button>
          )}
          <fieldset className="vehicle-colors">
            <legend>{t("Boja vozila")}</legend>
            {colors.map(([id, name, hex]) => (
              <label key={id} className={id === color ? "selected" : ""}>
                <input
                  type="radio"
                  name="vehicle-color"
                  value={id}
                  checked={color === id}
                  onChange={() => setColor(id)}
                  required
                />
                <span className="color-swatch" style={{ background: hex }} />
                {t(name)}
                {id === color && <Check size={12} />}
              </label>
            ))}
          </fieldset>
          <ErrorBox error={error} />
          <Button variant="lime" busy={busy} type="submit">
            {t(" Sačuvaj vozilo ")}
          </Button>
          <p className="fine-print">
            {t(" Ne vidiš svoje vozilo? Ručni unos je uvijek dostupan.")}{" "}
            <a
              href="/vehicle-catalog-notices.txt"
              target="_blank"
              rel="noreferrer"
            >
              {t(" Izvori kataloga ")}
            </a>
          </p>
        </>
      )}
    </form>
  );
}
export function VehicleManager({
  service,
  onChange,
  compact = false,
}: {
  service: Service;
  onChange?: (v: Vehicle | null) => void;
  compact?: boolean;
}) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    service
      .vehicle()
      .then((v) => {
        if (active) {
          setVehicle(v);
          onChange?.(v);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [service, retry, onChange]);
  return (
    <section className={"vehicle-section " + (compact ? "compact" : "")}>
      <div className="vehicle-section-heading">
        <span className="eyebrow">
          {compact ? t("VOZILO ZA OVU PONUDU") : t("TVOJE VOZILO")}
        </span>
        <Car size={19} />
      </div>
      {loading ? (
        <div className="catalog-loading">
          <LoaderCircle className="spin" size={18} />
          {t(" Učitavamo vozilo… ")}
        </div>
      ) : error ? (
        <>
          <ErrorBox error={error} />
          <Button variant="outline" onClick={() => setRetry((x) => x + 1)}>
            {t(" Pokušaj ponovo ")}
          </Button>
        </>
      ) : vehicle ? (
        <div className="saved-vehicle">
          <span className="vehicle-car-icon">
            <Car size={33} strokeWidth={1.4} />
          </span>
          <div>
            <strong>
              {vehicle.make} {vehicle.model}
            </strong>
            <span>
              <i
                style={{
                  background: colors.find((c) => c[0] === vehicle.color)?.[2],
                }}
              />
              {t(
                colors.find((c) => c[0] === vehicle.color)?.[1] ||
                  vehicle.color,
              )}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={t("Uredi vozilo")}
            onClick={() => setEditing(true)}
          >
            <Pencil size={17} />
          </button>
        </div>
      ) : (
        <>
          <p>
            {t(
              " Voziš? Dodaj marku, model i boju jednom, pa ih koristi u svojim ponudama. ",
            )}
          </p>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Plus size={17} />
            {t(" Dodaj vozilo ")}
          </Button>
        </>
      )}
      {editing &&
        createPortal(
          <Modal
            title={
              vehicle ? t("Uredi svoje vozilo.") : t("S kojim autom dolaziš?")
            }
            onClose={() => setEditing(false)}
          >
            <VehicleEditor
              current={vehicle}
              service={service}
              onSaved={(v) => {
                setVehicle(v);
                onChange?.(v);
                setEditing(false);
              }}
            />
          </Modal>,
          document.body,
        )}
    </section>
  );
}
