# Sarajevo Street Pack Measurement Plan

> **For agentic workers:** Use `superpowers:executing-plans` to execute the approved first-step data spike. No product integration or deployment is part of this plan.

**Goal:** Measure an OSM-derived Sarajevo street-only package before choosing the client search implementation.

**Architecture:** Extract named highway geometries from a bulk OSM download, clip to the declared trial area, normalize public names and preserve separate segments. Measure compressed size and local search in an isolated prototype; do not alter production APIs or data.

**Tech Stack:** Python 3 / temporary pyosmium tooling, JSON/gzip, Node.js 24 for an initial search benchmark.

**Spec:** [2026-10-23-city-street-pack-design.md](../specs/2026-10-23-city-street-pack-design.md).

## Global Constraints

- Sarajevo first; no subscription purchase and no production deployment.
- No house-number dataset, private user records or address-API harvesting.
- Preserve street names containing digits and separate disconnected geometry.
- Bound the trial to `[18.20, 43.75, 18.55, 43.95]`; label it as a trial area, not an administrative boundary.
- Retain source URL, SHA-256, extraction date when known, processing date, ODbL attribution and source IDs.
- Never report fixture results as actual Sarajevo coverage or phone performance.

## Review Focus

- Long streets crossing the trial edge: clip real segments without inventing connecting lines.
- Cyrillic, uppercase digraphs and missing accents: searchable normalization with readable Latin labels.
- A street name containing digits: retain it while ignoring house-number objects/tags.
- Two disconnected ways with the same name: retain their separate geometries.
- Download unavailable or incomplete: do not publish a city pack or a misleading size estimate.

## Task 1: Isolated importer and integrity check

- [x] Prepare an isolated importer and an explicitly synthetic OSM fixture outside application source: `tools/street-pack-spike/`.
- [x] Verify named-road selection, bounds, separate geometry, Latin aliases and exclusion of house data; synthetic checks pass with temporary pyosmium 4.3.2.
- [ ] Confirm network access to the bulk download source through the supported environment configuration workflow.
- [ ] Download the city/regional extract, record its provenance, verify it parses and produce the real package.
- [ ] Report the number of street records, unique names, geometry points and raw/gzip sizes.

## Task 2: Measure local search on the real package

- [ ] Benchmark initial load and repeated prefix/fuzzy searches using names drawn from the real package.
- [ ] Inspect known Sarajevo examples and ambiguous/long/disconnected streets; report limitations rather than treating them as verified meeting points.
- [ ] Save a compact results report that distinguishes desktop/browser and physical-phone measurements.

Execution stops after the measurement report. Application integration, service replacement, hosting purchases and deployment belong to later steps.
