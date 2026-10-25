# Independent endpoint city implementation plan

**Goal:** Two address inputs support different cities without a mandatory city step.
**Architecture:** Shared region city seed JSON; cached server input resolution for both suggest/search; local scope per StreetPicker. Existing route/search payloads retain Place.city.
**Spec:** ../specs/2026-10-25-independent-location-cities.md

- [x] Red tests: first/last explicit city, standalone city, arbitrary verified town, no cross-city pollution or stale bounds.
- [x] Implement shared city data and server resolver; apply to both location endpoints with resolved scope metadata.
- [x] Remove Home's global city control; add per-picker scope hint and optional inline change.
- [x] City-only selection requires map pin movement; city centres never imply precise home addresses.
- [x] Browser simulation: Sarajevo origin + Zenica destination, prefix/suffix input, saved values and independent override.
- [x] Full API suite, build, street/route regression and independent review; translations/help; deploy beta.

Verification: 261 unit/API tests, two intercity browser scenarios, existing full route audit and both four-language help/privacy checks pass. Build, diff check and dry-run pass. Independent review cleared the stale Photon cache issue after a red/green regression. Beta deployed as `b67dd430-951d-4600-a2d1-ba7d9db11c1b`; no database migration needed.
