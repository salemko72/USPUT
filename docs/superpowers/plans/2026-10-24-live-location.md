# Live Location Implementation Plan

> **For agentic workers:** Execute inline following the user's existing instruction to continue without repeated approval.

**Goal:** Optional participant GPS sharing in the agreed time window.
**Architecture:** Scoped expiring sharing sessions and one last fix per participant/booking; one global Geolocation provider; GPS overlay on existing Leaflet map.
**Tech Stack:** React, Geolocation, Worker/D1, SQLite and browser fixtures.
**Spec:** ../specs/2026-10-24-live-location-design.md

## Global Constraints
- Five minutes before pickup until own agreement ends; six-hour failsafe.
- Explicit permission; latest fix only; no routing/geocoding calls; no durable client storage.
- 60-second consent lease; 90-second fix TTL; 15-second writes; 5-second viewing polls.

## Review Focus
- IDOR and multi-passenger isolation.
- Late uploads after stop/restart, finish, or cancel.
- Denied GPS, hidden tab, navigation and logout.
- Stale positions, wrong device clock and false precision.
- Latest location updates must not reset map zoom or create provider calls.

### Task 1: Scoped API
- [x] Add tests for window, participant scope, token races, expiry, malformed fixes and cleanup.
- [x] Implement `server/live-location.mjs`, migration 0017 and API dispatch; enable only same-origin geolocation permission.
- [x] Add cleanup to existing minute cron and terminal agreement actions.

### Task 2: Client collection and map
- [x] Implement global session provider with explicit start/stop, lifecycle cleanup, one GPS watch and paced writes.
- [x] Add location-only map overlay and scoped per-booking controls.
- [x] Test two accounts with mocked device positions, denial, hiding, navigation, stale fixes and cancellation.

### Task 3: Release
- [x] Four-language text, help/privacy and roadmap updates.
- [x] Build, API suite, browser integration, dry-run, migrate and deploy beta.

## Verification — 2026-10-24
- `npm test`: 224 passed.
- `npm run build`: passed.
- `USPUT_TEST_ASSETS_DIR=.../dist python tests/live-location-browser.py`: all five browser scenarios passed, including superseded permission and delayed enable requests.
- Help/privacy four-language and passenger discussion regressions passed.
- Independent focused code review cleared both reported session races after fixes.
- `git diff --check` and Wrangler dry-run passed; remote migration 0017 applied successfully.
- Browser verification uses local fixtures and emulated devices; production device GPS must be tried on two phones.
