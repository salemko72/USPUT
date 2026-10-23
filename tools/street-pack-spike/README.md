# Sarajevo street-only data spike

Experimental importer for the first approved measurement step. Not imported by the application, not shipped to users and not a production city pack. It does not call Photon/Nominatim, change the database or deploy anything.

## Temporary tooling

The importer uses Python 3 and pyosmium. Keep these research dependencies outside the application's dependency tree:

```bash
python -m pip install --target /tmp/usput-street-tools osmium==4.3.2
PYTHONPATH=/tmp/usput-street-tools python tools/street-pack-spike/check_fixture.py
```

The fixture is synthetic, created in a temporary directory and removed afterwards. Its byte sizes must never be reported as Sarajevo coverage or download size. Checks cover named highways only, exclusion of house data and private roads, Latin display, digits in real street names, separate same-name ways, and clipping across the declared trial bounds.

## Real extract, once network access is available

Use a bulk OSM extract, not geocoder search results. Candidate sources:

- `https://download.bbbike.org/osm/bbbike/Sarajevo/Sarajevo.osm.pbf` — verify availability and geographic coverage before using.
- `https://download.geofabrik.de/europe/bosnia-herzegovina-latest.osm.pbf` — country fallback, clipped locally.

Download outside Git, then pass the exact source URL:

```bash
PYTHONPATH=/tmp/usput-street-tools python tools/street-pack-spike/build_pack.py \
  /tmp/usput-sarajevo.osm.pbf /tmp/usput-street-measurement/sarajevo.json \
  --source-url https://download.bbbike.org/osm/bbbike/Sarajevo/Sarajevo.osm.pbf
```

The tool emits JSON, gzip and a statistics report. It records input SHA-256, processing time and OSM attribution; the extract's own date and coverage still need inspection. No geometry simplification is applied beyond rounding coordinates to five decimals, so this measures a conservative first representation rather than a claimed optimal package. Same-name ways remain separate and require locality-aware grouping before product integration.

Current validation: synthetic checks pass with pyosmium 4.3.2. Real-data coverage, size, completeness, local-search speed and physical-phone performance are **not measured**. The source download is blocked by the current development-environment network policy. A network draft adds `download.bbbike.org` and `download.geofabrik.de` while preserving existing domains; it requires user review/save and environment publication before taking effect.

See the [design](../../docs/superpowers/specs/2026-10-23-city-street-pack-design.md) and [first-step plan](../../docs/superpowers/plans/2026-10-23-city-street-pack.md).
