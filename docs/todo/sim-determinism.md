# Sim determinism — TODO

The authoritative sim must be a pure function of `(seed, ordered inputs)` so the client can
predict and the server can replay identically. No `Math.random`/trig in `sim/**`; seeded RNG only.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sim-01 | Seeded RNG: same seed → identical sequence | sim-rng-deterministic | determinism | done |
| sim-02 | RNG state snapshot/restore enables replay | sim-rng-replay | determinism | done |
| sim-03 | vec2.normalize returns a unit vector (no trig) | sim-vec2-normalize | determinism | done |
| sim-04 | Two SimWorld runs, same seed+inputs → identical state hash | sim-world-replay | determinism | done |
| sim-05 | Stable entity iteration order (sorted by id) | sim-stable-order | determinism | done |
| sim-06 | No wall-clock / Math.random / trig in sim (lint rule) | sim-lint-purity | unit | done |
| sim-07 | Fixed system order matches the client prediction replay | sim-system-order | determinism | pending |
| sim-08 | RNG stream fork is independent & reproducible | sim-rng-fork | determinism | done |
