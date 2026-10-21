import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Clock3, Route } from "lucide-react";
import { RouteMap, type MapInsets } from "./Map";
import { t } from "./i18n";
import { Button } from "./ui";
import type { MeetingStop, Place } from "./types";
import "./route-planner.css";

export function RoutePlanner({
  from,
  to,
  route,
  stops,
  busy,
  onClose,
  children,
  action,
  returnFocusTo,
}: {
  from: Place;
  to: Place;
  route: {
    coordinates: number[][];
    distance: number;
    duration: number;
    provider?: string;
  };
  stops: MeetingStop[];
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  action: ReactNode;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const [expanded, setExpanded] = useState(
    () => window.matchMedia("(min-width: 900px)").matches,
  );
  const [insets, setInsets] = useState<MapInsets>();
  const root = useRef<HTMLElement>(null),
    panel = useRef<HTMLElement>(null),
    header = useRef<HTMLElement>(null),
    back = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose),
    locked = useRef(busy);
  close.current = onClose;
  locked.current = busy;
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    back.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      const target = returnFocusTo?.current || previous;
      if (target instanceof HTMLElement && target.isConnected)
        target.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const measure = () => {
      if (!root.current || !panel.current || !header.current) return;
      const frame = root.current.getBoundingClientRect(),
        card = panel.current.getBoundingClientRect(),
        heading = header.current.getBoundingClientRect();
      const wide = frame.width >= 900;
      const next = {
        top: Math.ceil(heading.bottom - frame.top + 20),
        right: wide ? 40 : 24,
        left: wide ? Math.ceil(card.right - frame.left + 28) : 24,
        bottom: wide
          ? 40
          : Math.min(
              Math.ceil(frame.bottom - card.top + 20),
              Math.round(frame.height * 0.42),
            ),
      };
      setInsets((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    const observer = new ResizeObserver(measure);
    for (const element of [root.current, panel.current, header.current])
      if (element) observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return createPortal(
    <section
      ref={root}
      className="route-planner"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id + "-title"}
      style={
        {
          "--planner-bottom-inset": `${insets?.bottom || 300}px`,
        } as React.CSSProperties
      }
      onKeyDown={(event) => {
        if (
          (event.target as HTMLElement).closest('[role="dialog"]') !==
          root.current
        )
          return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!locked.current) close.current();
        }
        if (event.key === "Tab") {
          const focusable = Array.from(
            root.current!.querySelectorAll<HTMLElement>(
              "button,a[href],input,select,textarea,summary,[tabindex]",
            ),
          ).filter(
            (el) =>
              !el.matches(":disabled") &&
              el.tabIndex >= 0 &&
              el.offsetParent !== null,
          );
          const first = focusable[0],
            last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="route-planner-map">
        <RouteMap
          from={from}
          to={to}
          geometry={route.coordinates}
          provider={route.provider}
          stops={stops}
          insets={insets}
          animated={false}
        />
      </div>
      <header ref={header} className="route-planner-header">
        <button
          ref={back}
          type="button"
          className="route-planner-back"
          aria-label={t("Nazad na unos vožnje")}
          disabled={busy}
          onClick={onClose}
        >
          <ArrowLeft size={23} />
        </button>
        <div>
          <span className="eyebrow">{t("TVOJA RUTA. TVOJ DOGOVOR.")}</span>
          <h2 id={id + "-title"}>{t("Je li ovo ruta kojom stvarno voziš?")}</h2>
        </div>
      </header>
      <aside
        ref={panel}
        className="route-planner-panel"
        data-expanded={expanded}
      >
        <div className="route-planner-overview">
          <div className="route-planner-stats">
            <div>
              <Route size={18} />
              <span>
                <small>{t("Udaljenost")}</small>
                <strong>
                  {Math.round(route.distance / 100) / 10}
                  <small> km</small>
                </strong>
              </span>
            </div>
            <div>
              <Clock3 size={18} />
              <span>
                <small>{t("Trajanje")}</small>
                <strong>
                  {Math.ceil(route.duration / 60)}
                  <small> min</small>
                </strong>
              </span>
            </div>
            <span className="route-planner-stop-count">
              {stops.length}
              <small>{t("tačke")}</small>
            </span>
          </div>
          <div className="route-planner-endpoints">
            <strong>
              <i />
              {from.name}
            </strong>
            <strong>
              <i />
              {to.name}
            </strong>
          </div>
          <button
            type="button"
            className="route-planner-expand"
            aria-expanded={expanded}
            aria-controls={id + "-editor"}
            disabled={busy}
            onClick={() => setExpanded(!expanded)}
          >
            {t(expanded ? "Više mape" : "Uredi mjesta susreta")}
            {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
        <div
          className="route-planner-editor"
          id={id + "-editor"}
          hidden={!expanded}
        >
          <fieldset disabled={busy}>{children}</fieldset>
        </div>
        <footer className="route-planner-footer">
          {expanded ? (
            action
          ) : (
            <Button arrow onClick={() => setExpanded(true)}>
              {t("Pregledaj i potvrdi rutu")}
            </Button>
          )}
        </footer>
      </aside>
    </section>,
    document.body,
  );
}
