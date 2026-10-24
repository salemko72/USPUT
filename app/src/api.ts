import { t } from "./i18n";
import type { Service, User, Vehicle } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public existingRideId?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    signal,
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
      data.existingRideId,
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
  search: async (q) => {
    const r = await api<{
      rides: Awaited<ReturnType<Service["search"]>>;
      routingUnavailable?: boolean;
    }>("/rides/search", { ...q, meetingProposal: "1" });
    return Object.assign(r.rides, { routingUnavailable: r.routingUnavailable });
  },
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
  booking: async (id, action, details) => {
    await api("/bookings/" + id + "/" + action, details || {});
  },
  cancelRide: async (id) => {
    await api("/rides/" + id + "/cancel", {});
  },
  profile: async (name, city) =>
    (await api<{ user: User }>("/profile", { name, city })).user,
};
