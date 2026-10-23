import {
  createContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock3,
  Route,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { RouteMap, type MapInsets } from "./Map";
import { t } from "./i18n";
import { Button, Modal } from "./ui";
import { PinMap } from "./StreetPicker";
import { routeMidpoint } from "./route-midpoint";
import type { MeetingStop, Place, RouteViaPoint } from "./types";
import "./route-planner.css";

type MeetingPinDraft = {
  point: MeetingStop;
  index: number;
  confirm: (point: MeetingStop) => void;
};
export const MeetingPinContext = createContext<
  ((draft: MeetingPinDraft) => void) | null
>(null);

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
  stage,
  viaPoints,
  onViaChange,
  onEditShape,
  feedback,
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
  stage: "shape" | "stops";
  viaPoints: RouteViaPoint[];
  onViaChange: (points: RouteViaPoint[]) => void;
  onEditShape: () => void;
  feedback?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(
    () => window.matchMedia("(min-width: 900px)").matches,
  );
  const [insets, setInsets] = useState<MapInsets>();
  const [meetingDraft, setMeetingDraft] = useState<MeetingPinDraft | null>(
    null,
  );
  const [meetingMapReady, setMeetingMapReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<{ index: number; point: Place } | null>(
    null,
  );
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    setAdding(false);
    setEdit(null);
    setMeetingDraft(null);
    if (stage === "stops") setExpanded(true);
  }, [stage]);
  function moveVia(index: number, point: RouteViaPoint) {
    if (busy) return;
    const next = [...viaPoints];
    next[index] = point;
    onViaChange(next);
  }
  function openVia(index: number, point: RouteViaPoint) {
    setMapReady(false);
    setEdit({
      index,
      point: {
        ...point,
        id: `via_${index}`,
        name: t("Prolazna tačka"),
        detail: "",
        city: from.city,
      },
    });
  }
  function moveMeeting(point: RouteViaPoint) {
    setMeetingDraft((old) =>
      old
        ? {
            ...old,
            point: {
              ...old.point,
              ...point,
              id: `pin_${point.lat.toFixed(5)}_${point.lng.toFixed(5)}`,
              stopId: `stop_pin_${point.lat.toFixed(5)}_${point.lng.toFixed(5)}`,
              catalogId: undefined,
            },
          }
        : null,
    );
  }
  const duplicateMeeting =
    meetingDraft &&
    stops.some(
      (p, i) =>
        i !== meetingDraft.index &&
        Math.hypot(
          p.lat - meetingDraft.point.lat,
          p.lng - meetingDraft.point.lng,
        ) < 0.00001,
    );
  const root = useRef<HTMLElement>(null),
    panel = useRef<HTMLElement>(null),
    header = useRef<HTMLElement>(null),
    back = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose),
    locked = useRef(busy);
  close.current = onClose;
  locked.current = busy;
  function finishMeeting() {
    const index = meetingDraft?.index ?? -1;
    setMeetingDraft(null);
    setExpanded(true);
    requestAnimationFrame(() => {
      const buttons = Array.from(
        panel.current?.querySelectorAll<HTMLButtonElement>("button") || [],
      );
      const target =
        index < 0
          ? panel.current?.querySelector<HTMLButtonElement>(
              ".meeting-add-slot button",
            )
          : buttons.filter((button) =>
              button.textContent?.includes(t("Provjeri ili pomjeri pin")),
            )[index - 1];
      (target || back.current)?.focus({ preventScroll: true });
    });
  }
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
      data-planner-stage={stage}
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
          if (meetingDraft) {
            finishMeeting();
          } else if (!locked.current) close.current();
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
          stops={stage === "stops" ? stops : undefined}
          insets={insets}
          animated={false}
          viaPoints={viaPoints}
          meetingDraft={meetingDraft?.point}
          onMeetingMove={meetingDraft ? moveMeeting : undefined}
          onReady={setMeetingMapReady}
          onViaMove={stage === "shape" && !busy ? moveVia : undefined}
          onMapAdd={
            meetingDraft
              ? moveMeeting
              : stage === "shape" && adding && !busy
                ? (point) => {
                    if (viaPoints.length < 8)
                      onViaChange([...viaPoints, point]);
                    setAdding(false);
                  }
                : undefined
          }
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
          <span className="eyebrow">
            {t(stage === "shape" ? "1. Oblikuj trasu" : "2. Mjesta susreta")}
          </span>
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
              {stage === "shape" ? viaPoints.length : stops.length}
              <small>{t(stage === "shape" ? "prolazne" : "mjesta")}</small>
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
          {stage === "shape" && (
            <p className="route-shape-hint">
              {t("Povuci da promijeniš trasu")}.{" "}
              {t("Korekcija trase — nije mjesto susreta")}.
            </p>
          )}
          <button
            type="button"
            className="route-planner-expand"
            aria-expanded={expanded}
            aria-controls={id + "-editor"}
            disabled={busy || !!meetingDraft}
            onClick={() => setExpanded(!expanded)}
          >
            {t(
              expanded
                ? "Više mape"
                : stage === "shape"
                  ? "Uredi trasu"
                  : "Uredi mjesta susreta",
            )}
            {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
        <div
          className="route-planner-editor"
          id={id + "-editor"}
          hidden={!expanded}
        >
          <fieldset disabled={busy || !!meetingDraft}>
            {stage === "shape" ? (
              <div className="route-shape-editor">
                <p>
                  {t(
                    "Povuci bijelu tačku da promijeniš trasu. Proračun počinje kada je pustiš. Ovdje ne biraš mjesta susreta.",
                  )}
                </p>
                {viaPoints.length === 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      const p = routeMidpoint(route.coordinates);
                      if (p) openVia(0, p);
                    }}
                  >
                    {t("Pomjeri srednju tačku")}
                  </button>
                )}
                <ol>
                  {viaPoints.map((point, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => openVia(index, point)}
                      >
                        {t("Prolazna tačka")} {index + 1}
                      </button>
                      <button
                        type="button"
                        aria-label={t("Pomjeri prolaznu tačku gore")}
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...viaPoints];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          onViaChange(next);
                        }}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("Pomjeri prolaznu tačku dolje")}
                        disabled={index === viaPoints.length - 1}
                        onClick={() => {
                          const next = [...viaPoints];
                          [next[index + 1], next[index]] = [
                            next[index],
                            next[index + 1],
                          ];
                          onViaChange(next);
                        }}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("Ukloni prolaznu tačku")}
                        onClick={() =>
                          onViaChange(viaPoints.filter((_, i) => i !== index))
                        }
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ol>
                <Button
                  variant="outline"
                  disabled={viaPoints.length >= 8}
                  onClick={() => setAdding(!adding)}
                >
                  {t(adding ? "Odustani od dodavanja" : "Dodaj prolaznu tačku")}
                </Button>
                {adding && (
                  <p role="status">
                    {t(
                      "Klikni na kartu da dodaš prolaznu tačku. To nije mjesto susreta.",
                    )}
                  </p>
                )}
              </div>
            ) : (
              <>
                <button
                  className="text-button"
                  type="button"
                  onClick={onEditShape}
                >
                  {t("Nazad na oblikovanje trase")}
                </button>
                <MeetingPinContext.Provider
                  value={(draft) => {
                    setMeetingDraft(draft);
                    setExpanded(false);
                    requestAnimationFrame(() =>
                      panel.current
                        ?.querySelector<HTMLButtonElement>(
                          ".meeting-pin-actions .button",
                        )
                        ?.focus({ preventScroll: true }),
                    );
                  }}
                >
                  {children}
                </MeetingPinContext.Provider>
              </>
            )}
          </fieldset>
        </div>
        {feedback && <div className="route-planner-feedback">{feedback}</div>}
        <footer className="route-planner-footer">
          {meetingDraft ? (
            <div className="meeting-pin-actions">
              <p role="status">
                {t(
                  "Povuci zelenu tačku ili klikni na kartu, pa potvrdi mjesto susreta.",
                )}
              </p>
              {duplicateMeeting && (
                <p role="alert">
                  {t("Ta tačka je već na ruti. Pomjeri pin na drugo mjesto.")}
                </p>
              )}
              <Button
                disabled={!meetingMapReady || !!duplicateMeeting || busy}
                onClick={() => {
                  meetingDraft.confirm(meetingDraft.point);
                  finishMeeting();
                }}
              >
                {t("Potvrdi mjesto susreta")}
              </Button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  finishMeeting();
                }}
              >
                {t("Odustani")}
              </button>
            </div>
          ) : expanded || stage === "shape" ? (
            action
          ) : (
            <Button arrow onClick={() => setExpanded(true)}>
              {t("Pregledaj i potvrdi rutu")}
            </Button>
          )}
        </footer>
      </aside>
      {edit && (
        <Modal
          title={t("Korekcija trase — nije mjesto susreta")}
          onClose={() => setEdit(null)}
        >
          <PinMap
            point={edit.point}
            onReady={setMapReady}
            onChange={(point) => setEdit({ ...edit, point })}
          />
          <Button
            disabled={!mapReady}
            onClick={() => {
              const index = edit.index;
              moveVia(index, edit.point);
              setEdit(null);
              requestAnimationFrame(() => {
                const target =
                  panel.current?.querySelectorAll<HTMLButtonElement>(
                    ".route-shape-editor li .text-button",
                  )[index];
                (target || back.current)?.focus({ preventScroll: true });
              });
            }}
          >
            {t("Primijeni korekciju trase")}
          </Button>
        </Modal>
      )}
    </section>,
    document.body,
  );
}
