# Abilities & champions — TODO

`packages/shared/src/sim/abilities` + skeleton champions (Sela, Thorne).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| abl-01 | Cast validation: unlearned/cooldown/mana/range rejected | ability-cast-validation | unit | done |
| abl-02 | Skillshot spawns projectile; hit applies scaled damage | ability-skillshot-hit | unit | done |
| abl-03 | Ground AoE hits enemies in radius, clamped to range | ability-ground-aoe | unit | done |
| abl-04 | Self cast shields + buffs the caster | ability-self-shield | unit | done |
| abl-05 | Dash ability moves the caster (stops at walls) | ability-dash | unit | done |
| abl-06 | Rank-up spends points; R gated at levels 6/11/16 | ability-rankup-gate | unit | done |
| abl-07 | CDR reduces cooldown ticks | ability-cdr | unit | done |
| abl-08 | Stunned caster cannot cast | ability-stun-blocked | exception | done |
| abl-09 | Champion passive hook fires (Sela Kindling) | champion-passive-hook | unit | done |
| abl-10 | Basic attacks: in-range autos on AS cooldown | basic-attack-cycle | unit | done |
| abl-11 | Kill grants XP + gold to the killer | combat-kill-rewards | unit | done |
| abl-12 | Full scripted 1v1 fight is deterministic (same digest) | combat-fight-replay | determinism | done |
