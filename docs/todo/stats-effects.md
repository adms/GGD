# Unified stat/effect pipeline — TODO

`packages/shared/src/sim/{stats,effects,combat}`. ONE ModifierSource shape for champion
passives/items/augments/buffs; one effectRunner for all EffectDef[].

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| fx-01 | Layered recompute: (base+flat)·(1+pctAdd)·mult, Override wins | stats-layered-order | unit | done |
| fx-02 | Stat clamps applied (AS, CDR, crit, MS) | stats-clamps | unit | done |
| fx-03 | Per-level growth changes base | stats-growth | unit | done |
| fx-04 | HP/mana ratio preserved when maxima change | stats-ratio-preserve | unit | done |
| fx-05 | attachSource/detachSource mark dirty + recompute | stats-attach-detach | unit | done |
| fx-06 | Timed buff source expires and stats revert | stats-buff-expiry | unit | done |
| fx-07 | Damage mitigation: armor/MR curve, true damage unmitigated | combat-mitigation | unit | done |
| fx-08 | Shields absorb before HP, expire correctly | combat-shields | unit | done |
| fx-09 | Crit multiplies damage via seeded RNG | combat-crit | unit | done |
| fx-10 | Lifesteal heals on basic-attack damage | combat-lifesteal | unit | done |
| fx-11 | applyStatus slow/root/stun affects movement | effects-status-movement | unit | done |
| fx-12 | Hook with internal cooldown fires at most once per ICD | effects-hook-icd | unit | done |
| fx-13 | Ability-slot-conditioned hook only fires for that slot | effects-hook-slot | unit | done |
| fx-14 | Damage queue drains in bounded ordered passes | combat-queue-bounded | unit | done |
| fx-15 | Every imported damage/heal/shield effect with a real base (>=1) carries a stat ratio — w3x abilities import with none, which made `ap` a dead stat | ability-scaling-present | unit | done |
| fx-16 | Ratios pick the right stat (physical→ad, magic/true/heal/shield→ap) and stay in the 0<coeff<=1.0 band | ability-scaling-band | unit | done |
| fx-17 | ap ratios are pure ITEM upside: no champion has base/growth ap, so zero-item ability damage is unchanged by the scaling pass | ability-scaling-budget-neutral | unit | done |
| fx-18 | Buying an AP item raises ability damage, and imported ap is on the normalised scale (not raw WC3 INT points) | ability-scaling-ap-items | unit | done |
| fx-19 | No imported effect is inert (the 62 JASS-scaled spells are restored from the source map), and the embedded + standalone copies of an ability stay identical | ability-scaling-no-inert | unit | done |
