import { languages, setLanguage, useLanguage } from "./i18n";
export function LanguageSwitch() {
  const language = useLanguage();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={language === "en" ? "Language" : "Jezik"}
    >
      {languages.map((item) => (
        <button
          key={item.id}
          type="button"
          lang={item.id === "bhs" ? "bs" : item.id}
          title={item.name}
          aria-label={item.name}
          aria-pressed={language === item.id}
          onClick={() => setLanguage(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
