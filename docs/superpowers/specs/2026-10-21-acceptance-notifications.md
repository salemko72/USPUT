# Acceptance notifications

The passenger must notice a genuine accepted request anywhere in USPUT, and on
an opted-in phone even after the app is closed. The accepted avatar outline
pulses, the thumbs-up moves gently, and a global popup says **Vaš zahtjev je
prihvaćen** with **Pogledaj vožnju**. Reduced motion keeps a static indicator.

The acceptance transaction records an owner-private notification and per-device
push deliveries. Five-second foreground polling claims each unseen event once;
navigation and form contents survive dismissing the popup. Only active future
accepted/ready bookings qualify. Browser Push uses a service worker, RFC8291
encryption and VAPID; delivery failure cannot reverse an accepted booking.
Retry delivery from a one-minute scheduled job, with leases and finite attempts.

Permission is requested only from an explicit settings button. iOS requires an
installed Home Screen web app and supported system version. Subscriptions bind
to a current authenticated session and disappear on logout/session expiry.
Queued pushes resolve the event with the current session before showing or
opening it. Lockscreen copy contains no passenger address or route details.
Subscription endpoints are restricted to supported browser push providers.

Global UI contracts: GET /notifications returns {notifications:[event]}; GET
/notifications/:id returns {notification:event}; POST /notifications/:id/seen
returns {claimed:boolean}. Events contain id,bookingId,rideId,type,createdAt,
driverName,date,time. Push settings use GET /push/config, POST /push/subscribe
and POST /push/unsubscribe. User explicitly approved closed-app notifications.

Additional requested corrections remain in scope: Home exposes **Na mjestu
sam** for the nearest accepted future passenger ride; street suggestions display
Latin and preserve city scope; driver offers accept 1–7 passenger seats with
atomic capacity checks and per-passenger readiness/completion.
