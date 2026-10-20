import { t } from "./i18n";
import type { Service, User, Vehicle } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined
      ? { method: "POST", body: JSON.stringify(body) }
      : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new HttpError(
      response.status,
      t("Server trenutno nije dostupan. Pokušaj ponovo."),
    );
  }
  if (!response.ok)
    throw new HttpError(
      response.status,
      data.error || t("Nešto nije uspjelo."),
    );
  return data;
}
export const realService: Service = {
  vehicle: async () =>
    (await api<{ vehicle: Vehicle | null }>("/vehicle")).vehicle,
  saveVehicle: async (v) =>
    (await api<{ vehicle: Vehicle }>("/vehicle", v)).vehicle,
  places: async () =>
    (await api<{ places: Awaited<ReturnType<Service["places"]>> }>("/places"))
      .places,
  search: async (q) =>
    (
      await api<{ rides: Awaited<ReturnType<Service["search"]>> }>(
        "/rides?" + new URLSearchParams(q),
      )
    ).rides,
  ride: async (id, query) =>
    (
      await api<{ ride: Awaited<ReturnType<Service["ride"]>> }>(
        "/rides/" + id + (query ? "?" + new URLSearchParams(query) : ""),
      )
    ).ride,
  mine: () => api("/my-rides"),
  publish: async (q) =>
    (await api<{ ride: Awaited<ReturnType<Service["publish"]>> }>("/rides", q))
      .ride,
  request: async (id, query) =>
    (
      await api<{ booking: Awaited<ReturnType<Service["request"]>> }>(
        "/rides/" + id + "/request",
        query ? { search: query } : {},
      )
    ).booking,
  booking: async (id, action) => {
    await api("/bookings/" + id + "/" + action, {});
  },
  cancelRide: async (id) => {
    await api("/rides/" + id + "/cancel", {});
  },
  profile: async (name) =>
    (await api<{ user: User }>("/profile", { name })).user,
};
