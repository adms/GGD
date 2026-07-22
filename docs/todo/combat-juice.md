# Combat juice (打擊感) — TODO

Fighting-game / Street-Fighter-grade impact feedback for every combat action
(attack / hit / block / crit / knockdown / whiff / walk / death), so a MOBA
fight reads legibly using classic Capcom techniques — **without** changing any
balance number. The seam between the two halves is the enriched **`damage`
event** plus a few new impact events on the existing MSG.EVENT fanout.

Split across two workstreams that meet at the event contract:

- **SIM / authoritative** (`packages/shared/src/sim/**`, `apps/game-server/**`) —
  deterministic, tick-based: hitstop (freeze the two involved entities a few
  ticks, scaled by damage, cap ~6), knockback + knockdown, whiff lunge, the
  block/guardBreak mapping onto the existing shield / damage-reduction path, the
  crit + killingBlow flags, and the enriched event payloads. *(Rows authored by
  the sim half.)*
- **CLIENT / presentation** (`apps/client/src/**`, this session) — all screen
  feedback, quality-tier gated so the ~700 fps baseline holds.

## Event contract (the seam)

Enriched `damage` payload:
`{ x, z, target, source, amount, dmgType: "physical"|"magic"|"true", blocked, crit, killingBlow }`.
Added/kept events: `hitImpact` (any landed hit — impact-frame timing for
particles/shake), `knockdown {target}`, `whiff {source}`, `guardBreak {target}`;
existing `basicAttackHit` / `abilityCast` / `death` / `levelUp` reused.

## Client half — what landed

- **Camera shake** (`render/CameraRig.ts` + pure `render/combatFeedback.ts`): a
  pre-allocated impulse pool, decaying quadratically; magnitude scales with
  damage, bigger on crit/killingBlow, a small kick on your own landed hit vs a
  stronger jolt when you take damage. Driven from the `damage` event in the
  GameApp drain, quality-scaled (mobile ½, off-tier still on — shake is cheap).
- **Hit flash + hitstop** (`render/views/ChampionView.ts`): a ~80 ms per-mesh
  render-overlay tint on the struck model (white physical/true, red magic) — via
  `mesh.renderOverlay` so a shared `.glb` material never bleeds the flash onto
  another champion; and an animation FREEZE for the sim's hitstop window
  (`ClipAnimator.setFrozen`), mirroring the sim's "heavier hit = longer freeze,
  cap 6 ticks" curve so the struck model reads in lock-step. Position keeps
  flowing so knockback still slides — only the clip freezes.
- **Vignette + ripple post-fx** (`vfx/CombatPostFx.ts` + pure `vfx/postFxMath.ts`):
  one full-screen pass folding a red screen-edge vignette (LOCAL-player damage,
  intensity by hp lost) and a ripple / heat-distortion (heavy hits + beams).
  **Quality-tier GATED OFF on mobile/low**, and even on desktop it only attaches
  to the camera while a channel is decaying, so idle combat costs nothing.
- **Impact particles** (`vfx/VfxSystem.ts`, `vfx/HitSpark.ts`): dmgType-tinted
  spark bursts on `hitImpact` (physical spark / arcane pop / white) + a bigger
  cool-white pop on `guardBreak`.
- **Damage numbers** (`frameBus.ts`, `ui/WorldAnchorLayer.tsx`) — originally
  size+colour by amount+type, crit bigger + hotter + pop-scale, blocked greyed
  "guard", killingBlow most emphasized. **REBUILT by task #92**
  ([combat-text.md](combat-text.md)): the pure module is now `ui/combatText.ts`
  (`ui/damageNumberStyle.ts` is gone), colour keys on WHO rather than on
  `dmgType`, and size is constant per category. Consequence for THIS feature:
  the tinted spark burst above is now the **only** channel expressing damage
  school — do not re-spend the number's hue on it.
- **Per-frame combat SFX** (`GameApp.ts` drain + pure `audio/combatSfx.ts` +
  `content/config/audio-map.json` + 9 new deterministic `sfx/fx/*.wav`): distinct
  物理/魔法/防禦(block)/破防(guardBreak) voices plus crit / whiff / knockdown /
  footstep. The rich `damage` event drives the type-differentiated hit voice;
  `basicAttackHit` + `hitImpact` stay silent (no double-thud); `death`/`levelUp`
  remain owned by the AudioDirector tally. Footsteps derive from the local
  champion's ground track (`audio/footsteps.ts`), cooldown-gated in `playSfx`.

### Block / guard mapping (no new fighting-game guard system)

`blocked` is NOT a new stance: it is the EXISTING damage-reduction path surfaced
on the event — a hit is `blocked` when a shield absorbed part of it or a
damage-reduction buff was active; a shield that breaks THIS frame is
`guardBreak`. Numbers are unchanged; the client only reacts (lighter shake, a
guard SFX/spark, a greyed "guard" number, a bigger break pop).

## Client test items

| ID | Item | Test ID | Category | Status |
|----|------|---------|----------|--------|
| cj-c01 | Camera-shake math: decay envelope endpoints + monotonicity, impact amplitude by damage/crit/kill/taken with clamp, duration bounds | juice-shake | unit | done |
| cj-c02 | Camera shake applied to the live camera then decays back to rest; zero amp/duration ignored | juice-camera-shake | integration | done |
| cj-c03 | Hitstop window: ticks/ms from damage (floor 1, cap 6) + struck-model freeze update path | juice-hitstop | unit | done |
| cj-c04 | Hit-flash colour (white physical/true, red magic) + ~80 ms flash timing on the struck model | juice-flash | unit | done |
| cj-c05 | Post-fx math: red-vignette intensity by hp lost, ripple by impact (crit/kill), exponential decay to zero | juice-postfx-math | unit | done |
| cj-c06 | **SUPERSEDED by task #92** ([combat-text.md](combat-text.md)) — floating numbers now key colour on WHO (造成/受到傷害/補血/補魔), not on `dmgType`, and size is constant per category rather than scaled by amount. Still asserted here: crit/killingBlow are bigger with a pop, a fully-absorbed hit reads "guard". `ui/damageNumberStyle` was replaced by `ui/combatText`; the test id is re-covered by `ui/combatText.test.ts` | juice-damage-number | unit | done |
| cj-c07 | Per-frame combat SFX key selection (物理/魔法/防禦/破防, crit/whiff/knockdown, passthrough, tally/timing silence) | juice-sfx-key | unit | done |
| cj-c08 | Footstep cadence: one step per stride, silent while idle, teleport re-baselines | juice-footstep | unit | done |
| cj-c09 | Quality-tier gating disables heavy post-fx (mobile off / desktop on); camera shake scales down on mobile | juice-quality-gate | unit | done |
| cj-c10 | Hit flash tints the LOADED .glb child meshes (per-mesh renderOverlay), not only the procedural voxel fallback, then clears after the window (task #64) | juice-flash-glb | unit | done |
| cj-c11 | A landed hit AND a basicAttack flash the ATTACKER (source) view — a brief white impact pop — in addition to the victim's red flash; melee autos had no attacker flash (task #69) | juice-attacker-flash | unit | done |
| cj-c12 | A champion whose model is an empty (0-mesh) glb — `imported.collision` (godie-u011) — keeps the procedural voxel figure and its attack gesture instead of vanishing with a "Stand"-only clip (task #69) | client-empty-glb-fallback | unit | done |

## Sim half — what landed

Deterministic, tick-based, balance-neutral (no damage number or cooldown changed;
no `Math.random`/trig added — the purity gate stays green). All impact reactions
are pure integer/vec2 functions of the resolved damage, and the freeze state is
part of the world digest, so the client prediction shadow world replays them
identically.

- **Rich `damage` event** (`sim/combat/damage.ts`): the single point-damage
  resolve now emits `{ x, z, source, target, amount, type, dmgType, blocked,
  crit, killingBlow, origin }`. `amount` = hp actually removed (post-mitigation,
  post-shield; 0 on a fully-blocked hit). `blocked` = a shield absorbed part OR a
  damage-reduction buff was active; `guardBreak` when the shield pool broke
  (>0→0) this hit; `killingBlow` only on the packet that crosses 0 hp. `type` /
  `origin` kept as legacy aliases (DeathSystem + existing tests untouched).
- **New impact events** (all whitelisted in the MatchRoom MSG.EVENT fanout):
  `hitImpact { x, z, source, target, dmgType, amount, blocked, crit, killingBlow }`
  on every landed hit (amount = the pre-shield IMPACT magnitude — shake/particle
  timing), `knockdown { target, source, x, z, ticks }`, `whiff { source, x, z }`,
  `guardBreak { target, source, x, z }`.
- **Hitstop** (`sim/systems/HitstopSystem.ts`): a per-entity freeze of BOTH the
  attacker and the victim on a landed hit (impact ≥ 12), ticks =
  `clamp(2+floor(impact/55), 2, 6)`. A `hitstopDecaySystem` between the projectile
  and combat-resolve systems gives exact-N semantics. Freezes movement + wind-up +
  new-action starts; **cooldowns keep ticking** so cadence/DPS (balance) is
  unchanged. Only the two involved entities freeze (no desync); folded into the
  digest for replay-determinism.
- **Knockback / knockdown** (`sim/combat/damage.ts` + `MovementSystem`): a landed
  hit (impact ≥ 70) sets `nav.override {kind:"knockback"}` away from the source,
  integrated by `moveWithCollision` (slides along/stops at walls, clamps to the
  boundary — never clips). Distance = `clamp((impact/100)*1.6*typeMult, 0, 4)`,
  typeMult physical 1.0 / magic 0.6 / true 0.85, ×0.35 if blocked. A heavy
  UNBLOCKED physical/true hit (impact ≥ 170) roots the victim prone for 14 ticks
  then getup. Chip hits (impact < 70: most autos/DoTs) get hitstop but no shove —
  MOBA spacing preserved.
- **Whiff** (`sim/systems/BasicAttackSystem.ts`): a committed melee swing whose
  target escaped/died emits `whiff` + a small forward over-commit lunge. Early
  target-loss stays a silent cancel, so cadence is unchanged.

## Sim test items

| ID | Item | Test ID | Category | Status |
|----|------|---------|----------|--------|
| cj-s01 | Rich `damage` payload carries x/z, source/target, amount, dmgType, blocked, crit, killingBlow | cj-rich-payload | unit | done |
| cj-s02 | `hitImpact` pulse fires on every landed hit (impact-frame timing for shake/particles) | cj-hitimpact | unit | done |
| cj-s03 | `crit` flag surfaced on the event from the existing crit roll | cj-crit-flag | unit | done |
| cj-s04 | `killingBlow` set only on the packet that drops the target to 0 hp | cj-killing-blow | unit | done |
| cj-s05 | `blocked` derived from a shield absorbing part of the hit | cj-blocked-shield | unit | done |
| cj-s06 | `guardBreak` emitted when the shield pool breaks (>0→0) this hit | cj-guard-break | unit | done |
| cj-s07 | `blocked` derived from an active damage-reduction buff (no shield needed) | cj-blocked-drbuff | unit | done |
| cj-s08 | Hitstop freezes both attacker + victim for exactly N ticks | cj-hitstop-ticks | unit | done |
| cj-s09 | Hitstop applies to BOTH involved entities, not just the victim | cj-hitstop-both | unit | done |
| cj-s10 | Hitstop scales with damage, caps at 6 ticks; chip damage never freezes | cj-hitstop-scale | unit | done |
| cj-s11 | Hitstop is replay-deterministic: two seeded fights produce an identical digest | cj-hitstop-determinism | determinism | done |
| cj-s12 | Knockback shoves the victim away from the source (direction) | cj-knockback-dir | unit | done |
| cj-s13 | Knockback magnitude scales by damage + dmgType | cj-knockback-mag | unit | done |
| cj-s14 | Chip damage applies no knockback (autos/DoTs don't shove) | cj-knockback-chip | unit | done |
| cj-s15 | A blocked hit knocks back much less than the same unblocked hit | cj-knockback-blocked | unit | done |
| cj-s16 | Knockback respects the zone boundary — a big shove never clips outside | cj-knockback-noclip | unit | done |
| cj-s17 | A heavy unblocked hit emits `knockdown` | cj-knockdown | unit | done |
| cj-s18 | Knockdown counts down to getup in exactly N ticks | cj-knockdown-getup | unit | done |
| cj-s19 | A knocked-down victim is rooted while prone, then moves again on getup | cj-knockdown-root | unit | done |
| cj-s20 | A blocked heavy hit knocks back but does NOT knock down | cj-knockdown-blocked-none | unit | done |
| cj-s21 | A committed melee swing that connects with nothing emits `whiff` + a forward lunge | cj-whiff-lunge | unit | done |
