import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, Footprints, Plus, X } from "lucide-react";
import { t } from "./i18n";
import type { Search } from "./types";
import { dateLabel } from "./types";
import { DatePicker } from "./DatePicker";
import {
  deletePassengerSearch,
  listPassengerSearches,
  restorePassengerSearch,
  savedSearchEndpointName,
  savedSearchesChanged,
  type SavedPassengerSearch,
} from "./saved-searches";
import "./saved-searches.css";

export function SavedSearches({
  onNew,
  onLoad,
  selectedDate,
  onDateChange,
}: {
  onNew: () => void;
  onLoad: (query: Search) => void;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
}) {
  const [searches, setSearches] = useState<SavedPassengerSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(savedSearchesChanged, refresh);
    return () => window.removeEventListener(savedSearchesChanged, refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listPassengerSearches(controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setSearches(rows);
        setError("");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setSearches([]);
        setError((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  async function remove(id: string) {
    setRemoving((current) => new Set(current).add(id));
    setError("");
    try {
      await deletePassengerSearch(id);
      setSearches((current) => current.filter((search) => search.id !== id));
      setRevision((value) => value + 1);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <section
      className="saved-searches"
      aria-label={t("Tvoje svakodnevne pretrage")}
    >
      <div className="saved-searches-heading">
        <h3>{t("Tvoj svakodnevni put")}</h3>
        <p>{t("Pretrage se automatski čuvaju. Odaberi rutu i datum.")}</p>
      </div>
      {selectedDate && onDateChange && (
        <div className="saved-search-date">
          <span>{t("Datum vožnje")}</span>
          <DatePicker value={selectedDate} onChange={onDateChange} />
        </div>
      )}
      <div className="saved-searches-grid">
        <button className="saved-search-new" type="button" onClick={onNew}>
          <span className="saved-search-plus">
            <Plus size={23} aria-hidden="true" />
          </span>
          <strong>{t("Nova vožnja")}</strong>
          <small>{t("Odaberi drugu rutu")}</small>
        </button>
        {searches.map((search) => {
          const from = savedSearchEndpointName(search.query, "from");
          const to = savedSearchEndpointName(search.query, "to");
          const busy = removing.has(search.id);
          return (
            <article className="saved-search-card" key={search.id}>
              <button
                className="saved-search-load"
                type="button"
                aria-label={t("Učitaj pretragu {from} — {to}", { from, to })}
                disabled={busy}
                onClick={() =>
                  onLoad(
                    restorePassengerSearch(
                      search.query,
                      new Date(),
                      selectedDate,
                    ),
                  )
                }
              >
                <span className="saved-search-route">
                  <span>
                    <i className="saved-search-origin" />
                    <strong title={from}>{from}</strong>
                  </span>
                  <span>
                    <i className="saved-search-destination" />
                    <strong title={to}>{to}</strong>
                  </span>
                </span>
                <span className="saved-search-details">
                  <span>
                    <Clock3 size={14} aria-hidden="true" />
                    {search.query.time}
                  </span>
                  <span>
                    <Footprints size={14} aria-hidden="true" />
                    {t("{minutes} min hoda", {
                      minutes: search.query.walkMinutes || "",
                    })}
                  </span>
                </span>
                <span className="saved-search-today">
                  {selectedDate ? dateLabel(selectedDate) : t("Za danas")}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </span>
              </button>
              <button
                className="saved-search-remove"
                type="button"
                disabled={busy}
                aria-label={t("Ukloni pretragu {from} — {to}", { from, to })}
                onClick={(event) => {
                  event.stopPropagation();
                  void remove(search.id);
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
      {loading && (
        <p className="saved-searches-status" role="status">
          {t("Učitavanje sačuvanih pretraga…")}
        </p>
      )}
      {error && (
        <p className="saved-searches-error" role="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}
