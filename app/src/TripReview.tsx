import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { api } from "./api";
import { t } from "./i18n";
import { Button, ErrorBox } from "./ui";
import { refreshRatings } from "./UserRating";
type ReviewState = {
  eligible: boolean;
  submittedStars: number | null;
  published: boolean;
  demo: boolean;
  reason: string | null;
  target: { id: string; name: string; role: "driver" | "passenger" };
  closesAt: number;
};
export function TripReview({ bookingId }: { bookingId: string }) {
  return <TripReviewForm key={bookingId} bookingId={bookingId} />;
}
function TripReviewForm({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<ReviewState | null>(null);
  const [stars, setStars] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      version = 0;
    const load = () => {
      const current = ++version;
      api<ReviewState>(`/bookings/${encodeURIComponent(bookingId)}/review`)
        .then((result) => {
          if (active && current === version) {
            setState(result);
            setError("");
          }
        })
        .catch((cause) => {
          if (active && current === version) setError(t(cause.message));
        });
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener("usput:reviews-changed", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
      window.removeEventListener("usput:reviews-changed", load);
    };
  }, [bookingId]);
  useEffect(() => {
    if (!state?.submittedStars || state.published) return;
    const interval = window.setInterval(
      () => window.dispatchEvent(new Event("usput:reviews-changed")),
      30000,
    );
    return () => window.clearInterval(interval);
  }, [state?.submittedStars, state?.published]);
  async function submit() {
    if (!stars || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<ReviewState>(
        `/bookings/${encodeURIComponent(bookingId)}/review`,
        { stars },
      );
      setState(result);
      refreshRatings();
    } catch (cause) {
      setError(t((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return error ? (
      <section className="trip-review">
        <ErrorBox error={error} />
      </section>
    ) : null;
  if (state.demo)
    return (
      <section className="trip-review">
        <p>{t("Demo vožnje ne ulaze u stvarne ocjene.")}</p>
      </section>
    );
  if (!state.eligible && !state.submittedStars) return null;
  return (
    <section className="trip-review" aria-label={t("Ocjena saputnika")}>
      <h3>
        {state.target.role === "driver"
          ? t("Ocijeni vozača")
          : t("Ocijeni putnika")}
        : {state.target.name}
      </h3>
      {state.submittedStars ? (
        <p role="status">
          {t("Tvoja ocjena: {stars}/5", { stars: state.submittedStars })} ·{" "}
          {state.published
            ? t("Ocjena je objavljena.")
            : t(
                "Ocjena je sačuvana. Objavljuje se kada oboje ocijenite ili nakon 14 dana.",
              )}
        </p>
      ) : (
        <>
          <div
            className="review-star-picker"
            role="group"
            aria-label={t("Odaberi ocjenu od 1 do 5 zvjezdica.")}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={t("{stars} od 5 zvjezdica", { stars: value })}
                aria-pressed={stars === value}
                disabled={busy}
                onClick={() => setStars(value)}
              >
                <Star
                  size={28}
                  fill={value <= stars ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          <p>
            {t(
              "Ocjena je konačna. Objavljuje se kada oboje ocijenite ili nakon 14 dana. Rok za ocjenjivanje je 14 dana od završetka.",
            )}
          </p>
          <Button
            variant="lime"
            busy={busy}
            disabled={!stars || busy}
            onClick={submit}
          >
            {t("Pošalji ocjenu")}
          </Button>
        </>
      )}
      <ErrorBox error={error} />
    </section>
  );
}
