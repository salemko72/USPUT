export type LocationFix = {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: number;
  receivedAt: number;
};
export type LiveLocationState = {
  available: boolean;
  opensAt: number;
  endsAt: number;
  serverNow: number;
  ownSharing: boolean;
  peerSharing: boolean;
  ownSharingId?: string;
  ownLocation: LocationFix | null;
  peerLocation: LocationFix | null;
};
export const GPS_SEND_INTERVAL = 15000;
export const GPS_FRESH_MS = 30000;
export const GPS_HIDE_MS = 90000;
export const getDevicePosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS nije dostupan u ovom pregledniku."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
  });
export function gpsError(error: unknown) {
  const code = (error as GeolocationPositionError)?.code;
  if (code === 1)
    return "Pristup lokaciji nije odobren. Dozvoli ga u postavkama preglednika.";
  if (code === 2) return "GPS signal trenutno nije dostupan.";
  if (code === 3)
    return "GPS nije odgovorio na vrijeme. Pokušaj ponovo na otvorenom.";
  return error instanceof Error
    ? error.message
    : "Dijeljenje lokacije trenutno nije dostupno.";
}
