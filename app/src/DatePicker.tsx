import { t, locale } from "./i18n";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { today } from "./types";

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parse = (value: string) => new Date(`${value}T12:00:00`);
const display = (value: string) => value.split("-").reverse().join(".");

export function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [focused, setFocused] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const minimum = today();
  const first = parse(`${month}-01`);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
      ?.focus();
  }, [open, focused, month]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const moveMonth = (delta: number) => {
    const date = new Date(first.getFullYear(), first.getMonth() + delta, 1, 12);
    setMonth(iso(date).slice(0, 7));
    setFocused(iso(date) < minimum ? minimum : iso(date));
  };
  return (
    <div
      ref={root}
      className="date-picker"
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="date-picker-trigger"
        aria-label={t("Datum polaska: {date}", { date: display(value) })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setMonth(value.slice(0, 7));
          setFocused(value < minimum ? minimum : value);
          setOpen(!open);
        }}
      >
        <CalendarDays size={18} />
        <span>{display(value)}</span>
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={t("Odaberi datum polaska")}
          className="calendar-panel"
        >
          <div className="calendar-heading">
            <button
              type="button"
              aria-label={t("Prethodni mjesec")}
              disabled={month <= minimum.slice(0, 7)}
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <strong aria-live="polite">
              {first.toLocaleDateString(locale(), {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button
              type="button"
              aria-label={t("Sljedeći mjesec")}
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-weekdays">
            {[
              t("Pon"),
              t("Uto"),
              t("Sri"),
              t("Čet"),
              t("Pet"),
              t("Sub"),
              t("Ned"),
            ].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  type="button"
                  key={date}
                  data-date={date}
                  aria-label={display(date)}
                  aria-pressed={value === date}
                  aria-current={date === minimum ? "date" : undefined}
                  disabled={date < minimum}
                  tabIndex={focused === date ? 0 : -1}
                  onClick={() => {
                    onChange(date);
                    close();
                  }}
                  onKeyDown={(event) => {
                    const delta = (
                      {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                      } as Record<string, number>
                    )[event.key];
                    if (delta !== undefined) {
                      event.preventDefault();
                      const next = parse(date);
                      next.setDate(next.getDate() + delta);
                      const nextValue = iso(next);
                      if (nextValue >= minimum) {
                        setFocused(nextValue);
                        setMonth(nextValue.slice(0, 7));
                      }
                    }
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p>{t("dd.MM.yyyy · Sedmica počinje ponedjeljkom")}</p>
        </div>
      )}
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLSelectElement>("select")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      ref={root}
      className="date-picker time-picker"
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="date-picker-trigger"
        aria-label={t("Vrijeme polaska: {time}", { time: value })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Clock3 size={18} />
        <span>{value}</span>
      </button>
      {open && (
        <div
          className="calendar-panel time-panel"
          id={id}
          role="dialog"
          aria-label={t("Odaberi vrijeme polaska")}
        >
          <div className="time-selects">
            <label>
              {t(" Sat ")}
              <select
                aria-label={t("Sat polaska")}
                value={value.slice(0, 2)}
                onChange={(event) =>
                  onChange(`${event.target.value}:${value.slice(3)}`)
                }
              >
                {Array.from({ length: 24 }, (_, i) =>
                  String(i).padStart(2, "0"),
                ).map((hour) => (
                  <option key={hour}>{hour}</option>
                ))}
              </select>
            </label>
            <span>:</span>
            <label>
              {t(" Minuta ")}
              <select
                aria-label={t("Minuta polaska")}
                value={value.slice(3)}
                onChange={(event) =>
                  onChange(`${value.slice(0, 2)}:${event.target.value}`)
                }
              >
                {Array.from({ length: 60 }, (_, i) =>
                  String(i).padStart(2, "0"),
                ).map((minute) => (
                  <option key={minute}>{minute}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="time-confirm" onClick={close}>
            {t(" Potvrdi vrijeme ")}
          </button>
          <p>{t("24-satni format (00–23)")}</p>
        </div>
      )}
    </div>
  );
}
