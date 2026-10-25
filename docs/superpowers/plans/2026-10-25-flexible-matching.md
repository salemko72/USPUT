# Flexible matching implementation plan

> Implement inline under the user's existing authorization to continue.

**Goal:** Clearly classify flexible offers and retain valid matches on repeated route passes.
**Architecture:** One match policy shared by discovery and booking; ordered local route projections; grouped React results.
**Tech Stack:** Worker/D1, Node tests, React/TypeScript, local Playwright fixtures.
**Spec:** ../specs/2026-10-25-flexible-matching-design.md

## Constraints / review focus
- Exact boundaries: fits 0..+15min, maybe ±30min and walk+5, extra up to ±60min.
- No changed driver geometry, unverified offers cannot silently become confirmed.
- Same match policy through search, detail, pin edits, request, counterproposal.
- Repeat passes must preserve ordering, pickup ETA and selected pin.
- No automatic expansion of the saved 5/10/15-minute walking choice.

### Backend / policy
- [x] Add failing tests for exact policy boundaries and out-and-back projection matching.
- [x] Add `server/match-assessment.mjs`; extend `meeting-stops.mjs` with internal flexible option and raw walking seconds.
- [x] Replace first-only projection in `pickup-proposals.mjs` with ordered local candidate projections; classify and rank valid pairs.
- [x] Integrate scoped nearby unverified discovery and policy data into search/details.
- [x] Verify search→request uses expanded allowance without persisting a false original limit.

### UI and release
- [x] Group `Rides.tsx` results, add explicit reasons, extra-offer expansion and four-language strings/types.
- [x] Add browser checks for grouping and full booking flow with flexible offers.
- [x] Run full unit suite, browser regressions, updated audit, build and independent review.
- [x] Update help and four-language text.
- [x] Commit/push and deploy beta.

Verification: 252 unit/API tests pass; two flexible-result browser cases, full route audit, discussion/counterproposal flow, calendar phone/desktop checks and both four-language help/privacy checks pass. Build, diff check and Wrangler dry-run pass. Independent review cleared the repeated-visit zero-duration pairing after a red/green regression. Updated 39-case simulation is in docs/qa/2026-10-25-flexible-route-simulation.json.

Beta deployed: `372df0a6-c733-429c-af0a-3876bd3d6a9a` at https://usput-pulse.salemko.workers.dev/. No schema migration required.
