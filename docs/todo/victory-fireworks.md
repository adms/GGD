# Victory fireworks — 勝利煙火 / 吃雞烤雞 (task #93 VFX)

The two victory celebrations, built on the task #33 pooled-preset VFX toolkit. The
**joke is the deliverable**: the match-win firework is a **full-screen roast chicken**
(吃雞 = winner winner chicken dinner), and its acceptance criterion is blunt — *can a
player tell it is a roast chicken?* It was answered by rendering the point cloud and
looking at it, over **seven iterations** (viking-helmet → bat → cat's-head → bull →
bird), and the structural properties that finally made it read are locked as tests so a
later "tidy-up" cannot silently ship a golden blob.

**Two tiers, deliberately different effects — not one at two sizes:**

- **ROUND WIN (tier 1)** — a short `SmallFireworkFx` **volley**: a handful of small
  peony bursts (flash + spark peony + smoke puff, pooled preset layers) popping in the
  upper frame as punctuation. Fires several times a match, so it is **≤1.5 s** end to
  end and its scatter+palette are **seeded by round number** so round four does not look
  like round one.
- **MATCH WIN / 吃雞 (tier 2)** — the full-screen `ChickenFireworkFx`: a launch comet, a
  white break flash, and a **~1650-point roast chicken** that **HOLDS** still and fully
  lit for **1.25 s** (long enough to read + screenshot), then droops under gravity,
  spreads, and cools to ember. Fires **once**.

**Silhouette** (`apps/client/src/vfx/chickenSilhouette.ts`, pure): the bird is an SDF
union of ellipses + tapered capsules (iq round-cone), sampled into a coloured point
cloud in two passes (interior fill + projected outline) plus a third **crease** pass that
draws each drumstick's own contour a short way into the breast. What makes it read, in
the order the iterations proved it: **two drumsticks in a ~49° V with fat bone knuckles**
(the tell; 43° reads as ears, 57° as horns), a **cool-white dish wider than the bird**
under warm gold (three-value separation survives the droop), a **breast dome between the
legs** (without it → bow-tie / cat's-head), and **no wing, no tail** (both made it read
as a bat — dropping them was the single biggest gain).

**Timeline + framing** (`fireworkMath.ts`, pure): the tier-2 curve is a real shell's —
launch → expand (with a ~4% overshoot) → **hold** → droop+fade — and the whole thing is
welded to **camera space** (`fitScale` to ~80% of the shorter frame axis) so "full
screen" holds on ultrawide and portrait alike. Tier-1 layout (`smallVolley`) is
round-seeded, upper-half, spread across bands, staggered.

**Shells** (`ChickenFireworkFx.ts` / `SmallFireworkFx.ts`): the chicken formation is
**one mesh, one draw call** — 4 verts/point, a vertex shader that places every point
analytically from ~8 uniforms (expand / drift / droop / alpha / cool / flash), additive,
depth-write off. The CPU writes ~8 floats per frame; nothing per-particle. The launch
comet, break flash, glitter and every small-shell layer are ordinary pooled
`vfxPresets` bursts (all with an explicit `texture` — a textureless pooled ParticleSystem
renders nothing, a bug caught only by a frame-stepped screenshot). Point budget scales
with the quality tier by **coarsening the sampling pitch, clamped** — a low-tier bird is
a whole bird, never one missing a drumstick.

**Trigger** (`victoryTrigger.ts`, pure `VictoryGate`): edge-detects the two events for
the **local team only** from `phase` / `outcomeDecided` / `round` / my team's
`roundWins` + `placement`. Round win = my `roundWins` incremented while undecided; match
win = `outcomeDecided` && my `placement === 1`, latched once. The deciding final round
reports the **match win only** (never grey+dark at once); the **loser gets nothing**;
joining mid-match adopts a baseline and never retro-fires.

**Facade + wiring** (`VictoryFireworks.ts`): composes both tiers behind the gate and
exposes `onRoundWin(round)` / `onMatchWin()` callbacks on the same edge (the screen tint
— grey for a round, dark for the match, reusing #85's desaturation — and the taunt VO
from `content/config/victory-taunts.json` are the umbrella task's, hung on these hooks).
Wired into `GameApp` next to the death-focus pass: one `victoryFx.sync(victoryInput(state),
nowMs)` + `victoryFx.update(nowMs)` per frame, framed against player 0's camera, disposed
with the scene. Costs nothing until a win edge fires.

**Review surface**: `apps/client/public/firework-audition.html` (dev-only, like the #80
ground- and #52 BGM-audition pages) runs the SHIPPED effects against a real camera. A
**frame-stepped clock** (`?step=1400`, `?volley=2&step=780`) freezes an exact moment
independent of renderer speed, so the "can you tell it's a chicken" judgement is made on
the same frame across iterations.

**Not in this task** (umbrella #93): the grey/dark screen treatment, and the taunt VO
generation/playback. This task delivers the fireworks + the trigger + the callback seam.

## Tests

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| fw-01 | roast-chicken silhouette reads: dense/bounded/deterministic cloud; clear V notch with mass both sides; two bone knuckles as the highest points (white vs non-white body); dish lower+wider+cooler than the bird; NO wing/tail; density scales without losing a body part | firework-chicken-shape | unit | done |
| fw-02 | tier-2 timeline is a shell not a tween: launches before it forms, HOLDS ≥1 s still+fully-lit, then droops (sag grows, alpha→0, cools to ember, spreads) | firework-timeline | unit | done |
| fw-03 | framing fits the bird inside the frame at every aspect incl. portrait, and still fills ~86% of the shorter axis | firework-framing | unit | done |
| fw-04 | tier-1 volley is SHORT (≤1.5 s), scatters differently per round but identically for the same round, and each shell breaks exactly once across a 60 fps sweep | firework-small-volley | unit | done |
| fw-05 | victory trigger edge-detects for the local team only: one round win per increment, match win once, deciding round is match-only, loser gets nothing | victory-trigger | unit | done |
| fw-06 | shell lifecycle on NullEngine: builds ONE formation mesh lazily, self-stops after the timeline, cheap+unbuilt while idle, disposes clean; small volley self-stops | firework-shell-lifecycle | unit | done |
| fw-07 | facade routes a round edge → small volley + onRoundWin, a match edge → chicken + onMatchWin (once), and fires NOTHING for the loser | victory-fireworks-facade | unit | done |
