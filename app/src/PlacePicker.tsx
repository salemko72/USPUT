import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "./types";
import { t } from "./i18n";
const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "dj");
export function PlacePicker({
  label,
  value,
  places,
  onChange,
}: {
  label: string;
  value: string;
  places: Place[];
  onChange: (id: string) => void;
}) {
  const selected = places.find((p) => p.id === value);
  const [text, setText] = useState(selected?.name || ""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const editing = useRef(false);
  const input = useRef<HTMLInputElement>(null),
    id = useId();
  useEffect(() => {
    if (selected) setText(selected.name);
    else if (!editing.current) setText("");
    editing.current = false;
  }, [value, selected?.id, selected?.name]);
  const query = fold(text).replace("alfakovac", "alifakovac");
  const results = places.filter(
    (p) =>
      !query ||
      text === selected?.name ||
      fold(p.name + " " + (p.city || "")).includes(query),
  );
  const choose = (place: Place) => {
    onChange(place.id);
    setText(place.name);
    setOpen(false);
    input.current?.focus();
  };
  return (
    <div className="place-picker">
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={
          open && results[active] ? id + "-" + results[active].id : undefined
        }
        autoComplete="off"
        placeholder={t("Naselje, ulica ili orijentir")}
        value={text}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setText(e.target.value);
          editing.current = Boolean(value);
          onChange("");
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((n) =>
              Math.max(
                0,
                Math.min(
                  results.length - 1,
                  n + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (results[active]) choose(results[active]);
          }
        }}
      />
      {open && (
        <div
          id={id}
          role="listbox"
          aria-label={label + t(" — prijedlozi")}
          className="place-options"
        >
          {results.length ? (
            results.map((place, i) => (
              <div
                key={place.id}
                id={id + "-" + place.id}
                role="option"
                aria-label={place.name}
                aria-selected={place.id === value}
                className={i === active ? "highlighted" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(place)}
              >
                <strong>{place.name}</strong>
                <small>
                  {place.city || "Sarajevo"} ·{" "}
                  {t(
                    place.kind === "area"
                      ? "Područje naselja"
                      : place.kind === "landmark"
                        ? "Orijentir"
                        : "Probno mjesto susreta",
                  )}
                </small>
              </div>
            ))
          ) : (
            <p>
              {t(
                "Nema tog mjesta u beta katalogu. Pretraži drugo naselje ili orijentir.",
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
