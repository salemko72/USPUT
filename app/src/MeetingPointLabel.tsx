import { useEffect, useState } from "react";
import { t } from "./i18n";
import type { Place } from "./types";
import "./meeting-point-label.css";

type MeetingPoint = Pick<Place, "lat" | "lng" | "name"> & {
  kind?: Place["kind"];
  stopId?: string;
  catalogId?: string;
  automaticName?: boolean;
};
type CachedAddress = { label: string | null; expires: number };
// Public reverse-street metadata only. Never retain point names, agreements,
// account data or authentication values, and never write this cache to storage.
const addresses = new Map<string, CachedAddress>();
const pending = new Map<string, Promise<string | null>>();
const capacity = 128;

function coordinates(point: Pick<Place, "lat" | "lng">) {
  return Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 85 &&
    Math.abs(point.lng) <= 180
    ? `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
    : null;
}
function cached(key: string) {
  const entry = addresses.get(key);
  if (entry && entry.expires > Date.now()) return entry.label;
  addresses.delete(key);
  return undefined;
}
function resolveAddress(key: string): Promise<string | null> {
  const hit = cached(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= capacity) return Promise.resolve(null);
  const [lat, lng] = key.split(",");
  const request = (async () => {
    let label: string | null = null;
    try {
      const response = await fetch(`/api/places/label?lat=${lat}&lng=${lng}`, {
        credentials: "same-origin",
      });
      if (response.ok) {
        const data = await response.json();
        if (
          data.approximate === true &&
          typeof data.label === "string" &&
          data.label.trim() &&
          data.label.length <= 220
        )
          label = data.label.trim();
      }
    } catch {
      // Keep the original pin reference when reverse geocoding is unavailable.
    }
    addresses.delete(key);
    addresses.set(key, {
      label,
      expires: Date.now() + (label ? 86400000 : 60000),
    });
    while (addresses.size > capacity)
      addresses.delete(addresses.keys().next().value!);
    pending.delete(key);
    return label;
  })();
  pending.set(key, request);
  return request;
}

export function useMeetingPointLabel(point: Pick<Place, "lat" | "lng">) {
  const key = coordinates(point);
  const [resolved, setResolved] = useState(() => ({
    key,
    label: key ? cached(key) : undefined,
  }));
  useEffect(() => {
    if (!key) return;
    let active = true;
    void resolveAddress(key).then((label) => {
      if (active) setResolved({ key, label });
    });
    return () => {
      active = false;
    };
  }, [key]);
  // A new point must never briefly show the previous point's street while its
  // request is pending. Only coordinates belonging to this render are used.
  const street =
    resolved.key === key ? resolved.label : key ? cached(key) : undefined;
  return {
    key,
    street,
    address:
      street ||
      t("Pin na karti ({coordinates})", {
        coordinates: key?.replace(",", ", ") || "—",
      }),
  };
}

export function isDemoMeetingPoint(point: Pick<Place, "name">) {
  return /^(?:demo|test)(?:\s|[—–:/-]|$)/i.test(point.name.trim());
}
function nickname(point: MeetingPoint, street: string | null | undefined) {
  const name = point.name.trim();
  if (
    isDemoMeetingPoint(point) ||
    point.kind === "area" ||
    point.automaticName ||
    /^(?:mjesto susreta|predložena tačka|pin(?: na karti)?|odabrana (?:tačka|lokacija)|približna lokacija|meeting point|selected (?:pin|location))/i.test(
      name,
    )
  )
    return "";
  return name !== street &&
    (point.catalogId || point.kind === "landmark" || point.stopId)
    ? name
    : "";
}

export function MeetingPointLabel({
  point,
  demo = false,
}: {
  point: MeetingPoint;
  demo?: boolean;
}) {
  const { key, street, address } = useMeetingPointLabel(point);
  const name = nickname(point, street);
  return (
    <span
      className="meeting-point-label"
      data-meeting-coordinates={key}
      title={
        street
          ? t("Približna ulica uz pin. Potvrdite gdje se može stati.")
          : undefined
      }
    >
      <span className="meeting-point-address">{address}</span>
      {name && <span className="meeting-point-nickname"> · {name}</span>}
      {(demo || isDemoMeetingPoint(point)) && (
        <span className="meeting-point-demo">{t("Demo / test")}</span>
      )}
    </span>
  );
}

// Native options need plain text, so share the coordinate lookup without placing
// markup inside an <option>. Demo context is shown beside the meeting address.
export function MeetingStopOption({
  point,
}: {
  point: MeetingPoint & { stopId: string };
}) {
  const { address, street } = useMeetingPointLabel(point);
  const name = nickname(point, street);
  return (
    <option value={point.stopId}>
      {address}
      {name ? ` · ${name}` : ""}
    </option>
  );
}
