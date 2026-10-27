# Mutual star reviews Implementation Plan

> Execute inline using superpowers:executing-plans; existing conversation authorizes implementation and beta deployment.

**Goal:** Real mutual 1–5 reviews with honest driver scores everywhere.
**Architecture:** Isolated D1 review module, participant-scoped immutable submissions,
SQL-computed publication, shared React rating badge and completed-booking form.
**Tech Stack:** SQLite/D1, Worker JavaScript, React TypeScript.
**Spec:** docs/superpowers/specs/2026-10-27-mutual-star-reviews.md

## Global constraints
- Two roles separately; one review per booking/author; 14 days; no comments.
- No synthetic or demo ratings; no KYC or legal-popup changes in this delivery.
- No hidden ratings in public averages/counts. Keep beta expiration.

## Review focus
- Forged targets, self-reviews and another booking's passenger: reject server-side.
- Concurrent duplicate submissions: one SQL insertion; no updates to old reviews.
- One-sided publication exactly at deadline, both-sided immediately, counts agree.
- Multiple passengers: own booking only, independent release pairs.
- Completed before future departure or old cancelled history: no premature eligibility.

## Task 1: persistence and eligibility
- [x] Write tests in app/tests/reviews.test.mjs covering authorization, 1–5 validation,
  duplicate immutability, role isolation, paired release, deadline and demo exclusions.
- [x] Run and confirm missing review module fails.
- [x] Add server/reviews.mjs with handleReviewApi and completion-window statement;
  migration0019, schema; integrate API after authenticated session and completion batch.
- [x] Run focused tests to pass, then full npm test.

## Task 2: consistent score and review forms
- [x] Add UserRating.tsx badge and TripReview.tsx form with corresponding CSS.
  Ratings fetched from /users/:id/reputation, review status/submission from
  /bookings/:id/review. Limit badge request duplication and refetch after review.
- [x] Attach badges to result cards, ride header, trip cards, recognition card,
  arrival card if driver named, profile both roles, request passenger names.
- [x] Expose form for completed booking details and completed trip list cards.
- [x] Add BS/SR Latin/HR/EN translations, help/privacy truthful review documentation.
- [x] Build and browser-check two participants submit/reveal and narrow layout.

## Task 3: verify and release
- [x] Review diff and security boundaries; request independent review of major feature.
- [ ] Confirm tests/build, apply migration to beta database, commit/push feat/pulse-app
  and deploy beta. Record actual test outcomes and limitations in QA doc.
