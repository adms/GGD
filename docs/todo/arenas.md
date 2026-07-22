# Themed arenas + selectable maps + cast bar — TODO

Three selectable themed arenas (**arena.castle** 城堡競技場, **arena.colosseum**
羅馬大擂台, **arena.dota** Dota 三路河道) authored as `arena@1` docs, chosen per
room via `mapId` (game-server `resolveArena` → Arenas registry → `arenaDefFromDoc`,
default `SKELETON_ARENA`). Collision is COMPLETE across every arena doc — every
visually-blocking decor prop (pillar / tree-trunk / tower / crate / chest /
barrel / rock / wall) has a matching collision obstacle (`arenaCollision.ts`);
flavor (torches / banners / floor & hex tiles / waterlilies) is collision-free.
Plus the deferred ability **cast bar** (over-head + ability-icon fill) driven by
the `castBegin/castEnd/castInterrupt/attackWindup` events (`CastTracker`).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ar-01 | groundStyle enum additively accepts `grass` + `sand` (keeps stone/dirt/wood) | arena-groundstyle-enum | unit | done |
| ar-02 | Every arena doc: each in-bounds blocking prop has a matching collision obstacle (no walk-through) | arena-collision-complete | unit | done |
| ar-03 | Collision rule: trees(trunk)/pillars/towers/crates/rocks block; torches/banners/tiles/water flavor | arena-collision-rule | unit | done |
| ar-04 | Blocking prop → clamped in-boundary circle obstacle; flavor/backdrop → none | arena-collision-derive | unit | done |
| ar-05 | MatchController resolves a room `mapId` to that arena's geometry | arena-select-mapid | unit | done |
| ar-06 | Absent/unknown `mapId` falls back to the skeleton arena | arena-default-fallback | unit | done |
| ar-07 | Full bot match runs to matchEnd on arena.castle | arena-play-castle | integration | done |
| ar-08 | Full bot match runs to matchEnd on arena.colosseum | arena-play-colosseum | integration | done |
| ar-09 | Full bot match runs to matchEnd on arena.dota | arena-play-dota | integration | done |
| ar-10 | Cast bar: castBegin → 0→1 progress fraction over the cast time | castbar-progress | unit | done |
| ar-11 | Cast bar: castEnd clears the bar | castbar-clear | unit | done |
| ar-12 | Cast bar: castInterrupt (stun/death mid-cast) clears the bar | castbar-interrupt | exception | done |
| ar-13 | Cast bar: attackWindup self-expires and never clobbers an ability cast | castbar-windup | unit | done |
