# Meeting Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship account-bound everyday searches, reusable profile photos, confirmed driver stopping points and an editable community catalogue.
**Architecture:** Keep feature modules separate. Driver route preview is authoritative for stop snapshots; passenger matching computes only walking and travel along that fixed route. Catalogue identities are independent from immutable ride/booking snapshots.
**Tech Stack:** React/TypeScript, Leaflet, Node24 SQLite, Cloudflare Worker/D1/R2.
**Spec:** ../specs/2026-10-21-meeting-points-design.md

## Global Constraints
- BHS/ENG; Nunito; heading/emphasis 800; mobile fields >=16px; private compressed WebP.
- Preserve authorization, one-seat atomicity, no public personal-photo access, confirmed booking snapshots.
- Migrations: root 0008, saved searches 0009, catalogue 0010.
- Empty ADMIN_EMAILS denies admin access; never invent seed safety or auto-stop legality.

## Review Focus
- Opposite roadside/entrance merge must not follow name alone.
- A passenger address must never become an unapproved car stop.
- Catalogue edits must not mutate existing booked snapshots.
- Delete/save/search endpoints must not disclose another user's private endpoints.
- Session changes and late photo fetches must not flash another account's photo.

### 1. Photo reuse
- [x] Test avatar uses uploaded recognition image after save/reload/remove, ID-scoped, no duplicate uploads.
- [x] Add own-photo provider and explicit userId Avatar props; integrate owner UI.
- [x] Browser verification of own profile/header and private authorization.

### 2. Saved searches
- [x] Test owner-only list/upsert/delete and fingerprint/date semantics.
- [x] Implement handleSavedSearchApi(path,method,body,user,env) and migration 0009.
- [x] Implement SavedSearches({onNew,onLoad}) list with circular X; autosave successful search in Home.
- [x] Verify two columns, fresh date and no duplicates on repeated search.

### 3. Catalogue and service editor
- [x] Test city scope, cautious merge/undo, participant feedback and editor permissions.
- [x] Implement handleMeetingCatalogApi(path,method,body,user,env), isMeetingAdmin(user,env), registerMeetingPoint(env,user,point), migration 0010.
- [x] Implement MeetingAdmin editor component; integrate owner-only navigation and public candidate picker.
- [x] Verify city search, aliases, corrected points, feedback, no unverified safety claims.

### 4. Driver stops and fixed-route matching
- [x] Test route preview binding, ordered stops, no passenger insertion/detours, walking limits.
- [x] Implement driver stop editor + preview/confirmed publication using migration 0008; expose immutable stop snapshots.
- [x] Replace corridor proposals with matching only eligible ordered stop pairs; preserve provider-incomplete handling.
- [x] Show selected named pickup/dropoff, fixed driver path and walking estimates; keep private passenger origin out of counterpart match.
- [x] Migrate demo explicitly to named test stops and record provenance.

### 5. Integration and delivery
- [x] Review feature changes together, update translations/docs and run meaningful Node/browser checks.
- [x] Apply migrations and deploy authorized Worker. Admin allowlist configured.
- [x] Push feature branch and report remaining access/seed limitations precisely.

## Verification evidence
- 78 Node tests pass, including owner-bound previews, malformed/new publish guards, fixed stops, walking route limits, looping stop order, catalogue authorization/merge/undo/feedback, saved-search isolation/date/dedup, auth and private photos.
- Production TypeScript/Vite build and Worker dry-run pass. Full migration chain applies to a fresh SQLite database.
- Isolated 390px browser flow passes route editing/recalculation/confirmation, active catalogue suggestions, walking search, request/accept/complete, participant feedback, shared-cost BHS/ENG badges, recognition photo reused in profile/header after reload, saved cards/today/delete and two columns. Synthetic providers and grid map tiles; no claim of live provider accuracy.
- Catalogue mobile browser import/activation/pin edit/merge/undo/language passes. Photo provider focused browser verifies save/remove/account changes and stale-response isolation.
- Independent review identified and resolved missing-stop publish bypass, stale stop-selection match, and nearest-stop truncation on looping routes.

Deployment: Worker version `c627564b-01b8-4acc-b268-96467fb1611a` at https://usput-pulse.salemko.workers.dev.

Live smoke: deployed HTML references the current built asset, asset responds successfully, Google remains configured, and catalogue/admin/saved-search APIs return 401 without a session.
