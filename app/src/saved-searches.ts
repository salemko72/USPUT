import type { Search } from "./types";

export type SavedPassengerQuery = Omit<Search, "date">;
export type SavedPassengerSearch = {
  id: string;
  query: SavedPassengerQuery;
  createdAt: number;
  updatedAt: number;
};
export const savedSearchesChanged = "usput-saved-searches-changed";

async function request<T>(
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Sačuvane pretrage trenutno nisu dostupne. Pokušaj ponovo.",
    );
  }
  if (!response.ok)
    throw new Error(
      data.error || "Sačuvane pretrage trenutno nisu dostupne. Pokušaj ponovo.",
    );
  return data;
}

export async function listPassengerSearches(
  signal?: AbortSignal,
): Promise<SavedPassengerSearch[]> {
  return (
    await request<{ searches: SavedPassengerSearch[] }>(
      "/saved-searches",
      "GET",
      undefined,
      signal,
    )
  ).searches;
}

export async function savePassengerSearch(query: Search): Promise<void> {
  const { from, to, fromLocation, toLocation, time, walkMinutes } = query;
  await request("/saved-searches", "POST", {
    query: { from, to, fromLocation, toLocation, time, walkMinutes },
  });
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(savedSearchesChanged));
}

export async function deletePassengerSearch(id: string): Promise<void> {
  await request("/saved-searches/" + encodeURIComponent(id), "DELETE");
}

export function restorePassengerSearch(
  query: SavedPassengerQuery,
  now = new Date(),
): Search {
  return {
    ...query,
    date: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Sarajevo",
    }).format(now),
  };
}

export function savedSearchEndpointName(
  query: SavedPassengerQuery,
  which: "from" | "to",
): string {
  try {
    const raw = which === "from" ? query.fromLocation : query.toLocation;
    const point = JSON.parse(raw || "null");
    if (typeof point?.name === "string" && point.name.trim()) return point.name;
  } catch {}
  return query[which];
}
