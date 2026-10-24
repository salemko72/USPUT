# Passenger Meeting Implementation Plan

> **For agentic workers:** Execute inline; user authorized continuing without further approval. No subagent delegation.

**Goal:** Direct map pickup suggestions, optional exit, versioned agreement and short private chat.
**Architecture:** Proposal matching uses published route geometry plus pedestrian routes. Existing booking_routes stores agreed snapshot; booking_proposals stores current revision and private routing inputs. Messages belong to one booking. Existing acceptance capacity SQL remains authoritative.
**Tech Stack:** React, Leaflet, Cloudflare Worker/D1, SQLite tests.
**Spec:** ../specs/2026-10-24-passenger-meeting-design.md

## Global Constraints
- Four languages; optional exit; no automatic GPS; 50 m corridor; walking 5/10/15 minutes.
- Only booking participants; 280 characters, 100 messages; no implicit consent through chat.

## Review Focus
- Stale async map response never overwrites latest choice.
- Concurrent pin update and acceptance cannot accept a different revision.
- A stranger cannot read messages or private routing inputs.
- Reverse direction and inaccessible pedestrian paths are rejected.
- Cancelled agreements cannot send new proposals or messages.

### Task 1: Geometric proposals
- [x] Add failing tests for automatic closest projected pin, reverse order, >50 m rejection and pedestrian failure in `app/tests/pickup-proposals.test.mjs`.
- [x] Implement `proposalMatch(env, ride, from, to, wantedAt, walkMinutes, pickup?, dropoff?)` in `app/server/pickup-proposals.mjs`.
- [x] Connect preview/search/request in `api.mjs`; keep legacy paths intact.
- [x] Run tests.

### Task 2: Versioned booking discussion
- [x] Add migration, participant-only preview/update/messages endpoints and snapshot metadata in `api.mjs`.
- [x] Add tests for participant boundaries, stale revisions, capacity and cancellation.
- [x] Connect revision-checked acceptance and passenger confirmation to existing capacity transaction.

### Task 3: Map and chat UI
- [x] Replace selects with `PassengerMeetingPicker.tsx` on existing map, inline confirm and optional exit; no second pin popup.
- [x] Add `BookingDiscussion.tsx`, participant messages and driver counterproposal, explicit passenger confirmation.
- [x] Update translations, help, privacy and browser fixtures.
- [x] Verify build, unit tests and browser map/request/counterproposal/chat flow; migrate and deploy beta.

Verification: 207 unit/API tests passed; two-account browser flow passed with pickup drag, private text, driver counterproposal and passenger revision confirmation. Help/privacy passed in four languages. Focused meeting-map link and photo browser checks passed. Migration 0016 applied to beta; deployment follows this commit.
