# USPUT road matching

Authorized by user: continue autonomously, no repeated design approvals. Existing prototype exact endpoint matching is insufficient for commuters along a driver's route.

Use an OSRM-compatible driving table for the ten existing public meeting places. Cache successful matrices for 24 hours in D1. No home address, GPS tracking, paid AI, or claimed identity/location safety verification. Public OSRM is a beta dependency without SLA, replaceable via server configuration; no guaranteed permanently free service.

Compare driver A→B with passenger P→Q using A→P→Q→B and baseline A→B. Reject reverse directions, unreachable points, >200m snaps, >10min extra, excessive proportional detours, and pickup ETA outside ±60min. Rank by time and detour. Times are estimates without live traffic. Save the selected pickup/dropoff/ETA/detour with the booking so driver and passenger agree to the same places. Explicitly fall back to exact endpoints on outage. Existing exact search behavior remains available when routing is unconfigured.

Implementation: tests for direction/detour/time/unreachable/provider failure and booking snapshot; matrix provider/cache; search and request integration; cards/details show actual pickup and estimate; map remains labelled schematic until real road geometry is available. Verify existing auth/trips/photos tests and browser flows before deploy.
