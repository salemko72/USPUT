import { useSyncExternalStore } from "react";
import english from "./locales/en.json";
export type Language = "bhs" | "en";
const key = "usput-language";
function initial(): Language {
  try {
    return localStorage.getItem(key) === "en" ? "en" : "bhs";
  } catch {
    return "bhs";
  }
}
let language: Language = initial();
const listeners = new Set<() => void>();
function apply() {
  if (typeof document !== "undefined")
    document.documentElement.lang = language === "en" ? "en" : "bs";
}
apply();
export function setLanguage(next: Language) {
  if (next !== "en" && next !== "bhs") return;
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
export const locale = () => (language === "en" ? "en-GB" : "bs-BA");
export function t(
  source: string,
  values: Record<string, string | number> = {},
): string {
  const normalized = source.replace(/\s+/g, " ").trim();
  const translated = Object.hasOwn(english, normalized)
    ? (english as Record<string, string>)[normalized]
    : undefined;
  let result =
    language === "en" && translated !== undefined
      ? (source.match(/^\s*/)?.[0] || "") +
        translated +
        (source.match(/\s*$/)?.[0] || "")
      : source;
  for (const [name, value] of Object.entries(values))
    result = result.replaceAll("{" + name + "}", String(value));
  return result;
}
