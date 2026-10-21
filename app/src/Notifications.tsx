import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Bell, BellOff, Check, ThumbsUp, X } from "lucide-react";
import { t, useLanguage } from "./i18n";
import { Button, Modal } from "./ui";
import "./notifications.css";

type AcceptedNotification = {
  id: string;
  bookingId: string;
  rideId: string;
  type: "booking-accepted";
  createdAt: number;
  driverName: string;
  date: string;
  time: string;
};
type PushConfig = { enabled: boolean; publicKey: string | null };
type PushPhase =
  | "checking"
  | "unsupported"
  | "install"
  | "unavailable"
  | "denied"
  | "pending"
  | "inactive"
  | "active"
  | "error";

async function notificationApi<T>(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  expectedUserId?: string,
): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "include",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("usput:auth-changed"));
    throw Object.assign(new Error("Notification request failed"), {
      status: response.status,
    });
  }
  const data = await response.json();
  if (expectedUserId && data.userId !== expectedUserId) {
    window.dispatchEvent(new Event("usput:auth-changed"));
    throw Object.assign(new Error("Notification account changed"), {
      status: 409,
    });
  }
  return data as T;
}

let workerRegistration: Promise<ServiceWorkerRegistration> | undefined;
function registerWorker() {
  if (!workerRegistration) {
    workerRegistration = navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .catch((error) => {
        workerRegistration = undefined;
        throw error;
      });
  }
  return workerRegistration;
}

function pushSupport(): "supported" | "unsupported" | "install" {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const version = navigator.userAgent.match(/OS (\d+)[_\.](\d+)/);
  if (
    ios &&
    version &&
    (Number(version[1]) < 16 ||
      (Number(version[1]) === 16 && Number(version[2]) < 4))
  )
    return "unsupported";
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !installed) return "install";
  return window.isSecureContext &&
    "serviceWorker" in navigator &&
    typeof PushManager !== "undefined" &&
    typeof Notification !== "undefined"
    ? "supported"
    : "unsupported";
}

function publicKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const raw = atob(key.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function matchingKey(subscription: PushSubscription, key: string) {
  const existing = subscription.options.applicationServerKey;
  if (!existing) return false;
  const expected = publicKeyBytes(key);
  const actual = new Uint8Array(existing);
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function usePushNotifications(userId: string) {
  function ownedApi<T>(path: string, signal: AbortSignal, body?: unknown) {
    return notificationApi<T>(path, signal, body, userId);
  }
  const language = useLanguage();
  const currentLanguage = useRef(language);
  currentLanguage.current = language;
  const [phase, setPhase] = useState<PushPhase>("checking");
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  const serial = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const config = useRef<PushConfig | null>(null);
  const working = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      serial.current++;
      controller.current?.abort();
    };
  }, [userId]);

  const inspect = useCallback(async () => {
    if (working.current) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const token = ++serial.current;
    const current = () => alive.current && serial.current === token;
    const support = pushSupport();
    if (support !== "supported") {
      setPhase(support);
      return;
    }
    try {
      const settings = await ownedApi<PushConfig>(
        "/push/config",
        request.signal,
      );
      if (!current()) return;
      config.current = settings;
      if (!settings.enabled || !settings.publicKey) {
        setPhase("unavailable");
        return;
      }
      const registration = await registerWorker();
      if (!current()) return;
      const subscription = await registration.pushManager.getSubscription();
      if (!current()) return;
      if (Notification.permission === "denied") setPhase("denied");
      else if (Notification.permission !== "granted") setPhase("pending");
      else if (!subscription || !matchingKey(subscription, settings.publicKey))
        setPhase("inactive");
      else {
        // Rebind an existing browser permission to the current session and language.
        // This path never asks for permission or creates a new subscription.
        await ownedApi("/push/subscribe", request.signal, {
          subscription: subscription.toJSON(),
          language: currentLanguage.current,
        });
        if (current()) setPhase("active");
      }
    } catch {
      if (current()) setPhase("error");
    }
  }, [userId]);

  useEffect(() => {
    void inspect();
  }, [inspect, language]);

  useEffect(() => {
    const visible = () => {
      if (!document.hidden) void inspect();
    };
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.current?.abort();
      serial.current++;
      window.removeEventListener("focus", visible);
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [inspect]);

  async function enable() {
    if (working.current || pushSupport() !== "supported") return;
    if (!config.current?.enabled || !config.current.publicKey) return;
    // Keep the permission call inside the user's click, before any async work.
    const permission =
      Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
    working.current = true;
    setBusy(true);
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const token = ++serial.current;
    const current = () => alive.current && serial.current === token;
    let boundLanguage = currentLanguage.current;
    let bound = false;
    try {
      const granted = await permission;
      if (!current()) return;
      if (granted !== "granted") {
        setPhase(granted === "denied" ? "denied" : "pending");
        return;
      }
      const registration = await registerWorker();
      if (!current()) return;
      let subscription = await registration.pushManager.getSubscription();
      if (!current()) return;
      if (
        subscription &&
        !matchingKey(subscription, config.current.publicKey)
      ) {
        await ownedApi("/push/unsubscribe", request.signal, {
          endpoint: subscription.endpoint,
        });
        if (!current()) return;
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!current()) return;
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKeyBytes(config.current.publicKey),
      });
      if (!current()) return;
      boundLanguage = currentLanguage.current;
      await ownedApi("/push/subscribe", request.signal, {
        subscription: subscription.toJSON(),
        language: boundLanguage,
      });
      bound = true;
      if (current()) setPhase("active");
    } catch {
      if (current())
        setPhase(Notification.permission === "denied" ? "denied" : "error");
    } finally {
      working.current = false;
      if (current()) {
        setBusy(false);
        if (bound && boundLanguage !== currentLanguage.current) void inspect();
      }
    }
  }

  async function disable() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const token = ++serial.current;
    const current = () => alive.current && serial.current === token;
    try {
      const registration = await registerWorker();
      if (!current()) return;
      const subscription = await registration.pushManager.getSubscription();
      if (!current()) return;
      if (subscription) {
        await ownedApi("/push/unsubscribe", request.signal, {
          endpoint: subscription.endpoint,
        });
        if (!current()) return;
        if (!(await subscription.unsubscribe()))
          throw new Error("Unsubscribe failed");
      }
      if (current()) setPhase("inactive");
    } catch {
      if (current()) setPhase("error");
    } finally {
      working.current = false;
      if (current()) {
        setBusy(false);
      }
    }
  }

  return { phase, busy, enable, disable, retry: inspect };
}

const PushContext = createContext<ReturnType<
  typeof usePushNotifications
> | null>(null);

function phaseLabel(phase: PushPhase) {
  switch (phase) {
    case "active":
      return t("Obavijesti su uključene");
    case "checking":
      return t("Provjeravam postavke obavijesti…");
    case "denied":
      return t("Obavijesti su blokirane u pregledniku");
    case "unsupported":
      return t("Ovaj preglednik ne podržava push obavijesti");
    case "install":
      return t("Prvo dodaj USPUT na početni ekran");
    case "unavailable":
      return t("Push obavijesti trenutno nisu dostupne");
    case "error":
      return t("Provjera obavijesti nije uspjela");
    case "pending":
      return t("Čeka se tvoja dozvola");
    default:
      return t("Obavijesti su isključene");
  }
}

export function NotificationSettings() {
  const push = useContext(PushContext);
  const [open, setOpen] = useState(false);
  if (!push) return null;
  const { phase, busy } = push;
  return (
    <>
      <button
        type="button"
        className="settings-row notification-settings-row"
        onClick={() => setOpen(true)}
      >
        <Bell size={22} aria-hidden="true" />
        <span>
          <strong>{t("Obavijesti")}</strong>
          <small>{phaseLabel(phase)}</small>
        </span>
        <ArrowUpRight size={20} aria-hidden="true" />
      </button>
      {open && (
        <Modal title={t("Obavijesti")} onClose={() => setOpen(false)}>
          <div className="push-settings">
            <span className="push-settings-icon" aria-hidden="true">
              {phase === "active" ? <Bell size={28} /> : <BellOff size={28} />}
            </span>
            <h3 role="status">{phaseLabel(phase)}</h3>
            <p>
              {t(
                "Saznaj kada vozač prihvati tvoj zahtjev, i kada je aplikacija zatvorena.",
              )}
            </p>
            {phase === "install" ? (
              <>
                <p>
                  {t(
                    "Na iPhoneu i iPadu potreban je iOS 16.4 ili noviji i USPUT na početnom ekranu.",
                  )}
                </p>
                <ol className="push-install-steps">
                  <li>{t("Otvori USPUT u Safariju i dodirni Dijeli.")}</li>
                  <li>{t("Odaberi Dodaj na početni ekran.")}</li>
                  <li>
                    {t(
                      "Otvori USPUT s početnog ekrana, pa ovdje uključi obavijesti.",
                    )}
                  </li>
                </ol>
              </>
            ) : phase === "denied" ? (
              <p>
                {t(
                  "Dozvolu možeš promijeniti u postavkama preglednika za USPUT. Zatim se vrati ovdje.",
                )}
              </p>
            ) : phase === "unsupported" ? (
              <p>
                {t(
                  "Koristi noviji preglednik. Na iPhoneu i iPadu potreban je iOS 16.4 ili noviji.",
                )}
              </p>
            ) : phase === "active" ? (
              <p className="push-active-note">
                <Check size={16} aria-hidden="true" />
                {t("Uključene za ovaj uređaj i ovaj račun.")}
              </p>
            ) : phase === "unavailable" ? (
              <p>
                {t(
                  "Pokušaj ponovo kasnije. Obavijest u aplikaciji ostaje dostupna.",
                )}
              </p>
            ) : phase === "pending" ? (
              <p>
                {t(
                  "Preglednik će tražiti dozvolu tek kada dodirneš dugme ispod.",
                )}
              </p>
            ) : phase === "error" ? (
              <p>{t("Provjeri vezu i pokušaj ponovo.")}</p>
            ) : null}
            {(phase === "pending" || phase === "inactive") && (
              <Button
                variant="lime"
                busy={busy}
                onClick={() => void push.enable()}
              >
                <Bell size={18} />
                {t("Uključi obavijesti")}
              </Button>
            )}
            {phase === "active" && (
              <Button busy={busy} onClick={() => void push.disable()}>
                {t("Isključi obavijesti")}
              </Button>
            )}
            {(phase === "error" ||
              phase === "denied" ||
              phase === "unavailable") && (
              <Button busy={busy} onClick={() => void push.retry()}>
                {t("Pokušaj ponovo")}
              </Button>
            )}
            <p className="push-privacy-note">
              {t(
                "Obavijest na zaključanom ekranu ne sadrži adrese ni privatne pinove.",
              )}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

function AcceptedPopup({
  event,
  onClose,
}: {
  event: AcceptedNotification;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const previousInert = shell?.inert;
    const previousOverflow = document.body.style.overflow;
    if (shell) shell.inert = true;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === "Tab") {
        const buttons =
          dialog.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keys, true);
    return () => {
      document.removeEventListener("keydown", keys, true);
      if (shell) shell.inert = previousInert ?? false;
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  return createPortal(
    <div
      className="notification-shade"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className="notification-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="accepted-notification-title"
        aria-describedby="accepted-notification-body"
      >
        <button
          type="button"
          className="icon-button notification-popup-close"
          onClick={onClose}
          aria-label={t("Zatvori")}
        >
          <X size={20} />
        </button>
        <span className="notification-thumb" aria-hidden="true">
          <ThumbsUp size={42} strokeWidth={2.4} />
        </span>
        <span className="notification-eyebrow">{t("DOBAR DOGOVOR")}</span>
        <h2 id="accepted-notification-title">
          {t("Vaš zahtjev je prihvaćen")}
        </h2>
        <p id="accepted-notification-body">
          {t("{name} je potvrdio tvoju vožnju. Sretan put!", {
            name: event.driverName,
          })}
        </p>
        <Button
          variant="lime"
          onClick={() => {
            onClose();
            window.location.hash = "ride/" + encodeURIComponent(event.rideId);
          }}
        >
          {t("Pogledaj vožnju")}
          <ArrowUpRight size={19} />
        </Button>
      </section>
    </div>,
    document.body,
  );
}

function validEvent(value: AcceptedNotification) {
  return (
    value &&
    value.type === "booking-accepted" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.rideId === "string" &&
    value.rideId.length > 0 &&
    typeof value.driverName === "string"
  );
}

export function Notifications({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  useLanguage();
  const push = usePushNotifications(userId);
  const [popup, setPopup] = useState<AcceptedNotification | null>(null);
  const activePopup = useRef<AcceptedNotification | null>(null);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    let polling = false;
    let claimedWhileHidden: AcceptedNotification | null = null;
    const controller = new AbortController();
    const received = new Set<string>();
    const handled = new Set<string>();
    activePopup.current = null;
    setPopup(null);
    const current = () => alive && !controller.signal.aborted;
    const ownedApi = <T,>(path: string, body?: unknown) =>
      notificationApi<T>(path, controller.signal, body, userId);
    const present = async (event: AcceptedNotification) => {
      const result = await ownedApi<{ notification: AcceptedNotification }>(
        "/notifications/" + encodeURIComponent(event.id),
      );
      if (!current()) return;
      if (!validEvent(result.notification)) {
        claimedWhileHidden = null;
        return;
      }
      if (document.hidden) {
        claimedWhileHidden = result.notification;
        return;
      }
      claimedWhileHidden = null;
      activePopup.current = result.notification;
      setPopup(result.notification);
    };
    const poll = async () => {
      if (!current() || polling || document.hidden) return;
      polling = true;
      try {
        if (claimedWhileHidden && !activePopup.current) {
          await present(claimedWhileHidden);
          return;
        }
        const result = await ownedApi<{
          notifications: AcceptedNotification[];
        }>("/notifications");
        if (!current()) return;
        const events = Array.isArray(result.notifications)
          ? result.notifications.filter(validEvent)
          : [];
        for (const event of events) {
          if (!received.has(event.id)) {
            received.add(event.id);
            window.dispatchEvent(new CustomEvent("usput:booking-changed"));
          }
        }
        if (activePopup.current || document.hidden) return;
        for (const event of events) {
          if (!current() || document.hidden) return;
          if (handled.has(event.id)) continue;
          // The server's atomic claim coordinates all tabs. Hidden documents do
          // not claim events; if visibility changes in flight, keep the result.
          const result = await ownedApi<{ claimed: boolean }>(
            "/notifications/" + encodeURIComponent(event.id) + "/seen",
            {},
          );
          if (!current()) return;
          handled.add(event.id);
          if (!result.claimed) continue;
          claimedWhileHidden = event;
          if (!document.hidden) await present(event);
          break;
        }
      } catch (cause) {
        if (
          [401, 404, 409].includes((cause as { status?: number }).status || 0)
        ) {
          claimedWhileHidden = null;
          activePopup.current = null;
          if (current()) setPopup(null);
        }
        // The durable inbox retries on the next poll, focus, or reconnect.
      } finally {
        polling = false;
      }
    };
    const update = () => void poll();
    const workerMessage = (event: MessageEvent) => {
      if (event.data?.type === "usput:notifications-changed") update();
    };
    refresh.current = update;
    update();
    const interval = window.setInterval(update, 5000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    navigator.serviceWorker?.addEventListener("message", workerMessage);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
    };
  }, [userId]);

  return (
    <PushContext.Provider value={push}>
      {children}
      {popup && (
        <AcceptedPopup
          event={popup}
          onClose={() => {
            activePopup.current = null;
            setPopup(null);
            refresh.current();
          }}
        />
      )}
    </PushContext.Provider>
  );
}
