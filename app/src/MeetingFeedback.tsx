import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { api } from "./api";
import { t } from "./i18n";
import type { Booking } from "./types";
import { ErrorBox } from "./ui";

export function MeetingFeedback({ booking }: { booking: Booking }) {
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const points = [booking.match?.pickup, booking.match?.dropoff].filter(
    (p, i, all) =>
      p?.catalogId && all.findIndex((x) => x?.catalogId === p.catalogId) === i,
  );
  if (booking.status !== "completed" || !points.length) return null;
  async function vote(id: string, rating: number) {
    setBusy(id);
    setError("");
    try {
      await api(`/meeting-points/${encodeURIComponent(id)}/feedback`, {
        bookingId: booking.id,
        rating,
      });
      setVotes((old) => ({ ...old, [id]: rating }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="meeting-point-feedback">
      <h3>{t("Kako su se pokazala mjesta susreta?")}</h3>
      <p>
        {t(
          "Tvoje iskustvo pomaže uređivanju gradske baze. Ocjena nije potvrda da je zaustavljanje dozvoljeno.",
        )}
      </p>
      {points.map((p) => (
        <div key={p!.catalogId}>
          <strong>{p!.name}</strong>
          <div>
            <button
              type="button"
              disabled={!!busy}
              aria-pressed={votes[p!.catalogId!] === 1}
              onClick={() => vote(p!.catalogId!, 1)}
            >
              <ThumbsUp size={15} />
              {t("Dobro mjesto")}
            </button>
            <button
              type="button"
              disabled={!!busy}
              aria-pressed={votes[p!.catalogId!] === -1}
              onClick={() => vote(p!.catalogId!, -1)}
            >
              <ThumbsDown size={15} />
              {t("Bilo je poteškoća")}
            </button>
          </div>
          {votes[p!.catalogId!] && (
            <small role="status">
              {t("Ocjena je sačuvana. Možeš je promijeniti.")}
            </small>
          )}
        </div>
      ))}
      <ErrorBox error={error} />
    </section>
  );
}
