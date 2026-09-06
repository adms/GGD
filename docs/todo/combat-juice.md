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
- **Unified on-hit orchestrator** (`render/combatFeedback.ts` + `render/EntityViewRegistry.ts`):
  the `hitImpact` event carries the sim's ONE `ImpactProfile`; `planImpactFeedback`
  turns it into ONE coordinated reaction set — freeze + victim flash + attacker
  flash + a camera-shake REQUEST — all scaled by the SAME `tier`, so every channel
  crosses light→heavy on the same frame (the audit's "single unified hit-weight"
  P0). `EntityViewRegistry` dispatches the three it owns onto the two views on
  `hitImpact` (was `damage`); the plan's `shake` request + spark/camera/sfx/number
  hook points are documented for later waves (do NOT spawn/move/play here).
- **Hit flash + hitstop** (`render/views/ChampionView.ts`): a per-mesh
  render-overlay tint on the struck model (white physical/true, red magic) — via
  `mesh.renderOverlay` so a shared `.glb` material never bleeds the flash onto
  another champion — whose strength + duration are tier-driven by the plan (still
  short: even a crit clears <200 ms, no strobe). The animation FREEZE
  (`ClipAnimator.setFrozen`) is now AUTHORITATIVE: it reads the sim's
  `profile.hitstopTicks` verbatim (NOT a re-derived damage-amount curve), so the
  pose un-freezes EXACTLY with the body, a fully-blocked hit (dmg 0, impact ≥ the
  sim floor) still freezes both fighters, and a chip hit the sim did not freeze
  leaves the animation running. Position keeps flowing so knockback still slides —
  only the clip freezes.
- **Vignette post-fx** (`vfx/CombatPostFx.ts` + pure `vfx/postFxMath.ts`):
  one full-screen pass drawing a red screen-edge vignette (LOCAL-player damage,
  intensity by hp lost). **Quality-tier GATED OFF on mobile/low**, and even on
  desktop it only attaches to the camera while the channel is decaying, so idle
  combat costs nothing.
  - **THE RIPPLE IS GONE (#196).** The pass used to fold in a radial
    UV warp — `sin(dist * 55.0 - rippleTime * 11.0)` — whose centre `onApply`
    hard-coded to UV `(0.5, 0.5)`. `CameraRig.apply()` ends every frame with
    `setTarget(target.x, 0, target.z)` onto the local hero's ground position, so
    viewport centre IS the pixel under the local champion's feet: every ripple in
    the game emanated from your own feet regardless of where the hit landed. It
    also never stopped — `addRipple` armed on ANY damage event in the match
    (`crit || killingBlow || amount >= 120`, including duel zones the player
    cannot see) and is a `Math.max` top-up, so the 90 ms half-life was re-slammed
    to full faster than it could decay. The owner reported it as
    「開始戰鬥 地板總是會有莫名的震動波紋曲線…鏡頭不動也會有，是玩家角色腳底為圓心的
    同心圓地震波」 — three observations that the hard-coded centre, the ground's
    tiled detail and the effect's own `rippleTimeSec` clock explain exactly.
    REMOVED rather than re-centred: in this rig any camera-target-relative radial
    warp lands on the local hero, so aiming it at the impact point would put the
    rings back on your own feet every time you are the victim.
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
| cj-c03 | Hitstop window is AUTHORITATIVE — the client freeze is taken verbatim from the sim's `ImpactProfile.hitstopTicks` (never re-derived from the damage amount); a fully-blocked hit (dmg 0, impact ≥ sim floor) still freezes both bodies, a chip hit the sim did not freeze leaves the animation running, and both fighters get the identical window + struck-model freeze update path | juice-hitstop | unit | done |
| cj-c04 | Hit-flash colour (white physical/true, red magic) + ~80 ms flash timing on the struck model | juice-flash | unit | done |
| cj-c05 | Post-fx math: red-vignette intensity by hp lost, exponential decay to zero (the ripple half was REMOVED by #196 — see the note above; this row would otherwise have kept reporting green off the surviving vignette test for a feature that no longer exists) | juice-postfx-math | unit | done |
| cj-c06 | **SUPERSEDED by task #92** ([combat-text.md](combat-text.md)) — floating numbers now key colour on WHO (造成/受到傷害/補血/補魔), not on `dmgType`, and size is constant per category rather than scaled by amount. Still asserted here: crit/killingBlow are bigger with a pop, a fully-absorbed hit reads "guard". `ui/damageNumberStyle` was replaced by `ui/combatText`; the test id is re-covered by `ui/combatText.test.ts` | juice-damage-number | unit | done |
| cj-c07 | Per-frame combat SFX key selection (物理/魔法/防禦/破防, crit/whiff/knockdown, passthrough, tally/timing silence) | juice-sfx-key | unit | done |
| cj-c08 | Footstep cadence: one step per stride, silent while idle, teleport re-baselines | juice-footstep | unit | done |
| cj-c09 | Quality-tier gating disables heavy post-fx (mobile off / desktop on); camera shake scales down on mobile | juice-quality-gate | unit | done |
| cj-c10 | Hit flash tints the LOADED .glb child meshes (per-mesh renderOverlay), not only the procedural voxel fallback, then clears after the window (task #64) | juice-flash-glb | unit | done |
| cj-c11 | A landed hit AND a basicAttack flash the ATTACKER (source) view — a brief white impact pop — in addition to the victim's red flash; melee autos had no attacker flash (task #69) | juice-attacker-flash | unit | done |
| cj-c12 | A champion whose model is an empty (0-mesh) glb — `imported.collision` (godie-u011) — keeps the procedural voxel figure and its attack gesture instead of vanishing with a "Stand"-only clip (task #69) | client-empty-glb-fallback | unit | done |
| cj-c13 | `combatFeedback.planImpactFeedback` is the ONE orchestrator: from a single `ImpactProfile` it produces freeze + victim flash + attacker flash + a camera-shake REQUEST all scaled by the SAME tier (flash strength/duration + shake amp monotonic light→crit, flashes stay <200 ms), victim flash colour follows dmgType, and it leaves documented request/hook points for sparks + camera + sfx + damage-number that a LATER wave consumes | juice-orchestrator | unit | done |
| cj-c14 | `asImpactProfile` narrows the untyped `hitImpact.data.profile` wire payload (valid tier + numeric hitstopTicks) and returns null on absent/malformed input without throwing (older replays); a missing knockbackDir defaults to {0,0} | juice-profile | unit | done |

## Client stage 2 — hit-feel channels (sparks / camera / shiver + #131) — task #133 client

Consumes the EXPANDED `ImpactProfile` (the 7 cosmetic hints the sim now rides on
`hitImpact.data.profile`: `shakeMag/shakeStyle/sparkKind/flashColor/flashMs/
camKick/exFreeze`). All additive, client-only cosmetics; deterministic sim
untouched. Owned files: `render/combatFeedback.ts`, `vfx/VfxSystem.ts`,
`vfx/vfxPresets.ts`, `vfx/HitSpark.ts`, `render/views/ChampionView.ts`,
`render/CameraRig.ts`.

- **Client `ImpactProfile` mirror EXPANDED** (`render/combatFeedback.ts`): the
  mirror + `asImpactProfile` now narrow all 7 cosmetic fields, backfilling a
  pre-#133 replay from tier-derived defaults so downstream code never sees
  `undefined`. `SparkKind`/`ShakeStyle` unions exported for the channels.
- **Contact-point sparks, DISTINCT per `sparkKind`** (`vfx/VfxSystem.ts` +
  `vfx/vfxPresets.ts`): the `hitImpact` spark is now bloomed at the CONTACT
  surface facing the attacker (not the victim's centre) and tinted by
  `profile.sparkKind` — white/yellow `hit`, cool-white `block` (+ rebound fan, no
  blood), **RED** `counter` (max layers), arcane `magic`, icy `ice`, `heavy`
  (+ring). New `IMPACT_TINTS.counter`/`.ice`; `HitSpark` gained a contact-height
  `y`. Pre-#133 replays fall back to the legacy blocked/heavy/type read.
- **FIX #131** (`vfx/VfxSystem.ts`): every spawn site (posFromEvent / play() /
  the raw-x-z spark spawns) now gates on a finite world position, so a
  NaN/Infinity coordinate (mid-despawn entity, un-interpolated pose, corrupt
  event) can never park a pooled additive system off-world — the cause of the
  persistent bright-white burst clamped to the arena's top-right corner.
- **Directional camera shake + translational KICK + crisp settle**
  (`render/CameraRig.ts` + `render/combatFeedback.ts`): `addShake` takes an
  optional hit vector — a directional impulse now lurches the eye along the
  ground plane (new `shakeZ`) with a fast front-loaded kick that snaps back
  within `KICK_DURATION_MS`, layered on the ring; omni (crit/EX) stays radial.
  Decay is now CUBIC and the duration retuned to 120–260 ms (was 160–460) with a
  ~12.4 Hz ring for a crisp Capcom settle (收尾精準). `plan.shake` carries
  `style` + `camKick` for the wave that dispatches it.
- **EX cinematic punch-in** (`render/CameraRig.ts`): `exPunchIn` transiently
  dollies the eye toward the target (allowed CLOSER than the user's DOLLY_MIN,
  floored at EX_PUNCH_MIN_DOLLY) and eases back crisp — the 特寫 half of the EX
  read (screen darken stays a post-fx concern, out of the rig).
- **Hitstop micro-jitter** (`render/views/ChampionView.ts` + pure
  `hitstopShiver` in `render/combatFeedback.ts`): while a body is frozen by
  hitstop it buzzes with a ~1–2px high-frequency shiver on `bodyRoot` (never the
  world transform, so knockback still slides), phase-decorrelated per entity, and
  snapping to zero the instant the freeze lifts (no settle tail). The 破碎 buzz.

Wiring note: the directional-shake `dir`/`camKick` and `exPunchIn` are
capabilities + `plan.shake` fields; the final one-line dispatch from the GameApp
event drain (which owns the `damage`→`addShake` call) lights them in-game — the
crisp-settle retune, contact-point sparks, #131 guard and hitstop shiver are all
self-wired through existing call paths and live now.

| ID | Item | Test ID | Category | Status |
|----|------|---------|----------|--------|
| cj-c15 | Client `ImpactProfile` mirror narrows the 7 cosmetic hints and backfills a pre-#133 payload from tier-derived defaults (never undefined); a bogus sparkKind falls to the safe default | juice-profile-cosmetics | unit | done |
| cj-c16 | `hitImpact` sparks are DISTINCT per `sparkKind` (hit/heavy/counter=RED/block=cool-white/magic/ice) with the matching layered intensity, bloomed at the contact surface facing the attacker, and fall back to the legacy read with no profile | vfx-spark-kind | unit | done |
| cj-c17 | FIX #131: a non-finite world position spawns nothing — `play()` refuses it and `hitImpact` with a NaN entity pos fires no spark, so no pooled additive system is ever parked off-world | vfx-spark-nonfinite | unit | done |
| cj-c18 | Camera shake retuned CRISP: cubic decay dies harder than the old quadratic, duration bounded 120–260 ms (Test ID `juice-shake-crisp`: cj-c01 already owns `juice-shake`, which this row's old multi-id cell had borrowed — GH#1031) | juice-shake-crisp | unit | done |
| cj-c18d | `plan.shake` carries the directional-kick cosmetics: amp (from shakeMag), style, the knockback direction and a tier-scaled camKick (split from cj-c18 — one Test ID per row, GH#1031) | juice-shake-directional | unit | done |
| cj-c19 | A DIRECTIONAL shake kicks the eye along the ground-plane hit vector then settles to rest; an omni shake adds no directional ground kick | juice-camera-directional | unit | done |
| cj-c20 | `exPunchIn` dollies the eye toward the target (closer than the user's DOLLY_MIN, floored) then eases back crisp | juice-camera-expunch | unit | done |
| cj-c21 | `hitstopShiver`: a sub-1px buzz WHILE frozen, phase-decorrelated per entity, tapering to and snapping to zero at the window end (no settle tail) | juice-hitstop-shiver | unit | done |

## Client stage 3 — the ground-follow juice the playtest flagged (task #147)

A playtest read the live combat scene as still missing five presentation beats.
Two already existed but under-read; three were absent. All additive, client-only
presentation — no sim change, quality-scaled + pooled. Owned files:
`render/shadows/**` (NEW), `vfx/VfxSystem.ts`, `vfx/vfxPresets.ts`,
`vfx/feedbackPresets.ts`, `vfx/CombatFeedbackFx.ts`.

- **Hit-flash sparks — STRENGTHENED** (`vfx/vfxPresets.ts`): the contact-point
  spark kit (stage 2) already fired per `sparkKind` at the strike surface, but
  the LIGHT tier — the plain melee auto, the most common hit — read as nearly
  nothing. `IMPACT_TUNING.light` is retuned to a brighter/bigger white-hot
  additive flash (peak 1.15u, 3 pulses) + 30 stretched contact sparks, still
  ≤ 3 frames and still below the heavy tier.
- **Blood splatter — VERIFIED present** (`vfx/BloodFx.ts`, unchanged): the 濺血
  directional spray already fires on every non-blocked `hitImpact`, gated by the
  gore config which DEFAULTS to `blood`@0.85 for a fresh player. Left as-is; the
  playtest gap here was the missing spark read above, not the blood.
- **Blob shadows — NEW** (`render/shadows/**`): a self-contained layer draws one
  soft dark disc under every live body and follows it. It reads NOTHING itself —
  `VfxSystem.update` walks `frameBus.champions` (the live-body list the render
  layer already publishes), takes each body's FRESH rendered position via
  `ctx.entityPos` (champion views are synced earlier in the frame), and hands the
  layer a plain `{id,x,z,radius}` list. So it never imports/mutates ChampionView.
  Pooled per entity id (a body that dies/despawns frees its disc for reuse),
  footprint-scaled (champion vs flower), hard-capped.
- **Walking dust — NEW** (`vfx/feedbackPresets.ts` + `CombatFeedbackFx.ts` +
  the same `VfxSystem` ground pass): a small soft puff kicked up behind a moving
  foot that GROWS + RISES + fades (size climbs, positive gravity, alpha → 0).
  Stride-gated per entity (a still body never accumulates the stride distance,
  so it is silent while idle) and paced by a min interval, frame-rate
  independent; a teleport/respawn jump re-baselines without emitting.
- **Cast-ground marks — NEW** (`vfx/feedbackPresets.ts` + `VfxSystem` abilityCast):
  an ability stamps a fading dark scorch decal at its land point (the ground
  `point` when it targets the floor) or under the caster, via the pooled +
  hard-capped `GroundDecalPool` (same fade discipline as the blood splats).

| ID | Item | Test ID | Category | Status |
|----|------|---------|----------|--------|
| cj-c22 | Blob shadow: one soft disc follows every live body (champion/flower), footprint-scaled and sitting just above the floor; a body that dies/despawns frees its disc (reused, not re-allocated); pool hard-capped; a non-finite position parks nothing; dispose tears every disc down. Positions come from `frameBus` + `ctx.entityPos`, never ChampionView | vfx-shadow | unit | done |
| cj-c23 | Walking dust is velocity/stride-gated: silent while standing still, fires once the body strides > the stride distance, and a teleport/respawn jump emits nothing; the puff GROWS (size climbs, never pop-shrinks), RISES (positive gravity) and fades to full transparency | vfx-walk-dust | unit | done |
| cj-c24 | An ability cast stamps a fading dark ground scorch at its land `point`, falling back to the caster position when it targets no ground point; pooled + hard-capped (a mesh, not a particle system, so the abilityCast particle-count contract is unchanged) | vfx-cast-decal | unit | done |
| cj-c25 | The LIGHT impact tier reads as a real hit — a bright, big-enough (peak ≥ 1.0u) additive flash + ≥ 30 stretched contact sparks — while staying ≤ 3 frames, under the overdraw ceiling, and BELOW the heavy tier (which keeps its ground ring) | vfx-spark-read | unit | done |

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
- **Knockback / knockdown** (`sim/combatFeel.ts` + `sim/combat/damage.ts` +
  `MovementSystem`): a landed hit sets `nav.override {kind:"knockback"}` away from
  the source, integrated by `moveWithCollision` (slides along/stops at walls,
  clamps to the boundary — never clips).
  ⚠️ 這一段在 GH#193 之後**整個換掉了**,舊法(`impact ≥ 70`、
  `clamp((impact/100)*1.6*typeMult, 0, 4)`、physical/magic/true 係數、blocked
  ×0.35)已經**退休**,一個都不剩。現行法則(全部後台可調,`config.combat-feel@1`):

      pct  = 這一擊的傷害 / 受傷單位的**最大生命**
      pct < minPct(0.05)          → 完全不推
      raw  = maxBodies(10) × min(pct,1) × bodyUnit(1.0)
      raw  = max(raw, 作者的 hitFeel.knockbackMag)   ← 覆寫是**下限**,不是取代
      out  = max(0, raw − 攻守雙方目前距離)

  A heavy UNBLOCKED physical/true hit (impact ≥ 170) still roots the victim prone
  for 14 ticks then getup — knockdown 的門檻**沒有**跟著改成百分比制。
  ⚠️ 覆寫是「下限」而不是「取代」是量出來的,不是品味:出貨的 115 位英雄裡
  **114 位**的普攻帶著 `hitFeel.knockbackMag`(90 位是 **0**、24 位 ≤ 0.45),
  而近戰接觸距離是 1.3 —— 覆寫若「取代」法則,`max(0, 0.45 − 1.3) = 0`,
  於是 #193 這條新法則對**每一位英雄的普攻都完全無效**,連一擊打掉 100% 生命
  的爆擊都推不動一格。守衛在 `sim/knockbackRoster.test.ts`(出貨內容,不是骨架
  dummy)。
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
| cj-s13 | Knockback distance = % of the victim's MAX hp, minus the current gap (GH#193) | cj-knockback-mag | unit | done |
| cj-s14 | A hit below `minPct` of max hp never shoves, however close | cj-knockback-chip | unit | done |
| cj-s16 | Knockback respects the zone boundary — a big shove never clips outside | cj-knockback-noclip | unit | done |
| cj-kb1 | THE DISTANCE SUBTRACTION: same hit, same victim — melee shoves, ranged does not | cj-knockback-range | unit | done |
| cj-kb2 | The denominator is MAX hp, not current hp — a nearly-dead victim is not launched | cj-knockback-maxhp | unit | done |
| cj-kb3 | 殭屍王 (6000 hp) shrugs off the blow that shoves a 600 hp champion | cj-knockback-boss | unit | done |
| cj-kb4 | The three knockback numbers are operator-tunable (raising `minPct` switches a shove off) | cj-knockback-config | unit | done |
| cj-kb5 | `maxBodies` is the ceiling: a 100%-hp one-shot pushes 10 bodies, not 100 | cj-knockback-cap | unit | done |
| cj-kb6 | 出貨內容普查:**每一位**已註冊英雄的普攻,一發打掉 100% 生命時真的推得動(114/115 位帶著 `hitFeel.knockbackMag`,覆寫必須是下限不是取代) | kb-roster-basic | regression | done |
| cj-kb7 | 儀器:沒有作者覆寫的同一發傷害推得動 —— 證明 kb-roster-basic 紅的時候是覆寫的錯,不是法則或儀器的錯 | kb-roster-instrument | unit | done |
| cj-s17 | A heavy unblocked hit emits `knockdown` | cj-knockdown | unit | done |
| cj-s18 | Knockdown counts down to getup in exactly N ticks | cj-knockdown-getup | unit | done |
| cj-s19 | A knocked-down victim is rooted while prone, then moves again on getup | cj-knockdown-root | unit | done |
| cj-s20 | A blocked heavy hit knocks back but does NOT knock down | cj-knockdown-blocked-none | unit | done |
| cj-s21 | A committed melee swing that connects with nothing emits `whiff` + a forward lunge | cj-whiff-lunge | unit | done |

## Sim deepening — unified ImpactProfile + crit/guard emphasis + hitstun (task #3, audit P0 + hitstop P1s)

Closes the audit's P0 ("no single hit-weight drives all channels") and two hitstop
P1s ("crit/guard-break emphasis" + "hitstun as a victim-only recovery-lock"). All
additive, deterministic (integer/branch only — purity gate green), balance-neutral.

- **Unified `ImpactProfile`** (`sim/combat/damage.ts`): `applyImpact` computes ONE
  hit-weight once and rides it on the **`hitImpact`** event as `profile`, so every
  downstream channel (sim + client) reads a single source of truth instead of
  re-classifying "how hard did that land" with its own constant. Shape (the seam
  the client stage consumes verbatim):
  `profile: { tier:"light"|"medium"|"heavy"|"crit", hitstopTicks:int, hitstunTicks:int, knockbackDir:{x,z}, knockbackMag:number, isEX:bool, isBlock:bool, isCounter?:bool }`.
  `tier` = `crit` if crit, else `heavy` if guardBreak or impact≥120, else `medium`
  if impact≥60, else `light`. `knockbackDir/Mag` mirror the shove the sim actually
  applies (0 when below the shove threshold). `isBlock` = the event's `blocked`.
  `isEX` reads a damage-origin marker (`ex:` / `:ex:`); no content emits it yet, so
  it is `false` today — the FIELD ships now so the client stage binds it, and the
  EX-origin tagging follow-up (audit P2, ability/cast layer) lights it up.
  `isCounter` is reserved (optional) for the counter-hit follow-up.
- **Crit / guard-break hitstop emphasis** (`sim/combat/damage.ts`): on top of the
  base `clamp(2+floor(impact/55),2,6)` freeze, a **crit** adds **+2 ticks** (the
  distinct "that HURT" hold) and a **guard shatter** floors the freeze to the new
  **counter cap (8)** — the biggest 破碎 beat — even on an otherwise light impact.
  Emphasis is clamped to the cap so a max-impact crit stays 8. Both fighters share
  the emphasised freeze; deterministic integers, folded into the digest.
- **Victim-only hitstun** (`sim/combat/damage.ts` + `HitstopSystem` + `SimWorld`):
  a new `world.hitstun` map — a victim-ONLY action-lock that OUTLASTS the shared
  hitstop (`hitstopTicks + 2 + floor(impact/40)`, cap 12), so the attacker recovers
  first (frame advantage) while the defender is rooted out of auto/cast but may
  still be shoved / walk. `BasicAttackSystem` + `CastResolveSystem` PAUSE on it
  (like hitstop — no interrupt/refund, cadence/DPS unchanged); `MovementSystem` is
  NOT gated so the knockback slide still plays. Aged by `hitstopDecaySystem`
  (exact-N), cleaned in `removeEntity`, and mixed into `digest()` for replay
  parity. Fixes "medium hits give the victim a free counter-slide" — only the
  ≥170 knockdown locked them before.

| ID | Item | Test ID | Category | Status |
|----|------|---------|----------|--------|
| cj-s22 | `hitImpact` carries a unified `ImpactProfile` (tier/hitstop/hitstun/knockback/flags) matching the world state the sim applied | cj-impact-profile | unit | done |
| cj-s23 | Profile `knockbackDir/Mag` mirror the applied shove (direction + magnitude) | cj-profile-knockback | unit | done |
| cj-s24 | Tier derives light/medium/heavy by impact, crit overrides to the top tier | cj-profile-tier | unit | done |
| cj-s25 | A crit freezes distinctly longer (+2 ticks) than the same non-crit hit | cj-hitstop-crit | unit | done |
| cj-s26 | A guard shatter floors the freeze to the emphasis cap (~8), even on a light impact | cj-hitstop-guardbreak | unit | done |
| cj-s27 | Emphasis never exceeds the counter cap (crit on a max-impact hit stays 8) | cj-hitstop-cap | unit | done |
| cj-s28 | Hitstun gates the victim's basic attack past the shared hitstop, then releases | cj-hitstun-gate-basic | unit | done |
| cj-s29 | Hitstun release: the victim swings again once the action-lock ends | cj-hitstun-release | unit | done |
| cj-s30 | Hitstun pauses an in-progress cast without interrupting or refunding it | cj-hitstun-gate-cast | unit | done |
| cj-s31 | A real medium hit locks the victim LONGER than the attacker (frame advantage) | cj-hitstun-frameadv | unit | done |

## Parameterized hit-feel — per-champion / per-ability overrides (task #133)

Builds on the unified ImpactProfile: every field now has a DAMAGE-DERIVED
DEFAULT (scaled by tier/impact), and a champion basic-attack or an ability may
ship an OPTIONAL, all-optional `hitFeel` block that overrides individual fields;
unset → default. Deterministic (content is a fixed input — no rng/wall-clock).
Additive & balance-neutral (no damage number / cooldown changes).

- **Expanded `ImpactProfile`** (`sim/combat/damage.ts`): keeps the gameplay
  fields (tier/hitstopTicks/hitstunTicks/knockbackDir/knockbackMag/isEX/isBlock/
  isCounter?) and ADDS cosmetic hints the client channels consume, each with a
  tier/impact-derived default: `shakeMag`, `shakeStyle` ("directional"|"omni"),
  `sparkKind` ("hit"|"heavy"|"counter"|"block"|"magic"|"ice"), `flashColor`
  ([r,g,b]), `flashMs`, `camKick`, `exFreeze`.
- **Default curve** (`sim/combat/hitFeel.ts`): shake/flashMs/camKick step up per
  tier (light<medium<heavy<crit); sparkKind + flashColor derive from damage
  type / block / EX (block→cool-white flash + "block" spark; magic→"magic";
  heavy/crit→"heavy"); EX bumps shake, floors camKick, arms an `exFreeze`.
- **Optional content `hitFeel`** (`content/schema/ability.ts` `zHitFeel`, added to
  ability + champion basic-attack): all fields optional, bounds match the sim
  override caps. Mirrors `HitFeelInput` in `sim/combat/hitFeel.ts`.
- **Merge in `applyImpact`**: the firing source's hitFeel (looked up from the
  damage `origin` — "basic"→champion, "ability:<id>"→ability) overrides the
  GAMEPLAY defaults (hitstop/hitstun/knockbackMag, clamped) and the cosmetic
  hints, then the merged profile rides on `hitImpact`. Hitstun override can never
  drop below the shared hitstop (frame-advantage invariant preserved).

| ID | Item | Test ID | Category | Status |
|----|------|---------|----------|--------|
| cj-s32 | Default cosmetic curve scales shake / camKick with the damage tier | cj-hf-default-scales | unit | done |
| cj-s33 | Default spark identity derives from damage type / block / EX | cj-hf-default-derive | unit | done |
| cj-s34 | `mergeCosmetics` overrides only the provided fields, else identity | cj-hf-merge | unit | done |
| cj-s35 | An ability with explicit `hitFeel` overrides the damage-derived default (hitstop/shake/spark/…) | cj-hf-ability-override | unit | done |
| cj-s36 | A champion basic-attack `hitFeel` overrides the default on origin "basic" | cj-hf-basic-override | unit | done |
| cj-s37 | Without `hitFeel` the profile falls back to the damage-derived default | cj-hf-default-fallback | unit | done |
| cj-s38 | Same seed + inputs replay a byte-identical profile (determinism) | cj-hf-determinism | unit | done |

### `hitFeel.flashColor` / `.flashMs` — closing a SILENT no-op (false-completions pass, 2026-07-24)

Both fields were schema-accepted, sim-replicated on every `hitImpact`, and
decoded into the client's `ImpactProfile` — then **thrown away**:
`planImpactFeedback` rebuilt `victimFlash` from `flashColorFor(dmgType)` +
`TIER_FX[tier].flashMs` unconditionally. **30 ability docs shipped dead
content**, 13 of them on the live 48-champion roster. Nothing errored; the
player simply saw the generic damage-type flash forever.

Resolved as HONOUR (not delete): the fields could not be deleted without editing
30 `content/abilities/*.json` docs, `zHitFeel` being `.strict()`.

**The layering** (the thing that had to be got right — flash colour carries the
physical-vs-magic damage-type read, which is real combat legibility):

1. **Damage type stays the default and the majority case.** No champion doc
   authors a flash — all 112 with a `hitFeel` author only
   hitstop/shake/knockback — so **every basic attack and every un-authored
   ability keeps the measured red/magenta palette**. The coarse read is intact
   on ~99% of hits in a match.
2. **An authored ability names its element instead** (holy gold, ice blue, fire
   orange, void violet). That refines the read rather than removing it: the
   player already knows the source of a named R they just watched cast.
3. **Alpha is deliberately NOT authorable** — it is the tier's hit-weight, and
   `ui/combatText.ts`'s black-ring contrast analysis assumes it.
4. **A legibility guard sits between 2 and the screen.** The overlay draws with
   ALPHA_COMBINE, so a pale authored colour is literally invisible on a pale
   model — 8 of the 30 authored hues were in that band (worst:
   `[0.85,0.92,1.0]`, max Δ 0.06 vs red's 0.45). `legibleFlashColor` raises the
   chromatic spread to 0.65 (the magenta default's own spread — "no authored
   colour may be less chromatic than the palest one the measurement pass
   accepted") by saturating about the max channel, which preserves the hue
   family exactly. Greyscale input has no hue to save and falls back to red.

**Also deleted, not re-wired:** the sim's `FLASH_PHYSICAL/MAGIC/TRUE/BLOCK` +
`FLASH_MS_BY_TIER` — a second flash palette that rode every `hitImpact` and had
never reached a pixel. The flash pair is now **authored-or-absent on the wire**,
and that presence/absence IS the signal the client reads. `flashMs` is clamped
to 30–260 ms in `mergeCosmetics` and `zHitFeel` now rejects out-of-band values
at authoring time (was `max(1000)`, a value the channel could never honour).

| ID | Item | Test ID | Category | Status |
|----|------|---------|----------|--------|
| cj-s39 | Sim emits NO flash default — `flashColor`/`flashMs` absent unless content authored them | cj-hf-flash-authored-only | unit | done |
| cj-s40 | An authored flash rides the wire verbatim, clamped into the strobe-safe ms band | cj-hf-flash-authored-passthrough | unit | done |
| cj-s41 | An authored `flashColor`/`flashMs` reaches `victimFlash` instead of the tier default | juice-flash-override | unit | done |
| cj-s42 | Nothing authored → the measured damage-type palette, every tier (the read survives) | juice-flash-default-survives | unit | done |
| cj-s43 | Alpha is never authorable — it stays the tier's hit-weight | juice-flash-alpha-not-authorable | unit | done |
| cj-s44 | Washed-out authored hues are saturated, not recoloured; greyscale falls back to red | juice-flash-legibility | unit | done |
| cj-s45 | Every REAL `content/abilities/*.json` authored flash reaches `victimFlash` (≥30 docs) | juice-flash-docs-reach-victim | integration | done |
