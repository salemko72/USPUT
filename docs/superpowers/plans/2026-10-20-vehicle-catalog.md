# Vehicle catalog implementation

User asks for a vehicle-adding engine covering makes broadly. Extend the existing Pulse profile and offer flow. Keep free/offline catalog, no image API or paid service. Scope: make search, make-specific model search, color, explicit manual fallback, one saved vehicle per profile. No plate/photo collection in this change.

- Catalog: pinned @meterapp/vehicle-db 2.19.1 (ISC; retain data-source attribution), Passenger Car + MPV, deduplicated build-time snapshot. Honest coverage; no exhaustive guarantee. Rebuild script and static frontend JSON, matching backend validation snapshot.
- Backend: vehicles table migration, own-vehicle GET/POST, validate catalog identity/model or explicit manual entries, allow only known colors. Session ownership. Ride creation uses owned saved vehicle and stores immutable description; retain legacy car API compatibility.
- UI: reusable accessible searchable combobox with keyboard navigation, vehicle card/editor in profile and offer flow, separate persisted demo data. Changing make clears model; save/reload keeps selection. Plate/photo not included without a separate decision.
- Tests first: saved vehicle and ownership/invalid data/ride snapshot; browser search-save-reload-edit and offer prefill at mobile widths. Full API suite, build and browser regression. Review important issues before publishing web-test update; no changes to other Cloudflare projects.

## Completion record
API regressions observed RED (404/missing saved-vehicle behavior), then 21/21 suite GREEN. Browser vehicle flow observed RED for absent add-vehicle entry, then GREEN. Fresh review found no important findings; two resilience minors corrected: manual entry when catalog fetch fails and removal of redundant demo catalog fetch. Regression for failed catalog request observed RED then GREEN. Build and existing demo browser regression passed; real two-user browser flow passed with saved vehicle. Remote migration0002 applied only to USPUT D1. Google client ID synced; encrypted secret preserved, never copied into code. Live provider login remains user-verified, external egress from executor remains blocked.
