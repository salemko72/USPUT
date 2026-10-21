/* Push delivery only: private API responses and pages are never cached. */
"use strict";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

function eventId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

async function ownedNotification(id) {
  if (!eventId(id)) return null;
  try {
    const response = await fetch(
      new URL(
        "/api/notifications/" + encodeURIComponent(id),
        self.location.origin,
      ),
      { credentials: "include", cache: "no-store" },
    );
    if (!response.ok) return null;
    const { notification } = await response.json();
    return notification &&
      notification.id === id &&
      notification.type === "booking-accepted" &&
      eventId(notification.rideId)
      ? notification
      : null;
  } catch {
    return null;
  }
}

function rideUrl(rideId) {
  const url = new URL("/", self.location.origin);
  url.hash = "ride/" + encodeURIComponent(rideId);
  return url;
}

async function refreshWindows() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if (new URL(client.url).origin === self.location.origin)
      client.postMessage({ type: "usput:notifications-changed" });
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {
        return;
      }
      if (payload?.type !== "booking-accepted" || !eventId(payload.id)) return;
      // A queued push may belong to an earlier account on this device. The cookie
      // must still own an active event before an acceptance is shown.
      const notification = await ownedNotification(payload.id);
      if (!notification) return;
      const english =
        payload.language === "en" ||
        payload.title === "Your request has been accepted" ||
        payload.title === "Your request was accepted";
      await self.registration.showNotification(
        english
          ? "Your request has been accepted"
          : payload.language === "sr-Latn"
            ? "Vaš zahtev je prihvaćen"
            : "Vaš zahtjev je prihvaćen",
        {
          body: english
            ? "Open USPUT for your ride details."
            : "Otvori USPUT za detalje vožnje.",
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          tag: "usput-booking-accepted:" + notification.id,
          renotify: false,
          data: {
            id: notification.id,
            rideId: notification.rideId,
            url: rideUrl(notification.rideId).href,
          },
        },
      );
      await refreshWindows();
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      // Revalidate ownership and status on click as well; notification data and
      // payload URLs are never navigation authority.
      const notification = await ownedNotification(event.notification.data?.id);
      if (!notification) return;
      const target = rideUrl(notification.rideId);
      if (target.origin !== self.location.origin) return;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      if (existing) {
        const navigated = await existing.navigate(target.href);
        await (navigated || existing).focus();
      } else await self.clients.openWindow(target.href);
    })(),
  );
});
