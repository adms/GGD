# Arena round rules & movement feel — TODO

LoL-Arena style match rules (`config.arena-rules@1` -> `content/config/arena-rules.json`,
consumed by `apps/game-server` MatchController), the full imported roster live on the
server, and sim-side movement smoothing (`packages/shared/src/sim`): smooth turning
(nlerp facing, no snaps) + acceleration ramp.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| arena-01 | Round 1: +2 levels, Q+W+E auto-learned rank 1, silver offer | arena-round1-qwe | integration | done |
| arena-02 | Weapon offer: 3 distinct loot-table choices, pick grants item FREE | arena-weapon-offer | unit | done |
| arena-03 | AI auto-picks weapon offers through the shared offers map | arena-weapon-ai-pick | integration | done |
| arena-04 | R rank-gate override from unlock round; default 6/11/16 preserved | arena-ult-override | unit | done |
| arena-05 | Round-3 gold injection (+2500) lands at intermission entry | arena-gold-grant | integration | done |
| arena-06 | config.arena-rules@1 parses; defaults (no doc) = legacy behavior | arena-config-parse | unit | done |
| arena-07 | Both weapon-draft tables validate: legendary-weapons (round 5) is imported gear only, quest-rewards (round 2) is the 0g unbuyable quest set, every entry effective, tables disjoint | arena-loot-table | unit | done |
| arena-08 | Turning: facing converges, bounded per-tick step, 180° case resolves | move-turn-smooth | unit | done |
| arena-09 | Accel ramp reaches full speed; arrival stable; replay-deterministic | move-accel-ramp | determinism | done |
| arena-10 | Full 12-bot match under arena rules reaches matchEnd w/ placements | arena-full-bots | integration | done |
| arena-11 | Full roster live: bots pick imported champions (93 registered) | roster-bot-picks | integration | done |
