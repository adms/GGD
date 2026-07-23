# Neutral duel-zone guardian (守護塔 / 守護石碑) — TODO

Task #89. A neutral, attackable guardian stands at each ACTIVE duel zone's centre (LoL-Arena's
"big plant"): anyone may attack it, the **last-hit killer** is paid (full HP+MP + gold + 鎮守之力),
and — the user's divergence from LoL — while awake it fires a **telegraphed AoE volley** at its top
damagers, so it rewards siege/anti-building heroes while punishing a clumped scrum. Full design +
every tuning derivation: `docs/guardian-tower.md`.

**Scope of this implementation = the deterministic sim CORE.** Off by default (`world.guardianRules
=== null` ⇒ `guardianSystem` is a strict no-op, same convention as flowers / revive circles). One
neutral `prop.guardian` ships; the per-arena faces 樹人 / 石頭人 / 巨獸人 are **task #105** (clean
seam left at `spawnGuardian`). Structure MITIGATION (`armor`/`magicResist`), the per-packet
`maxHitPctMaxHp` clamp, and the `vsStructure` siege scalar are all `combat/damage.ts` seams (owned by
the parallel combat wave): the fields are carried on `StructureComp` + in the config so that file
needs no further schema change; until it wires them a guardian takes unmitigated damage like the
flower. Client HUD/pick/AI wiring is out of this task's owned files.

Files: `packages/shared/src/sim/systems/GuardianSystem.ts` (new — component, rules, spawn/arm,
system), `SimWorld.ts` (store + step slot 9d + digest), `systems/DeathSystem.ts` (killing-blow
attribution), `content/schema/config.ts` (`guardianTower` block), `content/config/arena-rules.json`,
`content/models/prop.guardian.json`. Tests: `sim/systems/GuardianSystem.test.ts`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| guard-01 | Off by default: `guardianRules` null ⇒ no structure, no events, system is a no-op | guardian-disarmed-noop | unit | done |
| guard-02 | One guardian per ACTIVE zone at `zone.center`; fully neutral (no team/champion/matchStats/nav/stats) | guardian-per-active-zone | unit | done |
| guard-03 | HP scales by round: `round(hpBase·(1+growth·(R−1)))`; shipped default = 1450 → 3480 | guardian-hp-by-round | unit | done |
| guard-04 | A live guardian is invisible to team/champion iterations (champ count, matchStats) | guardian-invisible-to-team-iterations | regression | done |
| guard-05 | Dormant until first damage; `wakeTick` stamped from absolute `world.tick`; threat accrues | guardian-wake-on-damage | unit | done |
| guard-06 | Sleeps after `dormancySec` untouched: threat cleared, `volleysFired` reset | guardian-sleep-on-neglect | unit | done |
| guard-07 | Volley marks the top damager; its AoE splashes a nearby enemy champion | guardian-mark-splash | unit | done |
| guard-08 | A mark does NOT track: walking out of the stamped point during wind-up takes zero | guardian-mark-does-not-track | unit | done |
| guard-09 | Ramp: volley n = `base × min(rampMax, 1+rampPct(n−1))`; volley damage scales by round | guardian-ramp | unit | done |
| guard-10 | Last hit grants +gold, full HP&MP, and the 鎮守之力 buff — exactly once; guardian despawns | guardian-reward-values | unit | done |
| guard-11 | Killing a guardian grants NO kill XP / kill gold / bounty (only the guardian reward) | guardian-no-xp-no-gold-on-death | regression | done |
| guard-12 | Killing-blow source beats a later overkill packet queued the same tick (B1) | guardian-lasthit-killing-blow | regression | done |
| guard-13 | Reward void when the killer is a non-champion: guardian still dies, nobody paid | guardian-lasthit-void-non-champion | exception | done |
| guard-14 | Reward void when the killer is dead at payout | guardian-lasthit-void-dead-killer | exception | done |
| guard-15 | 鎮守之力 pulses enemy champions in radius (allies never), and stops at expiry | guardian-heir-pulse | unit | done |
| guard-16 | Same seed + same scripted damage ⇒ identical `digest()` every tick over a full siege | guardian-determinism-digest | determinism | done |
| guard-17 | A full siege consumes zero `world.rng` draws (rng state unchanged) | guardian-purity-no-rng | determinism | done |
| guard-18 | Wakes / volleys / pays with `flowerRules` null — nothing reads `combatTicks` (B3) | guardian-tick-source | regression | done |
| guard-wired | WIRED into the match: `arenaRules` carries `guardianTower`; `MatchController.enterCombat` arms `beginCombatGuardians` (one per ACTIVE pairing zone, round-scaled) and `concludeCombat` disarms `endCombatGuardians` (despawn all + drop inherited buffs → no post-round farming). Spawned guardians stay fully neutral to team/lives/scoreboard; last hit pays the reward gold exactly once and despawns the guardian. Test lives with the match wiring (`match/roundPacing.test.ts`). | guardian-match-wired | integration | done |
