# Planar collision — TODO

`packages/shared/src/sim/collision`. Deterministic, planar (x,z), circle/segment based; feeds the
effect runner via `queryOverlap`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| col-01 | circle-vs-circle overlap + penetration depth | col-circle-circle | unit | done |
| col-02 | closest point on segment + circle-vs-segment | col-circle-segment | unit | done |
| col-03 | swept circle vs circle (projectile hit) | col-swept-circle | unit | done |
| col-04 | point-in-cone (cos-based, no trig) | col-cone | unit | done |
| col-05 | unit-vs-unit soft separation converges | col-separation | unit | done |
| col-06 | wall push-out + slide along segment | col-wall-slide | unit | done |
| col-07 | boundary clamp keeps entities inside the zone | col-boundary | unit | done |
| col-08 | spatial hash returns same set as brute force | col-spatial-hash-parity | unit | done |
| col-09 | queryOverlap for circle/line/cone shapes | col-query-overlap | unit | done |
| col-10 | dash/blink stops at wall | col-dash-wall | unit | done |
| col-11 | collision result identical server vs client replay | col-server-client-parity | determinism | pending |
