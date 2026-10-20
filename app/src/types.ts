import { t } from "./i18n";
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
  city?: string;
  countryCode?: string;
  kind?: "area" | "landmark";
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
};
export type RouteMatch = {
  pickup: Place;
  dropoff: Place;
  pickupAt: number;
  extraMinutes: number;
  rideMinutes: number;
  source: "osrm";
  score: number;
};
export type Ride = {
  match?: RouteMatch | null;
  id: string;
  from: Place;
  to: Place;
  date: string;
  time: string;
  departure: number;
  car: string;
  note: string;
  costSharing?: boolean;
  status: "open" | "matched" | "cancelled" | "completed";
  driver: User;
  createdAt: number;
};
export type Booking = {
  match?: RouteMatch;
  id: string;
  status:
    "pending" | "accepted" | "declined" | "ready" | "cancelled" | "completed";
  passenger: User;
  ride: Ride;
};
export type Search = { from: string; to: string; date: string; time: string };
export type Offer = Search & {
  car: string;
  note: string;
  vehicleId?: string;
  costSharing?: boolean;
};
export type MyRides = { rides: Ride[]; bookings: Booking[] };
export type Service = {
  vehicle: () => Promise<Vehicle | null>;
  saveVehicle: (v: VehicleInput) => Promise<Vehicle>;
  places: () => Promise<Place[]>;
  search: (q: Search) => Promise<Ride[]>;
  ride: (id: string, query?: Search) => Promise<Ride>;
  mine: () => Promise<MyRides>;
  publish: (q: Offer) => Promise<Ride>;
  request: (id: string, query?: Search) => Promise<Booking>;
  booking: (id: string, action: string) => Promise<void>;
  cancelRide: (id: string) => Promise<void>;
  profile: (name: string) => Promise<User>;
};
export const tomorrow = () => {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
    ? t("Danas")
    : date === tomorrow()
      ? t("Sutra")
      : date.split("-").reverse().join(".");
