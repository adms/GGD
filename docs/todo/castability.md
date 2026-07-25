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

## Where the roster comes from (and why it was broken)

The 48 come from **tracked** source: `starterChampions` in
`apps/platform/internal/curation/starter.go` — the first open roster a fresh install
seeds, pinned id-for-id by Go's `TestFirstOpenRoster` (parsed by
`packages/shared/testkit/starterRoster.ts`).

It used to read `data/curation/whitelist.json`, which is **`.gitignore`d live operator
state**. That file exists only on the owner's machine, so in every fresh clone, worktree
and CI run the suite died of `ENOENT` inside `beforeAll`, reported "1 skipped", and had
**never verified a single castability assertion off that machine** — while this row sat
`done` on its strength. The operator whitelist is still honoured where it exists, but
only **additively**: champions it enables beyond the tracked 48 are swept too and flagged
in the report, and are excluded from the pinned counts so the gates mean the same thing
everywhere. (The two lists are set-identical today, so nothing was lost on the owner's
machine and full coverage was gained everywhere else.)

## What goes red

A diagnostic that can never fail is as dead as one that never runs, so three gates hold
over the tracked 48: (1) the sweep runs end-to-end, 48 × 6; (2) **every** champion spawns;
(3) a **ratchet** on working cells (✅ + 🟣) at the measured floor — an individual content
no-op stays a report finding, but a slot that works today and stops working goes red.

## Result (2026-07-24 run, at `ac64abc`)

**280 / 288 ✅ PASS · 7 🟣 PASSIVE (correct WC3 permanents) · 1 ❌ FAIL · 0 spawn failures.**
Counting the 7 permanents as correct behaviour, **287 / 288** slots behave as intended;
the ratchet floor is set there. The one gap is 草帽小子 蒙其.D.魯夫 (`godie-u00n`) **R** —
a `ground` cast that is accepted and then produces no measurable effect.
PASS channel mix (proves it is not rubber-stamping on cosmetics): 179 damage, 70 buff,
14 projectile, 8 heal, 5 dash, 2 shield, 2 status, **0 vfx-only**. Ranged/melee dimension:
all 14 ranged champs' basics launch a projectile (`ranged:true`); all 34 melee basics are
contact damage (`ranged:false`).

> The earlier 2026-07-23 entry here recorded 282 ✅ / 6 🟣 / **0 ❌** = 288/288, but the
> generated `docs/_castability-128.md` committed at `ac64abc` already showed 280/7/1 — this
> prose was simply stale. The tracked-roster sweep reproduces the owner's committed matrix
> cell-for-cell (the two rosters are set-identical), so the delta is content/sim drift, not
> a roster change. `godie-u00n` R is a live finding for the ability-fidelity owner.

## Items

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| cast128-01 | Every champion on the TRACKED first open roster spawns; Q/W/E/R/EX + basic each fire a measurable effect (or are verified permanent passives), held to a working-cell ratchet; pass/fail matrix written to docs/_castability-128.md | castability-sweep-128 | regression | done |
