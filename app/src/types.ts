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
  city?: string;
  admin?: boolean;
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
export type MeetingStop = Place & {
  automaticName?: boolean;
  stopId: string;
  travelSeconds?: number;
  catalogId?: string;
  approach?: string;
  side?: string;
};
export type RouteViaPoint = { lat: number; lng: number };
export type RouteMatch = {
  pickup: Place & { stopId?: string; catalogId?: string };
  dropoff: Place & { stopId?: string; catalogId?: string };
  fixedMeetingPoints?: boolean;
  pickupAt: number;
  extraMinutes: number;
  rideMinutes: number;
  source: "osrm" | "osrm-corridor";
  geometry?: number[][];
  walkToGeometry?: number[][];
  walkFromGeometry?: number[][];
  walkToMinutes?: number;
  walkFromMinutes?: number;
  walkingLimit?: number;
  provider?: string;
  score: number;
};
export type Ride = {
  demo?: boolean;
  routingUnavailable?: boolean;
  match?: RouteMatch | null;
  id: string;
  from: Place;
  to: Place;
  date: string;
  time: string;
  departure: number;
  car: string;
  note: string;
  seats: number;
  seatsAvailable: number;
  costSharing?: boolean;
  meetingStops?: MeetingStop[];
  geometry?: number[][];
  routeProvider?: string;
  routeViaPoints?: RouteViaPoint[];
  status: "open" | "matched" | "cancelled" | "completed";
  driver: User;
  createdAt: number;
};
export type Booking = {
  noShowReports?: {
    reporterId: string;
    reportedRole: "driver" | "passenger";
    createdAt: number;
  }[];
  match?: RouteMatch;
  id: string;
  status:
    "pending" | "accepted" | "declined" | "ready" | "cancelled" | "completed";
  passenger: User;
  ride: Ride;
};
export type Search = {
  from: string;
  to: string;
  date: string;
  time: string;
  fromLocation?: string;
  toLocation?: string;
  walkMinutes?: string;
  pickupStopId?: string;
  dropoffStopId?: string;
};
export type Offer = Search & {
  car: string;
  note: string;
  seats?: number;
  vehicleId?: string;
  routeConfirmed?: boolean;
  meetingStops?: MeetingStop[];
  previewToken?: string;
  routeViaPoints?: RouteViaPoint[];
  stopsConfirmed?: boolean;
  shareMeetingPoints?: boolean;
  costSharing?: boolean;
};
export type MyRides = { rides: Ride[]; bookings: Booking[] };
export type RideSearchResults = Ride[] & { routingUnavailable?: boolean };
export type Service = {
  vehicle: () => Promise<Vehicle | null>;
  saveVehicle: (v: VehicleInput) => Promise<Vehicle>;
  places: () => Promise<Place[]>;
  search: (q: Search) => Promise<RideSearchResults>;
  ride: (id: string, query?: Search) => Promise<Ride>;
  mine: () => Promise<MyRides>;
  publish: (q: Offer) => Promise<Ride>;
  request: (id: string, query?: Search) => Promise<Booking>;
  booking: (id: string, action: string) => Promise<void>;
  cancelRide: (id: string) => Promise<void>;
  profile: (name: string, city?: string) => Promise<User>;
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
  from: "",
  to: "",
  date: tomorrow(),
  time: "07:30",
});
export const dateLabel = (date: string) =>
  date === today()
    ? t("Danas")
    : date === tomorrow()
      ? t("Sutra")
      : date.split("-").reverse().join(".");

export function searchPlace(
  search: Search,
  which: "from" | "to",
  places: Place[],
): Place | undefined {
  const raw = which === "from" ? search.fromLocation : search.toLocation;
  if (raw) {
    try {
      const point = JSON.parse(raw);
      if (
        point &&
        typeof point.lat === "number" &&
        typeof point.lng === "number" &&
        typeof point.name === "string"
      )
        return point;
    } catch {}
  }
  return places.find((p) => p.id === search[which]);
}
