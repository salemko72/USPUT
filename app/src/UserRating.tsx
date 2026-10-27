import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { api } from "./api";
import { t, locale, useLanguage } from "./i18n";
import "./user-rating.css";
type Score = { average: number | null; count: number };
type Reputation = { driver: Score; passenger: Score };
const cache = new Map<string, { value: Reputation; at: number }>();
const pending = new Map<string, Promise<Reputation>>();
let generation = 0;
export function refreshRatings() {
  generation++;
  cache.clear();
  pending.clear();
  window.dispatchEvent(new Event("usput:reviews-changed"));
}
function reputation(userId: string) {
  const saved = cache.get(userId);
  if (saved && Date.now() - saved.at < 30000)
    return Promise.resolve(saved.value);
  const running = pending.get(userId);
  if (running) return running;
  const version = generation;
  const request = api<Reputation>(
    `/users/${encodeURIComponent(userId)}/reputation`,
  )
    .then((value) => {
      if (version === generation) cache.set(userId, { value, at: Date.now() });
      return value;
    })
    .finally(() => {
      if (pending.get(userId) === request) pending.delete(userId);
    });
  pending.set(userId, request);
  return request;
}
export function UserRating({
  userId,
  role = "driver",
}: {
  userId: string;
  role?: "driver" | "passenger";
}) {
  useLanguage();
  const [state, setState] = useState<{ score?: Score; failed?: boolean }>({});
  useEffect(() => {
    let active = true,
      version = 0;
    setState({});
    const load = () => {
      const current = ++version;
      reputation(userId)
        .then((result) => {
          if (active && current === version) setState({ score: result[role] });
        })
        .catch(() => {
          if (active && current === version) setState({ failed: true });
        });
    };
    load();
    const interval = window.setInterval(load, 60000);
    const focus = () => {
      cache.delete(userId);
      load();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("usput:reviews-changed", load);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("usput:reviews-changed", load);
    };
  }, [userId, role]);
  const score = state.score;
  const average =
    score?.average == null
      ? null
      : new Intl.NumberFormat(locale(), {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(score.average);
  const label = state.failed
    ? t("Ocjene trenutno nisu dostupne.")
    : !score
      ? t("Učitavanje ocjena…")
      : !score.count
        ? t("Još nema ocjena")
        : t("Ocjena {average} od 5 · {count} ocjena", {
            average: average!,
            count: score.count,
          });
  return (
    <span
      className="user-rating"
      data-rating-role={role}
      aria-label={label}
      title={label}
    >
      <span className="rating-stars" aria-hidden="true">
        {Array.from({ length: score?.count ? 5 : 1 }, (_, i) => (
          <Star
            key={i}
            size={12}
            fill={
              score?.average != null && score.average >= i + 0.5
                ? "currentColor"
                : "none"
            }
          />
        ))}
      </span>
      <span>
        {score?.count && average ? (
          <>
            <b>{average}</b> <span>({score.count})</span>
          </>
        ) : (
          label
        )}
      </span>
    </span>
  );
}
