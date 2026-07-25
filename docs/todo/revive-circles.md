# Revive circles (復活小火圈) — TODO

A champion who dies **during combat** drops a team-tinted fire ring on the corpse. A
**living teammate** who stands in it and channels brings them back — **once per team,
per round**. If the team's charge is already spent, later deaths drop **no circle at
all**, which is the clause that makes the round terminate.

**Config** (`content/config/arena-rules.json`, additive `reviveCircles` block on
`config.arena-rules@1`): `channelSec 5.0 · radius 2.0 · decayMult 2.0 ·
revivesPerTeamPerRound 1 · reviveHpPctMax 0.5 · reviveManaPctMax 0.5 · contestPauses true ·
damageInterrupts false · ccInterrupts true`. Absent block = mechanic off (legacy), the
same convention as `flowers`. Every judgement call below is one of these keys, so a
playtest disagreement is a JSON edit, not a rebuild.

## Why these numbers (measured, not invented)

A read-only harness ran **12 full 12-bot matches** on the real content tree
(`arena.castle`, 2 zones, boundaryRadius 24) at the real phase timings (30 Hz, 90 s combat
cap): **96 rounds, 160 duels, 566 deaths**, 406 of them "revivable" (≥1 living teammate).

| quantity | p25 | p50 | p75 | p90 | max |
| --- | --- | --- | --- | --- | --- |
| duel length (s) | 15.00 | **18.73** | 24.73 | 30.83 | 55.77 |
| duel time left after a revivable death (s) | 4.43 | **7.63** | 11.73 | 17.20 | 38.43 |
| gap between consecutive deaths (s) | **2.00** | 4.07 | 6.70 | 9.10 | 26.87 |
| death point → nearest living ally (u) | 1.24 | 2.90 | 6.09 | 8.48 | **17.04** |
| death point → nearest living **enemy** (u) | 1.22 | **1.29** | 1.38 | 3.38 | 11.35 |
| nearest surviving ally HP frac | 0.41 | **0.71** | 1.00 | 1.00 | 1.00 |

- **`channelSec 5.0` (task #206, owner directive 「復活圈需累積 5 秒」).** The measured
  bracket below argued for **3.0 s**, and the owner overruled it toward a longer, more
  committing channel — the same kind of tuning override as the #196 lifetime call, so the
  number is a deliberate design choice, not the harness's recommendation. It stays well
  above the **p25 death cadence of 2.00 s** (a team must not restore bodies faster than the
  enemy removes them, or the duel stops converging), and 5.0 s is exactly **150 ticks** at
  30 Hz — integer, no rounding drift. Pinned as the named `REVIVE_CHANNEL_SEC` constant in
  `packages/shared/src/sim/revive.ts`; the ring rim fills toward 100 % across those 150
  ticks. *(Original 3.0 s derivation, retained for context: 3.0 s + the p90 walk
  8.48 u ÷ 5.8 u/s = 1.46 s = 4.46 s of commitment, duel still running ~75 % of the time;
  at 5 s of channel commitment lands at ~61 %, the revived ally needs ~2 s more to matter →
  ~44 %, i.e. a revive at 5 s is a comeback tool, not a guaranteed save — which is the
  intent.)*
- **NO LIFETIME (task #196).** This block used to specify `lifetimeSec 6.0` = 2 ×
  `channelSec` — "exactly one channel's worth of travel time", sized so the latest possible
  start still covered the max observed ally distance of 17.04 u. The owner overruled it:
  「復活隊友的圈圈 沒有消失期限直到回合結束」. That also matches the cited reference — the
  LoL Wiki documents Arena's downed-state zone and its one-revival-per-team-per-round cap
  but states **no timeout** on the zone, and Riot's own article describes only "a circular
  area" with no lifetime. The stall this timer was defending against is instead bounded by
  `combatMaxSec` and the fire ring; the ring itself now ends only for a *reason* (owner
  revived, owner's entity gone, owner's team wiped from the zone, round over).
- **`revivesPerTeamPerRound 1`** is pinned by the **90 s `combatMaxSec` cap**. Each revive
  adds roughly one extra champion-death; the p90 gap between deaths is 9.10 s. 1 charge →
  worst observed duel 55.77 + 2×9.10 = **74.0 s (under the cap)**; 2 charges → 92.2 s
  (over, and decided by the anticlimactic HP-percentage tiebreak).
- **`reviveHpPctMax 0.5`** is anchored to the **p50 71 % HP** of the ally doing the
  rescuing: the revived player arrives *just below* the median state of the man who saved
  him — always the weakest body on the field. It is also 2.8× the flower's `healPctMax`
  0.18, which correctly prices "3 s stationary channel + a teammate's life" against
  "kill a plant, cost 0".
- **`damageInterrupts false`** is forced by the **1.29 u p50 enemy distance**: the killer is
  standing on the corpse, so a damage-interrupt rule would cancel ~100 % of real attempts.
- **`radius 2.0`** is anchored to the 0.6 champion collision radius (1.7× a champion's own
  diameter, crossed in 0.7 s) and is ⅓ of the flower's `burstRadius` 6, so the two ground
  effects never read as the same thing.

**Caveat:** all figures come from Tier-0 bot AI, which clusters more tightly than humans.
`channelSec` is the first number to revisit after a human playtest (`lifetimeSec`, which
used to hold that spot, no longer exists).

**Re-measured WITH the mechanic implemented** (6 matches, 29 rounds, `arena.castle`,
real timings): 80 circles dropped → **6 completed revives, 46 expired, 28 extinguished by
a team wipe**. Round length p50 22.53 s, p90 37.60 s, **max 48.40 s — comfortably inside
the 90 s cap**, which is the tail-safety claim `revivesPerTeamPerRound 1` was chosen to
protect. The low completion rate is a property of Tier-0 bots (no retreat logic, no risk
assessment), not of the design; the same harness with NO revive-seeking in the AI managed
only 3, and the round tail was actually *worse* (max 71.63 s) because fights stayed spread
out.

**Tier-0 AI** (`ai/Tier0Brain.ts`): a bot walks to its own team's in-zone circle within
**18 u** (the max measured death-to-ally distance) with a MOVE order — a circle is not a
unit, so there is nothing to `attackTarget`. It outranks the flower rule (18 % HP is worth
less than a teammate) and its abilities keep firing at the enemy meanwhile. Without this
the mechanic is invisible in every bot match, and a human playtesting with bot teammates
would never once be revived.

## Sim

`packages/shared/src/sim/revive.ts` + `systems/ReviveSystem.ts` (step 9c, right after
`flowerSystem`, so it consumes the tick's `death` events). A circle is **transform +
`ReviveCircleComp` only** — **no health component, no TeamComp seat** — so it is ground
area, not a unit: `teamAliveCount`, duel resolution, the scoreboard and every ability
query are blind to it by construction. It is also excluded from `rebuildGrid`, which is
what makes it structurally untargetable and non-colliding.

Timing uses the **absolute `world.tick`**, not `world.combatTicks` (which only advances
while `flowerRules` is armed — a flowerless match would freeze the revive clock).
Combat gating comes from `world.reviveRules` being armed by `MatchController.enterCombat`
and cleared by `concludeCombat` beside `endCombatFlowers`.

Per tick: **spawn** on champion deaths (charge unspent, no live circle for the team, ≥1
living teammate in the zone) → **update** each circle (team wiped → extinguish; collect
eligible channellers; contest; progress ±) → **complete** or **expire**.

Edge cases, all deliberate: multiple channellers do **not** stack (redundancy, never
speed — 1.5 s would be below the p25 kill cadence); an enemy inside **pauses** progress
rather than blocking or resetting it; damage never interrupts but stun/root/knockdown
does; the channeller dying cancels the channel but the **circle survives** (it belongs to
the original corpse) and drops no second circle; an empty ring **drains at 2×** so a
half-second sidestep survives and a disengage does not; progress lives on the **circle**,
so a hand-off resumes instead of restarting; the duel-end check wins unconditionally (a
99 % channel does not save a wiped team). There is no lifetime clock at all (#196).

**Revived state:** 50 % max HP / 50 % max mana at the **channeller's feet**
(`pushOutOfObstacle` → `clampToBoundary`, the flowers' own helpers), status effects and
shields cleared exactly like `enterCombat`, items/gold/level/**cooldowns** untouched.
History is **not rewritten** — the death stays a death and the kill stays a kill, because
`DeathSystem` already booked both; the rescue scores on its own line instead
(`revivesPerformed` / `revivesReceived`).

## Protocol / server

`EntityState.kind 3` (`ENTITY_KIND.REVIVE_CIRCLE`), key `prop.revive-circle`. Rather than
grow the wire schema, the circle reuses float slots that would otherwise sit unused:
`seatId` = the dead owner's seat, `hp`/`maxHp` = channel progress/total,
`mana`/`maxMana` = **0/0**, spare since #196 removed the lifetime, `shield` = ring radius,
`flags` = `CHANNELLING | CONTESTED`. `MSG.EVENT` gains `reviveCircleSpawn` /
`reviveCircleEnd` / `reviveComplete`; progress rides the snapshot, never per-tick events.
Circles are server entities, interpolated like flowers, **never predicted**.

## Client

**World** (`render/views/ReviveCircleView.ts`, pooled like `FlowerView`): a team-tinted
ground ring at the authoritative wire radius, a crown of **20 rising flame tongues that
light in order** (the world-space progress read — the channeller *and* the enemy standing
on them both see how close the rescue is without any HUD), a central fire pillar whose
height tracks the same progress (readable through stacked bodies), quality-capped rising
embers, and a hot white-orange **contested** strobe. This is task #22's lesson applied up
front. (The **burn-down** dim + faster beat went with the lifetime in #196 — a "hurry up"
cue with nothing to hurry for is a lie.)

**HUD** (`ui/components/ReviveBanner.tsx`, `revive` slot in the task #42 corner registry —
top-left order 2, touch order 3 so it stacks under the re-homed minimap): the dead player
is spectating and gets the loudest copy plus the countdown; the channeller gets the
progress bar. Per-tick values are patched imperatively from `frameBus.reviveCircles` in
its own rAF — never through React/Zustand (client-08).

**Minimap** (`ui/hud/Minimap.tsx`): a dashed team-tinted ring at the true world radius with
a clockwise progress arc, painted **under** the champion markers, fading with the circle's
own clock. The zone filter is a parameter (`onlyZone`) so task #67 narrows it by passing a
zone rather than ripping this out.

**Settlement**: `revivesPerformed` / `revivesReceived` join the scoreboard, a 救援復活 row
joins the stat breakdown, and `rating.ts` gains a `resc` sub-score weighted as a SUPPORT
axis (support 0.12 → assassin 0.02) so rescuing is rewarded on its own line.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| rev-01 | a champion death in combat drops ONE team-tagged circle ON the corpse (transform + marker only, no health/TeamComp); no circle when unarmed, for a flower death, or with no living teammate left | revive-circle-drop | unit | done |
| rev-02 | a teammate in the ring fills in exactly `channelTicks` and revives at 50% HP/mana at the CHANNELLER's feet; status/shields cleared | revive-channel-complete | unit | done |
| rev-03 | items/gold/level survive and history is NOT rewritten — the death stays a death, the kill stays a kill; `revivesPerformed`/`revivesReceived` score instead | revive-keeps-history | unit | done |
| rev-04 | once per TEAM per ROUND: a revived champion who dies again drops nothing; a second death while a circle burns drops no second circle; the other team's charge is untouched | revive-once-per-team | unit | done |
| rev-05 | edges: no stacking (2 allies fill at 1x), enemy contest PAUSES (never resets), damage does not interrupt but hard CC does, empty ring drains at `decayMult`, channeller death keeps the circle + refunds nothing, team wipe extinguishes it mid-channel | revive-edge-cases | unit | done |
| rev-06 | the ring has NO expiry (#196): it survives far past the old 2x-channel deadline, through a permanent contest, and is still revivable; only `endCombatRevives` / owner-alive / owner-gone / team-wipe end it | revive-lifetime-unbounded | unit | done |
| rev-07 | `endCombatRevives` despawns every circle, cancels channels, resets charges, and leaves the system inert | revive-combat-teardown | integration | done |
| rev-08 | a circle is ground area: absent from the broad-phase grid, invisible to `queryOverlap`, never pushed by or pushing a champion, never moves off the corpse | revive-not-a-unit | unit | done |
| rev-09 | two same-seed runs of a full revive produce identical digests; progress + team charges fold into `digest()` | revive-deterministic | determinism | done |
| rev-10 | `config.arena-rules@1` parses the additive `reviveCircles` block; absent = null (legacy); 3.0s converts to exactly 90 ticks; the schema is `.strict()` so a stale doc still carrying `lifetimeSec` is rejected rather than silently ignored | revive-config-parse | unit | done |
| rev-11 | MatchController arms a charge per alive team on combat entry, tears every circle + charge down on combat end, never arms without the block, and a full 12-bot match still reaches matchEnd with placements | revive-match-wiring | integration | done |
| rev-12 | snapshot projects kind 3 / key `prop.revive-circle` / owner seatId / progress + radius in the reused float slots (the lifetime pair now pinned to 0/0) / CHANNELLING+CONTESTED flags, and the entity leaves the snapshot on despawn | revive-snapshot-kind | unit | done |
| rev-13 | MatchRoom `MSG.EVENT` whitelist forwards `reviveCircleSpawn` + `reviveCircleEnd` + `reviveComplete` (source lint) | revive-event-whitelist | regression | done |
| rev-14 | `revivesPerformed` lifts the composite score on every role and lifts SUPPORT more than assassin (it is a support axis, not a carry one) | revive-settlement-stat | unit | done |
| rev-15 | ring math: `litTongues` is monotonic, clamped, and lights on the FIRST tick of a channel; `burndown01` is silent until the ring is really expiring; the tint is the shared 4-team palette | revive-view-progress | unit | done |
| rev-16 | EntityState.kind 3 → pooled ReviveCircleView (never champion/flower/projectile), pool reuse across circles, coexists with kinds 0/2, NO overhead bar, rim fill tracks wire progress, ring sized from the wire radius, embers inside the capacity cap | revive-view-dispatch | unit | done |
| rev-17 | HUD shows YOUR circle first, falls back to a teammate's, NEVER an enemy team's; six distinct headlines; the slot comes from the corner registry and per-tick values stay off React; the minimap paints circles under the markers with a parameterised zone filter | revive-hud-banner | unit | done |
| rev-18 | Tier-0 AI walks (MOVE order) to its OWN team's in-zone circle within 18u, outranking the flower rule; never seeks an enemy team's circle; fights normally when there is none | revive-ai-seek | unit | done |

## Corpse dissolve — 死亡三秒後半透明升天 (playtest directive #220)

Owner, 2026-07-26: 「人物角色死亡 倒在地上三秒後 應該都要有半透明飛上天消失的動畫（如果有
復活圈圈的例外）」. **Pure client visual.** The sim is untouched: `DeathSystem` still only
flips `hp.alive`, the corpse entity stays in the snapshot until the round tears down, and
`ReviveSystem` alone decides whether a rescue is possible. The dissolve gates nothing.

- **Clock** (`render/deathDissolve.ts`, Babylon-free): lie `DISSOLVE_LIE_MS = 3000` (the
  owner's number), then rise `DISSOLVE_RISE_UNITS 3.2` over `DISSOLVE_RISE_MS 1400` while
  the alpha runs LINEARLY to exactly 0 — an eased fade never reaches zero, and a
  "nearly invisible" corpse never leaves the screen.
- **Arming** is the sim's `death` EVENT (`EntityViewRegistry.handleEvent` →
  `ChampionView.noteDeath`), never `alive === false` — the same four false positives
  task #85 documents (champ-select, the whole intermission, a bye/parked seat,
  settlement) would otherwise dissolve every body outside combat.
- **The exception is THIS feature.** A corpse is exempt while the frame's entity set
  contains a kind-3 circle **on its own seat** — `EntityState.seatId` of a circle IS the
  dead owner's seat, and there is no ownerId on the wire, so the seat is the only join
  key. Presence == claimable, because a circle can only spawn on the tick of the death
  (`spawnCirclesForDeaths`) and #196 gave it no expiry. Re-evaluated EVERY frame (the
  `death` event and the snapshot patch can land in either order); while protected the
  death timestamp is re-anchored to now, so the 3 s starts when the rescue is really
  spent. Only one circle per team may burn, so a second teammate dying while one is up
  correctly gets no exemption.
- **Channels.** The fade is per-mesh `visibility`, never `material.alpha`: champion .glbs
  instantiate with `cloneMaterials: false` and SHARE one material per model, so a material
  write would fade every champion on that model and fight #49's tint clones. The rise is
  on `root.position.y` (nothing else writes it). No emissive/additive "ascension" glow —
  the body must stay inside #85's desaturation instead of punching a bright hole in it.
- **Vanish** hides the body nodes (never `root` — the draw-distance cull owns
  `root.setEnabled`) and stops every AnimationGroup, which are not nodes and would keep
  ticking on an invisible corpse. The view object itself stays alive because the ENTITY
  is still in the snapshot: disposing it would be undone by the re-create on the very next
  frame and would re-fire the async glb load. The overhead HP bar is already hidden by
  `anchor.alive`; the minimap's fading dead marker is deliberately left alone (#84 — it is
  how a dead player finds their own corpse and circle).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| rev-19 | dissolve clock: opaque + grounded for exactly 3.0 s, then monotonic rise + monotonic fade, visibility reaching EXACTLY 0 and staying vanished for any later sample; negative/NaN elapsed reads as "still lying" | revive-dissolve-timing | unit | done |
| rev-20 | ChampionView: lies → rises + fades → vanishes with `root` left enabled; NEVER dissolves while revive-protected (30 s) and starts a fresh 3 s when protection drops; never dissolves without a `death` event; a revive restores visibility/enable/position and re-arms; a duplicated death event does not restart the lie-down | revive-dissolve-view | integration | done |
| rev-21 | EntityViewRegistry: `death` event arms the dissolve; a corpse with no event never dissolves; a circle exempts ONLY the corpse on its own seat (a second, circle-less death dissolves normally) and the exemption lifts when the circle leaves the snapshot; `seatId -1` can never match | revive-dissolve-wiring | regression | done |
