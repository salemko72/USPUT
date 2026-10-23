# Separate route shaping from meeting stops

Approved scope: a draggable transit handle shapes the driver's route; it is never a passenger stop. Recalculate after drag end. Confirm the shape first, then choose meeting stops. Preserve the approved route and its control points when publishing and repeating an offer.

- [x] Add bounded coordinate-only transit points, signed-preview binding and persistence inside the existing route JSON. Keep old previews/offers compatible.
- [x] In the new flow, place stops along the selected shape without making a fresh driving-route request for each stop. Estimate stop times from the selected route's leg distances/durations. An intermediate pin must be within 50 m of the shape, in travel order; otherwise ask the driver to move it or edit the shape first. This tolerance is an implementation choice, not a stopping-safety claim.
- [x] Add the two-stage UI, a distinct draggable midpoint handle, optional extra transit points, keyboard/map-dialog editing, and fresh confirmation after changes. Ignore outdated responses and preserve draft control points on return/repeat.
- [x] Translate new controls into BS/SR Latin/HR/English; update help and status documentation.
- [x] Verify unit/API contracts and real-browser dragging, delayed responses, publication/repeat and mobile controls. Deployment follows these checks.

Verification: 172 unit/API tests; 7 automatic-preview browser cases; 3 route-shaping browser cases; all 7 commute regressions (the wheel-zoom case passed after isolating the closed pin-map's tile history); 2 help/privacy browser cases covering four languages; build, translation-key parity and Wrangler dry-run. Browser roads/tiles are synthetic; a physical phone and live provider availability are not proven by these checks.

No new map subscription, database migration or location tracking. The separate Sarajevo street-pack experiment remains unchanged.
