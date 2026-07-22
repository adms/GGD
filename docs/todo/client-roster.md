# Client roster, content-load & motion smoothing — TODO

`apps/client`. Boot-time full-content load (93+ champions selectable/predictable/rendered),
client-side movement/rotation smoothing (visual layer), and a scrollable/filterable champ select.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| roster-01 | Boot loads full content over HTTP → sim/content registries populated | client-content-boot | unit | done |
| roster-02 | Content-load failure falls back to sela/thorne skeleton (non-fatal) | client-content-fallback | unit | done |
| roster-03 | Yaw smoothing: nlerp facing converges, bounded step, unit-length, no snap | client-yaw-smooth | unit | done |
| roster-04 | ChampionView eases rendered yaw toward authoritative facing (no snap) | client-yaw-view | integration | done |
| roster-05 | Interpolation easing: Catmull-Rom is C1-smooth, reproduces linear for constant velocity | client-interp-ease | unit | done |
| roster-06 | Champ-select filter: substring match incl. CJK names | client-champ-filter | unit | done |
| roster-07 | 「隨機英雄」 uniform-random pick routes through SELECT_CHAMPION | client-champ-random | unit | done |
| roster-08 | Imported champion renders its GLB and turns smoothly in a live match | client-roster-render | e2e | pending |
| roster-09 | Local hero is rendered BETWEEN 30 Hz sim ticks via a render alpha — even per-frame motion at 60 fps, no tick staircase | client-tick-interp | regression | done |
| roster-10 | Relocation (spawn/respawn/teleport/blink) SNAPS in prediction, snapshot buffer and anim rates — never glides or spins the walk cycle | client-teleport-snap | regression | done |
