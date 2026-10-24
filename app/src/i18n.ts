import { useSyncExternalStore } from "react";
import english from "./locales/en.json";
import croatian from "./locales/hr.json";
import serbian from "./locales/sr-Latn.json";
import helpTranslations from "./help-translations.json";
import vehicleColorTranslations from "./vehicle-color-translations.json";
import liveLocationTranslations from "./live-location-translations.json";
import rideUpdatesTranslations from "./ride-updates-translations.json";
import routeShapeTranslations from "./route-shape-translations.json";
// Keep the legacy bhs storage value for existing Bosnian sessions.
export type Language = "bhs" | "sr-Latn" | "hr" | "en";
export const languages: {
  id: Language;
  label: string;
  name: string;
  locale: string;
}[] = [
  { id: "bhs", label: "BS", name: "Bosanski", locale: "bs-BA" },
  {
    id: "sr-Latn",
    label: "SR",
    name: "Srpski (latinica)",
    locale: "sr-Latn-RS",
  },
  { id: "hr", label: "HR", name: "Hrvatski", locale: "hr-HR" },
  { id: "en", label: "ENG", name: "English", locale: "en-GB" },
];
const key = "usput-language";
function initial(): Language {
  try {
    const saved = localStorage.getItem(key);
    return languages.find((l) => l.id === saved)?.id || "bhs";
  } catch {
    return "bhs";
  }
}
let language: Language = initial();
const listeners = new Set<() => void>();
function apply() {
  if (typeof document !== "undefined")
    document.documentElement.lang = language === "bhs" ? "bs" : language;
}
apply();
export function setLanguage(next: Language) {
  if (!languages.some((l) => l.id === next)) return;
  language = next;
  try {
    localStorage.setItem(key, next);
  } catch {
    /* Session-only language still works. */
  }
  apply();
  listeners.forEach((fn) => fn());
}
export function useLanguage() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => language,
    () => "bhs" as Language,
  );
}
export const locale = () => languages.find((l) => l.id === language)!.locale;
export function t(
  source: string,
  values: Record<string, string | number> = {},
): string {
  const normalized = source.replace(/\s+/g, " ").trim();
  const dictionary: Record<string, string> =
    language === "en"
      ? english
      : language === "hr"
        ? croatian
        : language === "sr-Latn"
          ? serbian
          : {};
  const extensions: Record<string, string>[] =
    language === "bhs"
      ? []
      : [
          helpTranslations[language],
          vehicleColorTranslations[language],
          routeShapeTranslations[language],
          rideUpdatesTranslations[language],
          liveLocationTranslations[language],
        ];
  const extension = extensions.find((entries) =>
    Object.hasOwn(entries, normalized),
  );
  const translated = extension
    ? extension[normalized]
    : Object.hasOwn(dictionary, normalized)
      ? dictionary[normalized]
      : undefined;
  let result =
    translated !== undefined
      ? (source.match(/^\s*/)?.[0] || "") +
        translated +
        (source.match(/\s*$/)?.[0] || "")
      : source;
  for (const [name, value] of Object.entries(values))
    result = result.replaceAll("{" + name + "}", String(value));
  return result;
}
