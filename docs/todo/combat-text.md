# RO-style floating combat text (浮動戰鬥數字) — TODO

> 「造成/受到傷害、或是補血補魔 應該都要出現符合顏色的清晰數字來提示，顏色及呈現、淡入出樣式可參考 RO 仙境傳說」

Four categories, each with its own colour, all four legible: **造成傷害 / 受到傷害 /
補血 / 補魔**. Colours, presentation and the fade in/out modelled on Ragnarok Online.

`清晰` is a requirement, not a nicety, and it is what most of this file is about.

## What was already there, and what was actually missing

Task #3 shipped damage numbers (`combat-juice.md` cj-c06). They failed the request in
three ways, two of them structural:

1. **Two of the four categories did not exist anywhere.** There was no `heal` event and
   no mana-restore event in the sim. Six sites mutated `hp.hp` and five mutated `hp.mana`
   **silently**. 補血 and 補魔 could not be drawn even in principle — snapshot deltas are
   lossy across 30 Hz + interpolation and cannot attribute a source. **Two new sim events
   were a prerequisite, not a nice-to-have.**
2. **造成傷害 and 受到傷害 were not distinguished.** Colour keyed on `dmgType`
   (physical/magic/true). The `damage` event has carried `source` and `target` since #3
   and the client knows its own entity — the split was free and simply never made.
3. **The numbers were illegible.** `fontSize = clamp(11 + amount * 0.14, 11, 30)` put a
   DoT tick or a chip hit at **11 px**, under a `text-shadow: 0 1px 3px #000` — a *blur*,
   not an outline. Over the rebuilt #80 ground that is unreadable.

## The load-bearing measurement: the outline carries legibility, the hue carries meaning

A floating number is anchored over a body, so the backgrounds it is *guaranteed* to be
born on are not the floor. Measured against the real ones:

| | vs red hit-flash `#cf5f5f` | vs sand ground `#8d8d8d` | vs its own BLACK RING |
| --- | --- | --- | --- |
| 受到傷害 `#FF0000` | **1.04** | 1.20 | **5.25** |
| 補血 `#00FF00` | 2.81 | 2.42 | **15.30** |
| 補魔 `#38D8FF` | 2.28 | 1.97 | **12.43** |
| 造成傷害 `#E8E8E8` | 3.14 | 2.71 | **17.14** |

`render/combatFeedback.flashColorFor()` returns `[1,.15,.15]` at α .6 for 130 ms on
**every** damage type, started by the same event that spawns the number: red text on red
flash is **1.04:1**. `vfxPresets.IMPACT_TINTS` flash quads are additive, so `dealt` washes
out to 1.23:1 for ~50 ms. And the #80 albedo maps light to a **mid-grey** (0.094–0.266
relative luminance ≈ `#575757`–`#8d8d8d`) — `#FF0000` has luminance 0.2126 and sits
*inside* that band.

**No hue survives all three, which is the point.** The treatment does:

- **A hard 8-direction black ring** (not a 4-way cross, which leaves glyph diagonals naked
  exactly where red dissolves into the red flash; not a blur, which smears at small sizes).
- **A dark halo** on the categories born inside the flash — it changes the *background*
  instead of fighting the foreground on hue.
- **A vertical gradient fill**, light top → saturated bottom, which is what RO's digit
  sprites look like. It buys the low-luminance hues real headroom: `taken`'s top stop
  measures **2.97** on the flash where its core measured 1.04, and 2.56–7.23 on the grounds.
  Behind a feature detect — with no `background-clip:text` the fill stays the solid bottom
  stop, because an invisible number is the worst possible failure for a legibility feature.
- **Fixed size per category.** Size means *importance*, never magnitude. RO never scales
  digit height by the number; the digits carry the number.
- `tabular-nums`, so a value never reflows its own width.

Colour-blind separation is structural, not assumed: `taken` and `dealt` separate on
luminance alone under any CVD; `heal` vs `mana` — the pair tritanopia collapses — separate
on **weight, italic, anchor height and drift direction**, none of which are colour.

## The palette, and the three things the measurement overturned

Team colours never appear in floating text. Team identity already owns the bar, the name
and the minimap. CIE76 ΔE to the nearest `TEAM_CSS` entry (ΔE < 25 ≈ confusable):

| category | hue | ΔE | size | form |
| --- | --- | --- | --- | --- |
| 受到傷害 `taken` | `#FF0000` | **33.9** | 30 | 900, strongest halo |
| 補血 `heal` | `#00FF00` | **55.5** | 23 | 800, `+` prefix |
| 補魔 `mana` | `#38D8FF` | **66.5** | 21 | 700 *italic*, `+` prefix |
| 造成傷害 `dealt` | `#E8E8E8` | **71.1** | 24 | 800 |
| 格擋 `guard` | `#B9C2CC` | **68.0** | 16 | 700, reads `GUARD` |

Third-party text (ally / enemy-vs-enemy) reuses the **same five hues** at lower alpha and
size.

Modifiers are treatment, never hue: crit ×1.30 + pop, killing blow ×1.45 + pop + 250 ms,
both keeping their category's colour. That is RO-correct (it does not recolour crits) and
it retires `KILL_COLOR #ff5a2e`, measured **ΔE 18.4** from team red. The two take the
**larger** multiplier rather than compounding — 30 × 1.3 × 1.45 would be a 57 px glyph,
nearly half a champion's on-screen height, for two emphases that say the same thing.

Three claims inherited from the design brief did not survive being measured:

- **`#FF1B1B` was going to replace pure red** on the theory that `#FF0000` sits too close
  to team red. It is the other way round: `#FF1B1B` is **ΔE 26.9**, `#FF0000` is **33.9**.
  RO's own `ENEMY → (1,0,0)` is both more faithful *and* better separated. Same for
  `heal`, which is RO's `(0,1,0)` exactly.
- **The ally band had its own desaturated tints** (`#FF5555`, `#5FE06E`). Those measure
  **ΔE 8.6** from team red and **9.7** from team green — they *are* the team colours. The
  band now reuses its category's primary hue and separates on size and alpha.
- **RO's SP blue was to be rejected for colliding with team blue.** RO's actual constant is
  `(0.13,0.19,0.75)` = `#2130BF`, which measures ΔE **35.2** — team-safe. It is rejected
  for a different, measured reason: it is a dark navy, and a dark fill inside a black ring
  is a black blob (**2.24:1 against its own outline**, vs 12.43 for `#38D8FF`). RO's combo
  yellow `#E6E626` is also declined, at ΔE **25.0** from team gold — right on the line.

## Motion is RO's, including the fall

roBrowser, verbatim (`Renderer/Effects/Damage.js`):

```js
position[2] = entity.position[2] + 2 + Math.sin(-Math.PI/2 + Math.PI*(0.5 + perc*1.5)) * 5;
color[3]    = 1.0 - perc;
```

That is `BASE_LIFT + ARC · sin(1.5π·t)`: it **peaks at t = 1/3**, is back at spawn height
at **2/3**, and ends a full peak-height **below** where it was born — a lob, not a rise.
Rise-and-hold-above-the-head is the WoW/League silhouette. Holding α = 1.0 for most of the
life is precisely the 停留成一大片光污染 the user rejected: it integrates to ~0.85 × life
of opaque-pixel time, where RO's linear `1 - perc` integrates to exactly **0.50**.

The one deliberate departure is the one the request asks for: 淡入出 — RO has no fade-in at
all. `FADE_IN_MS = 70` (6 % of a life) makes the envelope a triangle whose integral is
**0.50**, matching RO exactly. The fade-in is honoured without buying back any ink.

## Anti-clutter — and why there is no merge window

The obvious design accumulates repeat hits into one climbing number over a ~260 ms window.
Rejected, for three concrete reasons: re-popping a node mid-flight makes it **snap backwards
down its own arc** several times a second (an RO number never reverses direction); a merged
node's *life extension* is what actually produces light pollution; and a 250 ms DoT would
merge while a 300 ms one would not — the same ability changing presentation on a 40 ms
margin. There is also no periodic-damage path in the sim for it to guard.

What is here instead:

- **`COALESCE_MS` = 34 (one sim tick).** Same target + same category inside one tick adds
  into the node that is still in its own fade-in. Invisible, and it does **not** extend the
  life. This is what absorbs the one-tick AoE spike.
- **`SPAWN_STAGGER_MS` = 120** — RO's real multi-hit answer
  (`ActivationTime = time + 0.2f * i`). Simultaneous numbers on one body are *released in
  sequence*, so a flower burst arrives as a stream, not a stack.
- **`MAX_LIVE_PER_TARGET` = 3**, so no body carries a pile.
- **Priority admission.** The old code did `list.splice(0, over)` — priority-blind, so your
  own 受到傷害 number could be evicted by a stranger's chip damage two zones away. The
  worst *live* entry gives way (least important, then most faded), and a newcomer that is
  the least important thing on screen is dropped instead of displacing something better.
- **A scope setting** (`off / self / team / all`, default **team**), because in a 4-team
  lobby most damage on screen involves neither you nor your side.
- **Anchors clear the health bar.** Bars project from y = 2.45; every category anchors at
  0.85–1.30 and its arc peaks well below the bar block. 補血 (1.05) and 補魔 (0.85) also
  sit at different heights with opposite drift, so a flower burst firing both on one body
  in one tick does not collide. A number that hides the HP readout you need in order to
  decide whether to keep hitting is worse than no number.

Nodes are **pooled**: one `<div>` per pool slot, created once on mount and reused for the
session; the store is a fixed 64-entry array with an `active` flag, never pushed or
spliced. A teamfight allocates nothing.

## The sim half (the prerequisite)

`sim/combat/restore.ts` is the one path that puts HP or mana back, and the only place
`heal` / `manaRestore` are emitted. Wired at the four **discrete** restore sites:
`effectRunner` `heal`, `effectRunner` `restore` (healthPct → heal, manaPct → manaRestore),
basic-attack **lifesteal** (`combat/damage.ts`, on the attacker's own body), and the
**flower burst**.

Deliberately silent, and this is the design:

- **`RegenSystem`** — per-tick passive regen for every living entity. At 30 Hz × 12
  champions that is 720 events/s of "+0.4 hp": spam on the wire, light pollution on screen.
  Regen is read from the bar.
- **`ReviveSystem`** — a revive *sets* hp/mana to a fraction of max; it is a respawn, not a
  restore, and `reviveComplete` already carries the moment.
- **ability mana cost** — spending is not 補魔.

Determinism holds: pure arithmetic, no wall-clock/rng/trig (the purity gate stays green),
mutations byte-identical to the inline code they replaced, and events are not part of
`SimWorld.digest()`. `recordHealing` is an explicit non-defaulted `score` flag because the
sites genuinely differ — the flower burst has never credited `healingDone`, and
`matchStats` **is** hashed into the digest, so a wrong default would silently move balance.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ct-c01 | all four requested categories exist and split correctly: 造成/受到傷害 are ONE event split by who you are, 補血/補魔 have their own; self-damage reads as taken; a fully-absorbed hit on YOU reads `GUARD` and on anyone else is dropped; an enemy's mana restore is never drawn; restores are signed | combat-text-category | unit | done |
| ct-c02 | palette: size is CONSTANT per category (never amount-scaled), every hue AND gradient stop measures ΔE > 25 from every `TEAM_CSS` entry, the four requested categories are mutually ΔE > 40, heal/mana separate without colour (weight + italic + anchor + drift), crit/kill change size and pop but never hue and do NOT compound into a screen-eating glyph, rank orders by what must not be missed, and the LARGEST possible number still clears the y=2.45 health bar at closest zoom | combat-text-palette | unit | done |
| ct-c03 | RO's motion: lift peaks at t=1/3, returns to spawn height at 2/3 and ends BELOW spawn at t=1; strictly rising then strictly falling; alpha fades in over 70 ms then decays linearly to 0 with no plateau; the alpha integral is 0.50 (RO's, not a hold-then-drop 0.85); the pop settles once and never reverses; lanes clear a 3-digit glyph and wrap | combat-text-motion | unit | done |
| ct-c04 | density: scope gates third-party text but never your own; same-tick same-category coalesces without extending life; past the window it is a separate number; a crit never merges; simultaneous numbers on one body are staggered, not stacked, and a staggered node does not expire early; per-target cap holds; at the global cap the LEAST IMPORTANT entry gives way (not the oldest) and the least-important newcomer is dropped rather than displacing something better; lowering the cap mid-fight keeps your own | combat-text-density | unit | done |
| ct-c05 | legibility: the outline is a hard 8-direction ring with ZERO blur on every layer; the ring clears contrast against every fill it wraps and each gradient top stop clears 2.5:1 on both the red hit-flash and the brightest ground; `taken` carries the strongest halo; digits are tabular; without `background-clip:text` the fill falls back to a SOLID colour, never transparent; the ring thickens with the glyph so a crit is not left unoutlined | combat-text-legibility | unit | done |
| ct-c06 | task #42 registry is CONSUMED, not claimed: no combat-text HUD slot exists, reserved rects resolve for a viewport, a number over chrome is damped rather than left as mud, and a `transient` dev overlay never changes how the game looks | combat-text-chrome | unit | done |
| ct-c07 | pooling: the store is a fixed 64-entry pool — same array object, same entry objects, stable slot indices after 40 frames × 20 bodies; the live cap is never exceeded however hard it is driven; re-claiming a slot bumps its id so the renderer redraws | combat-text-pool | unit | done |
| ct-s01 | `heal` is emitted with the amount ACTUALLY restored and the overheal reported separately; nothing on a full or dead target; `restore` healthPct and basic-attack lifesteal both emit (lifesteal on the attacker's own body); a sub-epsilon crumb is applied but never drawn | combat-text-heal-event | unit | done |
| ct-s02 | `manaRestore` is emitted for `restore` manaPct, clamped at max with the overflow reported; PASSIVE REGEN is silent across a full second of ticks; spending mana on a cast emits nothing | combat-text-mana-event | unit | done |
| ct-s03 | the new events are presentation-only: same seed → identical digest, the flower burst still does NOT credit `healingDone` while a scored heal does, and every event carries the target's position | combat-text-determinism | determinism | done |
| ct-s04 | fanout guard: every event `sim/combat/restore` emits is on the `MatchRoom` MSG.EVENT allowlist (derived from source, so a third restore event cannot ship unwired), `damage` is still forwarded, and `RegenSystem` emits nothing | combat-text-fanout | regression | done |
