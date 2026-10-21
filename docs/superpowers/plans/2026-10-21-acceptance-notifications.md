# Acceptance Notifications Implementation Plan

> **For agentic workers:** Implement independent modules in parallel and review the integrated result before deployment.

**Goal:** Notice accepted requests throughout the app and through opted-in closed-app push.

**Architecture:** Durable D1 inbox and delivery outbox join the existing booking
acceptance transaction. WebCrypto encrypts browser push; a service worker validates
events against the signed-in account. Existing ride actions remain authoritative.

**Tech Stack:** React, TypeScript, Cloudflare Workers/D1, WebCrypto, Web Push.

**Spec:** ../specs/2026-10-21-acceptance-notifications.md

## Global constraints

- Permission only from an explicit click; iOS Home Screen guidance.
- Owner-only event/subscription APIs; no private route or address in push copy.
- No change to Google login, saved-date retention, private photos or meeting snapshots.
- BHS/ENG, Nunito 800 emphasis, reduced motion and 320px layouts.

## Review focus

- Logout/account switching with a queued push must not reveal another account.
- Concurrent acceptance/notification claims must not duplicate or overbook.
- Cancelled, completed and past requests must not raise stale acceptance popups.
- Push provider failure must leave acceptance intact and retry only finitely.
- Existing one-seat offers and stored agreements must survive migration.

## Tasks

- [ ] Crypto module: independent recipient decrypt/signature tests, strict endpoint/key validation, safe key generator.
- [ ] Inbox/outbox: migration0011, owner/expiry tests, atomic claim tests, retry/lease tests; integrate acceptance transaction and Worker schedules.
- [ ] UI/worker: global popup/claim, opt-in settings, service worker push/click validation, manifest/icons, browser tests.
- [ ] Home: readiness card plus numeric seat selector; preserve forms and dates, test actual ready action.
- [ ] Capacity: migration0012, default1, concurrent capacity checks, partial completion/cancellation tests.
- [ ] Street corrections: Latin normalization and stable selection, scoped exact search fixtures and regression checks.
- [ ] Integration: full Node tests, build, browser checks, independent review, migrations, VAPID provisioning, deploy, live smoke and push branch.
