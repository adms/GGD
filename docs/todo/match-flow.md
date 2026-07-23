# Match flow & game server — TODO

`apps/game-server`. MatchController (headless orchestrator) + Colyseus MatchRoom wrapper +
PairedDuels + driver seam + AI Tier-0 + Go⇄Colyseus HMAC.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| match-01 | PhaseMachine: champSelect→[interm→combat→resolution]*→end | phase-machine-transitions | unit | done |
| match-02 | PairedDuels pairing rotates round-robin (4/3/2 teams) | paired-duels-pairing | unit | done |
| match-03 | Lives lost scales with round | paired-duels-lives | unit | done |
| match-04 | Full 12-bot match runs to matchEnd with placements 1-4 | match-full-bots | integration | done |
| match-05 | Driver swap at tick boundary preserves entity state | driver-swap-seam | integration | done |
| match-06 | AI buys/ranks in intermission; picks augment offers | ai-intermission | integration | done |
| match-07 | HMAC sign/verify + skew reject (game side) | game-hmac | security | done |
| match-08 | Seat ticket mint/verify + expiry | game-ticket | security | done |
| match-09 | Combat ends when one side is down; loser loses lives | combat-resolution | integration | done |
| match-10 | Same seed + all-bot match → identical result | match-deterministic | determinism | done |
| match-11 | Human mailbox: stale seq dropped, latest order wins | input-mailbox-seq | unit | done |
| match-12 | Snapshot projects seats/teams/entities to schema | snapshot-projection | unit | done |
| match-13 | Schema state ENCODES without crashing (field semantics) | schema-encode | regression | done |
| match-nopick | No champ-select pick at expiry → seat is AUTO-ASSIGNED a random ENABLED champion and spawns ALIVE in round 1 (never a 0-HP ☠觀戰中 spectator); a stale/invalid pre-set id is re-rolled instead of crashing spawn (task #130) | match-nopick-alive | regression | done |
| match-settle-freeze | Combat ACTUALLY STOPS the instant a round settles (task #100): concludeCombat halts every champion (freezeControls) and, while `world.combatActive` is false, the intent seam strips the move/attack order + cast/active-item commands (freezeCombatIntent) — so no damage, motion or casts occur through `resolution` and the next `intermission`, yet the shop (buy/rank/ready) still works. Fighters no longer brawl on ~65s until enterCombat re-parks them. | match-settle-freeze | integration | done |
| match-firering-pace | Round pacing (task #132): `config.match@1` raises the hard combat backstop `combatMaxSec` 90→240 and adds a `fireRing` schedule (start 180s, +1%/s ramp step). The fire ring (`sim/fireRing.ts` + `FireRingSystem`) is the SINGLE SOURCE OF TRUTH for round length: `startSec` is the intended round length and the schema refine forbids it exceeding `combatMaxSec`, so the ring always ignites before the phase force-ends. | firering-config | unit | done |
| match-firering-start | The ring ignites at exactly `startTicks` combat-elapsed ticks (fireRingStart fires once), and the first step is a 0-damage grace second before the ramp bites. | firering-start | unit | done |
| match-firering-ramp | Escalating %-HP true burn: per-second rate = step×pctPerStep of each victim's maxHealth (1%/s at t+1s, 2%/s at t+2s …), capped at maxPctPerSec; per-tick burn = maxHp×rate×dt, ignores armor/MR + shields + combat-env; a full-HP champion dies ~14s after ignition so a stalemate settles by ~3-4 min. | firering-ramp | unit | done |
| match-firering-gate | LIVE-combat only (coordinates with #100): a disarmed world or `combatActive=false` (settled round) never burns; `endCombatFireRing` re-idles the system. Deterministic: same-seed armed worlds stay byte-identical. | firering-gate | unit | done |
| match-firering-wired | The controller WIRES the ring into the combat lifecycle (task #132): `MatchRoom` resolves `config.match@1`'s `match.fireRing` (`resolveFireRing`) and passes it to `MatchController`, which `beginCombatFireRing` on combat entry (`enterCombat`) and `endCombatFireRing` on combat exit (`concludeCombat`). Armed at entry (rules set, counter 0), ignites once + burns living champions during combat, disarms on settle; a settled round emits no further fire-ring event (coordinates with #100). Absent config = ring off (legacy). | match-firering-wired | integration | done |
| match-guardian-wired | The controller WIRES the neutral guardian into the combat lifecycle (task #89): `resolveArenaRules` carries `guardianTower`; `enterCombat` calls `beginCombatGuardians` (one guardian per ACTIVE pairing zone, HP/volley scaled by round), `concludeCombat` calls `endCombatGuardians` (every guardian despawns + inherited buffs drop → no post-round farming). Spawned guardians are fully neutral (no team/champion/stats/nav/matchStats, team lives untouched); the last-hit killer is paid the reward gold exactly once and the guardian despawns. | match-guardian-wired | integration | done |
| match-tickloop-clamp | The MatchRoom sim loop can no longer STALL (task #46): the fixed-timestep catch-up is clamped to `MAX_CATCHUP_TICKS` per frame and whole-tick backlog is shed (`match/tickLoop.ts` `planTicks`), killing the spiral of death that pinned the event loop and starved the snapshot broadcast (sim froze while the client rendered on at 60fps). A throwing tick is isolated (logged + room ended) so it can never re-throw every frame. Pure pacing math → sim stays byte-deterministic. | match-tickloop-clamp | unit | done |
| match-roundpace-determinism | Same seed + fire ring + guardians armed → byte-identical `digest()` end-to-end through the full bot-match flow (guardian spawns/despawns, fire-ring burns, settle-freezes all replay identically). | match-roundpace-determinism | determinism | done |
