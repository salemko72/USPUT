# Pulse execution ledger
Spec: 2026-10-20-pulse-app.md; plan: 2026-10-20-pulse-app.md.
Ruling: User requested coding continuously and optional questions via questionnaire; no repeat design approval. Existing isolated cloud checkout and work branch retained.
Ruling: First delivery uses real email/password accounts plus separate demo. No email/SMS sender exists; no verification claim or fabricated Google login.
Pre-flight: backend returns User/Ride/Booking JSON; frontend consumes same names. Local SQLite adapter implements D1 interface to keep SQL and handler portable.

Task 1: complete — shared Worker API, local SQLite/D1 adapter, schema, session auth, Google PKCE/state flow and participant-authorized ride operations.
Task 2: complete — Pulse illustration and all connected mobile/desktop screens, separate persistent demo, optional attributed OSM.
Final review: fresh reviewer pulse_review found two important races and time-window result limiting. No critical findings.
Final: fixed local transaction yielding — concurrent SQLite batches regression RED→GREEN.
Final: fixed stale terminal-state overwrites/false completion success — gated cancellation/completion regressions RED→GREEN.
Final: Ruling: time-window filtering before LIMIT graded important because otherwise valid offers disappear; fixed with >60-offer regression RED→GREEN.
Final tests: 18/18 Node tests pass; TypeScript/Vite production build passes; demo Playwright passes; two-real-user Playwright passes on local Node SQLite and local Cloudflare Worker/D1; responsive widths 320/390/768/1440. Google provider boundary mocked in OAuth test; real Google login remains unverified until credentials supplied.
Ruling: No cloud publication; D1 production ID remains explicit placeholder. Development databases and secrets excluded from Git. New code saved on feat/pulse-app for review.
