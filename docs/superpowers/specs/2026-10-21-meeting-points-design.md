# USPUT confirmed meeting points and everyday searches

Approved conversation decisions: recognition photo is the own profile avatar; driver proposes/edits/confirms stopping points; passengers' private address/pin is only a walking origin/destination; routes match only through published driver stops. Public meeting points grow through opt-in contributions and completed-trip feedback. Names/aliases + geography + approach/roadside inform duplicate detection, without averaging pins or joining opposite sides. Authorized editors maintain the catalogue; seed data remains candidates until reviewed. Saved searches are automatic, account-bound, deduplicated cards with a circular X, in two columns, plus New ride.

## Contracts
- Existing private avatar WebP is reused, without new blob storage or broader public read access. Avatar accepts userId and uses own-photo context only when IDs match. Accepted-ride recognition panel stays private.
- Driver stop snapshot: Place + stopId:string, catalogId?:string, approach?:string, side?:string. 2–10 confirmed named stops, in route order. Publishing requires a route preview token bound to driver, endpoints and stops. A point may be anywhere the driver chooses; the final recalculated route through those points must be previewed and explicitly confirmed. Passenger matching cannot add stops or driving detours.
- Saved passenger search includes full valid endpoint snapshots, time, walkMinutes; date is not persisted and becomes Europe/Sarajevo today on load. Fingerprint deduplicates identical endpoint coordinates/IDs, time and walking budget. Delete is owner-only.
- Catalogue contributions require explicit opt-in at publication. Public candidates are not described as safe/legal. Automatic merges require <=20m, same normalized name/alias, same city and explicit matching approach and side; uncertain duplicates stay separate for editor review. Manual merges preserve aliases, canonical redirects and immutable ride/booking snapshots; undo restores source identity. No average coordinates.
- Feedback only after a completed participant booking and only for catalogue points referenced by that booking. Distinct participants and recency are visible; repeated votes are upserts, not extra votes.
- ADMIN_EMAILS env allowlist + Google-linked account gates editor access, with server authorization on every admin operation. Empty allowlist grants nobody access.

## Files and ownership
Photo: ui.tsx, photo-client.ts, Photos.tsx, new AvatarPhotoContext.tsx. Root integrates provider and explicit userId props in App/Home/Profile/Rides.
Saved searches: server/saved-searches.mjs, migration 0009_saved_searches.sql, src/SavedSearches.tsx + saved-searches.ts. Root integrates Home and API dispatcher.
Catalogue: server/meeting-catalog.mjs, migration 0010_meeting_catalog.sql, src/MeetingAdmin.tsx. Root integrates editor route and publication/feedback UI.
Root: server/meeting-stops.mjs, server/corridor.mjs, server/api.mjs, types, Home, Rides, migration 0008_ride_meeting_stops.sql, integration, verification/deployment.

No invented ten safe points per city. Initial seed records may be reviewed candidates only; actual stopping suitability always requires driver confirmation. Existing offers without explicit stops cannot silently keep arbitrary address-based pickup matching; demo migration is explicit and marked synthetic. Existing accepted bookings retain their agreed snapshots.
