import { UserRating } from "./UserRating";
import { useEffect, useState } from "react";
import { api } from "./api";
import { RouteMap } from "./Map";
import { Button, ErrorBox } from "./ui";
import { t } from "./i18n";
import type { Booking, Place, RouteViaPoint, Service } from "./types";
type Message = {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
};
export function BookingDiscussion({
  booking: b,
  viewerId,
  service,
  onRefresh,
}: {
  booking: Booking;
  viewerId: string;
  service: Service;
  onRefresh: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [pin, setPin] = useState<Place>();
  const active =
    ["pending", "accepted", "ready"].includes(b.status) &&
    ["open", "matched"].includes(b.ride.status) &&
    Date.now() < b.ride.departure + 86400000;
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      api<{ messages: Message[] }>("/bookings/" + b.id + "/messages")
        .then((r) => {
          if (alive) setMessages(r.messages);
        })
        .catch(() => {});
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
      setMessages([]);
    };
  }, [b.id]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onRefresh();
      window.dispatchEvent(new Event("usput:booking-changed"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function move(p: RouteViaPoint) {
    setPin({
      ...p,
      id: `pin_${p.lat}_${p.lng}`,
      name: t("Predloženi ulazak"),
      detail: "",
      city: b.ride.from.city || "",
    });
  }
  const own = b.proposal?.authorId === viewerId;
  return (
    <section className="booking-discussion">
      {b.proposal && b.status === "pending" && (
        <div>
          <p>
            {t(
              own
                ? "Čekamo potvrdu druge osobe za ovaj pin."
                : "Druga osoba predlaže mjesto susreta. Pregledaj pin prije potvrde.",
            )}
          </p>
          {viewerId === b.passenger.id && !own && (
            <Button
              variant="lime"
              busy={busy}
              onClick={() =>
                run(() =>
                  service.booking(b.id, "confirm-meeting", {
                    expectedVersion: b.proposal!.version,
                  }),
                )
              }
            >
              {t("Potvrdi predloženi susret")}
            </Button>
          )}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setPin(b.match?.pickup);
              setEditing(!editing);
            }}
          >
            {t("Predloži drugi ulazak na mapi")}
          </button>
          {editing && b.match && (
            <div>
              <RouteMap
                animated={false}
                from={b.ride.from}
                to={b.ride.to}
                geometry={b.ride.geometry}
                meetingDraft={pin || b.match.pickup}
                focusPoint={b.match.pickup}
                onMeetingMove={move}
                onMapAdd={move}
              />
              <Button
                variant="lime"
                busy={busy}
                onClick={() =>
                  run(async () => {
                    await api("/bookings/" + b.id + "/meeting-proposal", {
                      expectedVersion: b.proposal!.version,
                      pickupLocation: pin || b.match!.pickup,
                    });
                    setEditing(false);
                  })
                }
              >
                {t("Pošalji prijedlog mjesta")}
              </Button>
            </div>
          )}
        </div>
      )}
      <h3>{t("Dogovor o susretu")}</h3>
      <p className="discussion-peer-rating">
        <strong>
          {viewerId === b.ride.driver.id
            ? b.passenger.name
            : b.ride.driver.name}
        </strong>{" "}
        <UserRating
          userId={
            viewerId === b.ride.driver.id ? b.passenger.id : b.ride.driver.id
          }
          role={viewerId === b.ride.driver.id ? "passenger" : "driver"}
        />
      </p>
      <p className="fine-print">
        {t("Poruka ne mijenja dogovoreni pin i nije potvrda vožnje.")}
      </p>
      <ol className="booking-messages" aria-label={t("Poruke uz vožnju")}>
        {messages.map((m) => (
          <li key={m.id} className={m.senderId === viewerId ? "mine" : ""}>
            <strong>
              {m.senderId === viewerId
                ? t("Ti")
                : m.senderId === b.ride.driver.id
                  ? b.ride.driver.name
                  : b.passenger.name}
            </strong>
            <p>{m.text}</p>
            <time>
              {new Date(m.createdAt).toLocaleTimeString("bs-BA", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Sarajevo",
              })}
            </time>
          </li>
        ))}
      </ol>
      {active && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/bookings/" + b.id + "/messages", { text });
              setText("");
              const r = await api<{ messages: Message[] }>(
                "/bookings/" + b.id + "/messages",
              );
              setMessages(r.messages);
            });
          }}
        >
          <label>
            {t("Kratka poruka")}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={280}
              placeholder={t("Npr. Mogu sići do tramvajske.")}
              disabled={busy}
            />
          </label>
          <Button
            variant="lime"
            busy={busy}
            disabled={!text.trim() || messages.length >= 100}
            type="submit"
          >
            {t("Pošalji poruku")}
          </Button>
        </form>
      )}
      <ErrorBox error={error} />
    </section>
  );
}
