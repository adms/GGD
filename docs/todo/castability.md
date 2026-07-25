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

The harness is **also a ratchet** (2026-07-25). It used to be a pure diagnostic
that "does not go red on a content no-op" — its only live assertion was
`roster.length === 48`, so all 288 cells could have failed and the suite stayed
green. It now pins a measured floor (`MIN_PASS` / `MIN_WORKING`) and an explicit
`KNOWN_FAILING` set, and derives its step window from the longest authored cast
instead of a hard-coded constant, so a regression shows up as a **named cell**,
not as a number nobody reads.

## Result (2026-07-25 run — contentVersion `cv_1e8298588746`)

**280 / 288 ✅ PASS · 8 🟣 PASSIVE (correct WC3 permanents) · 0 ❌ FAIL · 0 spawn failures.**
Counting the 8 permanents as correct behaviour, **288 / 288** slots behave as intended.
The −1 PASS / +1 PASSIVE against the previous `cv_ecff53279fad` measurement (281 ✅ · 7 🟣)
is the JASS-fidelity fix to `godie-e002:Q` 20-02 感知能力: its WC3 source `A0CM` is the
native Evasion (`AEev`, Cool=0 permanent, 7/14/21/28% 迴避), so the invented castable
armor buff became a verified `passive:modifiers` cell — a reclassification, not a
regression. PASS channel mix (proves it is not rubber-stamping on cosmetics): 180 damage,
69 buff, 14 projectile, 8 heal, 5 dash, 2 shield, 2 status, **0 vfx-only**. Ranged/melee
dimension: all 14 ranged champs' basics launch a projectile (`ranged:true`); all 34 melee
basics are contact damage (`ranged:false`).

### Correction to the earlier "282 / 6 / 0" claim

The prior run's summary here (282 PASS · 6 PASSIVE · **0 FAIL · 288/288**)
contradicted the report `docs/_castability-128.md`, which the same harness
generated saying **280 PASS · 7 PASSIVE · 1 FAIL · 287/288**. The report was
right that a cell was failing; the todo page had simply not recorded it. But the
report's *diagnosis* was wrong: the one ❌ was `godie-u00n` (草帽小子) **R**,
authored at `castTimeSec: 0.9` = **27 ticks**, while the harness stepped a
hard-coded `WINDOW = 26` — it read the effect one tick before the cast resolved
and logged "cast accepted but produced no measurable effect". It was never a
content gap. The window is now derived from content (`maxAuthoredCastTicks + 8`),
that cell PASSes, and both ledgers agree at **0 real FAIL**.

## Items

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| cast128-01 | Every whitelisted champion spawns; Q/W/E/R/EX + basic each fire a measurable effect (or are verified permanent passives); the sweep ratchets a measured PASS floor + a named KNOWN_FAILING set (currently empty) so any regression goes red by name; pass/fail matrix written to docs/_castability-128.md | castability-sweep-128 | regression | done |
