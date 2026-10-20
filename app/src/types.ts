export type VehicleInput = {
  makeId: string;
  make?: string;
  model: string;
  color: string;
  manualModel?: boolean;
};
export type Vehicle = VehicleInput & { id: string; make: string };
export type User = {
  id: string;
  name: string;
  email?: string;
  provider?: string;
};
export type Place = {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
};
export type Ride = {
  id: string;
  from: Place;
  to: Place;
  date: string;
  time: string;
  departure: number;
  car: string;
  note: string;
  status: "open" | "matched" | "cancelled" | "completed";
  driver: User;
  createdAt: number;
};
export type Booking = {
  id: string;
  status:
    "pending" | "accepted" | "declined" | "ready" | "cancelled" | "completed";
  passenger: User;
  ride: Ride;
};
export type Search = { from: string; to: string; date: string; time: string };
export type Offer = Search & { car: string; note: string; vehicleId?: string };
export type MyRides = { rides: Ride[]; bookings: Booking[] };
export type Service = {
  vehicle: () => Promise<Vehicle | null>;
  saveVehicle: (v: VehicleInput) => Promise<Vehicle>;
  places: () => Promise<Place[]>;
  search: (q: Search) => Promise<Ride[]>;
  ride: (id: string) => Promise<Ride>;
  mine: () => Promise<MyRides>;
  publish: (q: Offer) => Promise<Ride>;
  request: (id: string) => Promise<Booking>;
  booking: (id: string, action: string) => Promise<void>;
  cancelRide: (id: string) => Promise<void>;
  profile: (name: string) => Promise<User>;
};
export const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sarajevo",
  }).format(d);
};
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Sarajevo" }).format(
    new Date(),
  );
export const defaultSearch = (): Search => ({
  from: "cengic",
  to: "marijin",
  date: tomorrow(),
  time: "07:30",
});
export const dateLabel = (date: string) =>
  date === today()
    ? "Danas"
    : date === tomorrow()
      ? "Sutra"
      : new Intl.DateTimeFormat("bs-BA", {
          day: "numeric",
          month: "short",
        }).format(new Date(date + "T12:00:00"));
