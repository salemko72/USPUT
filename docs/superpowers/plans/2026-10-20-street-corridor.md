# Street-based corridor matching

User authorizes a street + approximate number flow, usable for non-linear cities, and a real route corridor with 5/10/15 minute walking choice. Existing area IDs and daily Kerim offers must remain readable. Existing public OSRM matrix cache contains only failed results; do not claim live road routing works based on fixtures.

Implement confirmed coordinate-based locations from explicit geocoder search (no autocomplete), adjustable map pin, street labels and approximate number. Snapshot coordinates/labels with each published ride; accept same input for passenger search. Keep public beta geography and existing area selector as a clearly marked compatibility option, not the main search. Nominatim user-triggered beta search is cached and globally limited; publish service attribution and disclose external processing.

Use real OSRM driving polylines, project pickup/dropoff candidates on the actual path (ordered along polyline, within500m), and verify candidate drive detour and actual OSRM foot time. Walking budget applies to each walking leg and is selected explicitly (5/10/15). Candidate public points initially come from the beta catalogue and road-projected passenger points; no assertion that a road point is safe/legal to stop. Both riders confirm final agreed pins through existing request/acceptance. Save selected points/metrics with booking.

Cache routes, serialize public upstream requests globally to1rps, expose non-sensitive service failure diagnostics, never return road/foot estimates when providers fail. Show precise unavailability rather than silently implying all possible matches were checked. Fixture tests prove algorithm contracts only; production service availability requires observed real results.
