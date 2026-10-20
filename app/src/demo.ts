import type { User, Ride, Booking, Service, Vehicle, Place } from "./types";
import { tomorrow } from "./types";
export const demoUser: User = {
  id: "demo-lejla",
  name: "Lejla H.",
  email: "lejla@primjer.test",
  provider: "demo",
};
const places: Place[] = [
  {
    id: "ilidza",
    name: "Ilidža",
    detail: "Tramvajski terminal",
    lat: 43.8293,
    lng: 18.3097,
  },
  {
    id: "nedzarici",
    name: "Nedžarići",
    detail: "Tramvajska stanica",
    lat: 43.8401,
    lng: 18.3445,
  },
  {
    id: "otoka",
    name: "Otoka",
    detail: "Kod tramvajske stanice",
    lat: 43.8485,
    lng: 18.3615,
  },
  {
    id: "cengic",
    name: "Čengić Vila",
    detail: "Kod tramvajske stanice",
    lat: 43.8507,
    lng: 18.373,
  },
  {
    id: "dolac",
    name: "Dolac Malta",
    detail: "Kod pošte",
    lat: 43.8526,
    lng: 18.3801,
  },
  {
    id: "pofalici",
    name: "Pofalići",
    detail: "Stanica kod poslovne zone",
    lat: 43.8557,
    lng: 18.3892,
  },
  {
    id: "grbavica",
    name: "Grbavica",
    detail: "Kod stadiona",
    lat: 43.8464,
    lng: 18.3874,
  },
  {
    id: "marijin",
    name: "Marijin Dvor",
    detail: "Kod tramvajske stanice",
    lat: 43.8553,
    lng: 18.4056,
  },
  {
    id: "skenderija",
    name: "Skenderija",
    detail: "Plato ispred centra",
    lat: 43.8531,
    lng: 18.4151,
  },
  {
    id: "centar",
    name: "Centar",
    detail: "Kod Velikog parka",
    lat: 43.8595,
    lng: 18.4189,
  },
];
type State = {
  vehicle?: Vehicle | null;
  user: User;
  rides: Ride[];
  bookings: Booking[];
  day: string;
};
function initial(): State {
  return {
    user: demoUser,
    day: tomorrow(),
    bookings: [],
    rides: [
      ["Amar K.", "07:30", "VW Golf · sivi"],
      ["Sara M.", "07:45", "Škoda Fabia · bijela"],
      ["Dino A.", "08:00", "Renault Clio · plavi"],
    ].map(([name, time, car], i) => ({
      id: "demo-" + i,
      from: places[3],
      to: places[7],
      date: tomorrow(),
      time,
      departure: Date.parse(tomorrow() + "T" + time + ":00+02:00"),
      car,
      note:
        i === 0
          ? "Bez pušenja. Malo muzike i dobar početak dana."
          : "Jedno slobodno mjesto. Vidimo se na stanici!",
      status: "open",
      driver: { id: "driver-" + i, name },
      createdAt: Date.now(),
    })),
  };
}
const KEY = "usput-pulse-demo-v1";
function load(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      raw?.day === tomorrow() &&
      Array.isArray(raw.rides) &&
      Array.isArray(raw.bookings) &&
      raw.user?.id === demoUser.id
    )
      return raw;
  } catch {}
  return initial();
}
let state = load();
function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
async function result<T>(value: T) {
  await new Promise((r) => setTimeout(r, 180));
  return structuredClone(value);
}
export const getDemoUser = () => state.user;
export const demoService: Service = {
  vehicle: () => result(state.vehicle || null),
  saveVehicle: async (v) => {
    state.vehicle = {
      ...v,
      id: state.vehicle?.id || crypto.randomUUID(),
      make: v.make || "Druga marka",
    };
    persist();
    return result(state.vehicle);
  },
  places: () => result(places),
  search: (q) =>
    result(
      state.rides.filter(
        (r) =>
          r.driver.id !== demoUser.id &&
          r.status === "open" &&
          r.from.id === q.from &&
          r.to.id === q.to &&
          r.date === q.date &&
          Math.abs(
            Number(r.time.slice(0, 2)) * 60 +
              Number(r.time.slice(3)) -
              (Number(q.time.slice(0, 2)) * 60 + Number(q.time.slice(3))),
          ) <= 60,
      ),
    ),
  ride: async (id) => {
    const r = state.rides.find((r) => r.id === id);
    if (!r) throw Error("Vožnja nije pronađena.");
    return result(r);
  },
  mine: () =>
    result({
      rides: state.rides.filter((r) => r.driver.id === demoUser.id),
      bookings: state.bookings.map((b) => ({
        ...b,
        ride: state.rides.find((r) => r.id === b.ride.id)!,
      })),
    }),
  publish: async (q) => {
    if (q.from === q.to) throw Error("Odaberi različita mjesta.");
    const r: Ride = {
      id: crypto.randomUUID(),
      from: places.find((p) => p.id === q.from)!,
      to: places.find((p) => p.id === q.to)!,
      date: q.date,
      time: q.time,
      departure: Date.parse(q.date + "T" + q.time + ":00+02:00"),
      car: q.car,
      note: q.note,
      status: "open",
      driver: state.user,
      createdAt: Date.now(),
    };
    state.rides.push(r);
    state.bookings.push({
      id: crypto.randomUUID(),
      status: "pending",
      passenger: { id: "demo-passenger", name: "Nina S." },
      ride: r,
    });
    persist();
    return result(r);
  },
  request: async (id) => {
    const ride = state.rides.find((r) => r.id === id)!;
    if (
      state.bookings.some(
        (b) => b.ride.id === id && b.passenger.id === demoUser.id,
      )
    )
      throw Error("Zahtjev je već poslan.");
    const b: Booking = {
      id: crypto.randomUUID(),
      status: "pending",
      passenger: state.user,
      ride,
    };
    state.bookings.push(b);
    persist();
    return result(b);
  },
  booking: async (id, action) => {
    const b = state.bookings.find((b) => b.id === id)!;
    const r = state.rides.find((r) => r.id === b.ride.id)!;
    b.status =
      action === "accept"
        ? "accepted"
        : action === "ready"
          ? "ready"
          : action === "complete"
            ? "completed"
            : action === "decline"
              ? "declined"
              : "cancelled";
    r.status =
      action === "accept" || action === "ready"
        ? "matched"
        : action === "complete"
          ? "completed"
          : "open";
    persist();
    await result(null);
  },
  cancelRide: async (id) => {
    state.rides.find((r) => r.id === id)!.status = "cancelled";
    state.bookings
      .filter((b) => b.ride.id === id)
      .forEach((b) => (b.status = "cancelled"));
    persist();
    await result(null);
  },
  profile: async (name) => {
    state.user = { ...state.user, name };
    persist();
    return result(state.user);
  },
};
export function resetDemo() {
  state = initial();
  persist();
}
