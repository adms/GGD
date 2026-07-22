# Combat timing v2 — cast time & basic-attack overhaul — TODO

Ability **cast time** (`AbilityDef.castTimeSec`, resolved by `CastResolveSystem`)
plus the **basic-attack** overhaul in `sim/systems/BasicAttackSystem.ts`
(per-champion wind-up, ranged auto projectiles at the champion's `missileSpeed`,
on-hit pipeline resolving on impact). Champion attack data lives in
`content/champions/*` (`missileSpeed`, `attackDamagePoint`, `baseAttackTime`).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ct-01 | Cast with ct>0 resolves effects after the wind-up, not instantly | ct-cast-deferred | unit | done |
| ct-02 | Caster is rooted for the cast duration, free afterward | ct-cast-rooted | unit | done |
| ct-03 | Stun interrupts a cast: no effect, mana stays spent | ct-cast-interrupt | exception | done |
| ct-04 | ct=0 abilities still resolve instantly (skeleton behavior preserved) | ct-zero-instant | regression | done |
| ct-05 | Ranged auto spawns a projectile that damages on impact, not instantly | ba-ranged-impact | unit | done |
| ct-06 | Melee auto applies damage at the damage point after the wind-up | ba-melee-damage-point | unit | done |
| ct-07 | Stun during the wind-up cancels the swing | ba-windup-interrupt | exception | done |
| ct-08 | Item on-hit (Serrated Edge) fires on impact for a ranged carrier | ba-onhit-impact | unit | done |
| ct-09 | Attack interval respects baseAttackTime × attackSpeed | ba-interval | unit | done |
| ct-10 | Per-champion missileSpeed/range read from the champion doc | ba-champion-data | unit | done |
