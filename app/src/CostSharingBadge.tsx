import { t } from "./i18n";

export function CostSharingBadge({ shared = false }: { shared?: boolean }) {
  const answer = t(shared ? "Da" : "Ne");
  return (
    <span className="cost-sharing-status">
      <span>{t("Dijeljenje troškova")}:</span>
      <strong
        className={`cost-sharing-badge ${shared ? "cost-sharing-yes" : "cost-sharing-no"}`}
        aria-label={answer}
      >
        {answer.toLocaleUpperCase()}
      </strong>
    </span>
  );
}
