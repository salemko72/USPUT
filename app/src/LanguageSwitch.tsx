import { setLanguage, useLanguage } from "./i18n";
export function LanguageSwitch() {
  const language = useLanguage();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={language === "en" ? "Language" : "Jezik"}
    >
      <button
        type="button"
        lang="bs"
        aria-pressed={language === "bhs"}
        onClick={() => setLanguage("bhs")}
      >
        BHS
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        ENG
      </button>
    </div>
  );
}
