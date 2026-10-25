import { t } from "./i18n";
import type { MatchAssessment } from "./types";
export const matchCategoryLabel = {
  fits: "Odgovara",
  maybe: "Možda ti odgovara",
  more: "Dodatna ponuda",
  unverified: "Podudaranje nije provjereno",
} as const;
export function MatchAssessmentNote({
  assessment,
}: {
  assessment?: MatchAssessment;
}) {
  if (!assessment) return null;
  const a = assessment,
    minutes = Math.ceil(Math.abs(a.timeOffsetSeconds) / 60);
  return (
    <div className={`match-assessment ${a.category}`}>
      <strong>{t(matchCategoryLabel[a.category])}</strong>
      {a.timeOffsetSeconds !== 0 && (
        <span>
          {t(
            a.timeOffsetSeconds > 0
              ? "Susret je {minutes} min kasnije od traženog vremena."
              : "Susret je {minutes} min ranije od traženog vremena.",
            { minutes },
          )}
        </span>
      )}
      {a.walkToMinutes > a.walkingLimit && (
        <span>
          {t("Do susreta: {minutes} min hoda; odabrano {limit} min.", {
            minutes: a.walkToMinutes,
            limit: a.walkingLimit,
          })}
        </span>
      )}
      {a.walkFromMinutes > a.walkingLimit && (
        <span>
          {t("Od izlaska do cilja: {minutes} min hoda; odabrano {limit} min.", {
            minutes: a.walkFromMinutes,
            limit: a.walkingLimit,
          })}
        </span>
      )}
    </div>
  );
}
