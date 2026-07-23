# In-game castability coverage sweep (技能真的按得下去) — TODO

Task **#128**. The diagnostic the user asked for: prove that for **every** pickable
champion, pressing Q / W / E / R / EX — and swinging the basic attack — actually produces
an effect in the real `SimWorld`, rather than being a dead no-op button. This is distinct
from #78 (ability *fidelity* — right numbers) and #79 (VFX presence); it is the blunt
"does the button fire at all" gate.

## What the harness does

`packages/shared/src/sim/castabilitySweep.test.ts` spins up a **fresh deterministic
SimWorld per (champion, slot)** — 48 × 6 = **288 cells, no sampling** — with an adjacent
dummy enemy (and a dummy ally for friend-only heals/shields/buffs). For each slot it ranks
the ability through the real rank-up / EX-unlock path, aims it by `castType`, issues the
real `castAbility()`, steps past any cast-time wind-up, and checks a **real gameplay
channel** fired with no exception: a `damage` / `heal` / `manaRestore` / `projectileSpawn`
/ `knockdown` event, or a new shield / status / buff-source / projectile, or a caster
dash. Heals/restores get a half-HP/half-mana scene so they have room to register; passive
regen deliberately emits no event, so it cannot cause a false pass. A WC3 **permanent
passive** (native `Cool=0`, no castable effects) is reported as PASSIVE, not FAIL, and its
`ModifierSource` attachment is verified.

Output is the pass/fail matrix + summary + failure list, regenerated into
`docs/_castability-128.md` on every run.

## Result (2026-07-23 run)

**282 / 288 ✅ PASS · 6 🟣 PASSIVE (correct WC3 permanents) · 0 ❌ FAIL · 0 spawn failures.**
Counting the 6 permanents as correct behaviour, **288 / 288** slots behave as intended.
PASS channel mix (proves it is not rubber-stamping on cosmetics): 184 damage, 70 buff,
14 projectile, 7 heal, 5 dash, 2 shield, **0 vfx-only**. Ranged/melee dimension: all 14
ranged champs' basics launch a projectile (`ranged:true`); all 34 melee basics are
contact damage (`ranged:false`).

## Items

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| cast128-01 | Every whitelisted champion spawns; Q/W/E/R/EX + basic each fire a measurable effect (or are verified permanent passives); pass/fail matrix written to docs/_castability-128.md | castability-sweep-128 | regression | done |
