# Ability VFX porting (48-roster) — #123 / #79 / #50 / #98 / #131

The top-priority ability-VFX wave. 92% of abilities (508/554) shared ONE generic
fire placeholder (`fx.ember-bolt-cast`); 依文潔琳's ice spells rendered as fire;
there was no reusable VFX-primitive library; 11 imported effect models have zero
geometry; and a persistent bright-white burst was stuck top-right of the arena.

Scope = the 48 whitelisted champions (`data/curation/whitelist.json`.champions),
i.e. their 240 abilities. Owned surface: `apps/client/src/render/vfx/**` (the new
library + bindings), `content/abilities/*.json` (vfxKey field only),
`content/vfx/**`, plus the minimal #131 guard in `apps/client/src/vfx/VfxSystem.ts`.

## The library (`apps/client/src/render/vfx/`)

- `primitives.ts` — 8 PURE parameterised primitives → a `vfx@1` VfxDoc:
  **nova · explosion · shockwave · tornado · beam · locust-swarm (swarm)** (the
  six named WC3 archetypes) + **slash · pulse** (the melee/aura archetypes this
  roster leans on). No Babylon import → the same code ships at runtime AND
  generates the authored docs (preview == ship). Params: color, scale, count,
  lifetime, speed, blend, texture, coreAlpha, gravity.
- `elements.ts` — 13-element colour/blend palette (fire/ice/lightning/wind/earth/
  holy/void/physical/nature/arcane/blood/ki/sound). The primitive gives the
  SHAPE, the element gives the COLOUR.
- `artParams.ts` — per-invocation art params (#50): scale/tint/alpha/count/
  timeScale transform the doc; heightY/facingDeg surface for the play site.
  `applyArtParams` is identity when no knob is set.
- `bindings.ts` — the 240-ability roster table `(element, primitive)` per slot;
  slot decides size (R/EX scaled up). `curatedDocs()` generates the distinct
  `content/vfx/fx.prim.*.json` palette (94 docs, ~2.5× reuse); `abilityVfxKeys()`
  drives the content re-point.

## Binding result (#79)

240 / 240 roster abilities re-pointed off `fx.ember-bolt-cast` onto element-
appropriate primitives. 依文潔琳 (godie-n003): Q 凍結的大地 → `fx.prim.ice.shockwave`,
E 暗夜吹雪 → `fx.prim.ice.nova`, R 世界終結 → `fx.prim.ice.explosion-lg` (her ice
now reads cold/blue). Fire heroes (夏娜/莉娜/…) → fire; lightning (皮卡丘/剎那/…) →
lightning nova/beam; wind (Saber 風王結界/涅吉/…) → tornado; dark (賽菲洛斯/巴恩/…)
→ void; blade (索隆/呂布/…) → slash; etc.

## Zero-geometry effect models (#98)

The 11 imported effect glb models with zero geometry are effect EMITTERS whose
particle systems never converted to mesh — the glb was always the wrong
representation. They are superseded by native particle primitives (no empty
emitter ships to any roster ability):

| empty model (flag in model-budget report) | native primitive replacement |
| --- | --- |
| imported.blackhole | `void` nova / explosion (implosion) |
| imported.boomnl (0 tris) | `explosion` |
| imported.divinering | `holy` nova (ring) |
| imported.enchant | `arcane` pulse |
| imported.demonfilth | `void` swarm |
| imported.heronarutos4effect | `ki` nova |
| imported.lasercannonfinalred (0 tris) | `beam` |
| imported.lavabreathdamage | `fire` beam / explosion |
| imported.darkbreathdamage | `void` beam |
| imported.babyface | (comedic; `arcane` pulse if bound) |
| imported.collision | physical `shockwave` (impact) |

## Root cause — #131 (bright-white burst stuck top-right)

`VfxSystem.handleEvent` `abilityCast` guarded its caster position with only
`if (!pos) break` — but `entityPos` returns a truthy `{x:NaN,z:NaN}` for a
mid-spawn / un-interpolated champion. `play()` already refused a non-finite
emitter, but the EX-cast `layeredPop` (the brightest white-hot ADDITIVE composer
core) did NOT — so an EX cast by a not-yet-posed champion parked a persistent
white burst at the GPU-clamped screen corner and re-fired it every cast. The
prior P1b guard hardened play()/posFromEvent/hitImpact but left this cast-time
composer path open. Fix: guard the single chokepoint (`layeredPop`) so no
composer fire is ever parked off-world, and tighten `abilityCast` to isFinitePos.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| av-01 | 8 primitives (nova/explosion/shockwave/tornado/beam/swarm/slash/pulse) each build a schema-valid vfx@1 doc, render on Babylon, preserve colour identity, and honour scale/count params | ability-vfx-primitives | unit | done |
| av-02 | per-invocation art params: scale/tint/alpha/count/timeScale transform only their field, identity when unset, stay schema-valid; spatial height/facing resolve separately | ability-vfx-artparams | unit | done |
| av-03 | all 240 roster abilities bound off the fire placeholder; 依文 Q/E/R resolve to an ICE primitive that reads cold; R/EX scale up vs Q/W/E; every curated doc schema-valid with id==vfxKey | ability-vfx-bindings | unit | done |
| av-04 | #131: an EX abilityCast whose caster pos is NaN/Infinity fires NO composer (no white burst parked off-world); a finite pos still fires the ex pop | ability-vfx-131 | unit | done |

## The FAITHFUL layer beneath the primitives (#98) — `PRE2` → Babylon

`primitives.ts` is the STYLISED rebuild (a readable nova/tornado/beam shared by
hundreds of abilities). It cannot be faithful, because a WC3 effect is not a
shape — it is a `ParticleEmitter2` parameter block bound to an attachment point.
So `render/vfx/` gained the layer under it, which makes an imported effect DATA:

- `w3xEmitter.ts` — the `PRE2` block 1:1 in TypeScript (`W3xParticleEmitter`,
  field names mirroring the binary and `w3xlib.particles`) plus a PURE
  `w3xEmitterToVfxDoc()` onto `vfx@1`, which the SHIPPED
  `vfx/particleFactory.toParticleSystem` already renders. Every non-exact
  decision is returned as a machine-readable `W3xMappingNote`, so what was
  approximated is auditable instead of buried in prose. Units: `W3X_MODEL_UNIT`
  = 1/36 (the glb exporter's factor) — NOT the `11/600` gameplay-range constant.
- `attachment.ts` — WC3 attach strings → glb joints. `right,hand` is ONE
  attachment (correction M6); matching is on a normalised TOKEN SET derived from
  a census of all 337 `.glb` files (6 naming conventions, `Head - Ref`,
  `OverHead Ref`, trailing spaces); `*Ref` attachment points beat deforming
  bones; an unknown attachment falls back to `origin` exactly as WC3 does (the
  map's own `targetAttach = "cheat"` typo); `none.mdl`/blank stays invisible.
- `emitterBudget.ts` — 12 champions × up to 20 emitters per model is 240 draw
  calls. Merge-identical (lossless) → shape-aware even subsample of a family →
  rate thinning, in that order, with the top emitter never dropped.
- `W3xEmitterRig.ts` — the Babylon runtime: multi-emitter effects as ONE thing,
  attachment parenting, the flags a doc cannot carry (`modelSpace` → `isLocal`,
  `xYQuad`, line emitters, `KP2E`/`KP2V` replayed onto `emitRate`), pooling, and
  disposal on every exit path including the #131 orphaned-anchor case.
- `w3xEmitterAudition.ts` + `public/w3x-emitter-audition.html` — the LOOK-AT-IT
  step. Real pipeline, no stubs, with the approximation ledger and the budget's
  actual decisions on screen. It found two real bugs a green test suite did not.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| av-05 | `PRE2` → `vfx@1` reproduces the two hand-decoded golden emitters (`DivineRing` 1/20, `flamessmoke` 1/4 and 3/4): lifespan/rate 1:1, speed±variation → emit power, half-extent emitter radius, 3 colour/size segments at 0/timeMiddle/1, gravity INVERTED, latitude read as degrees; every produced doc is schema-valid and builds a real ParticleSystem | w3x-emitter-parity | unit | done |
| av-06 | WC3 attach strings resolve on real glb joint names: `right,hand` never splits into two attachments, all 6 naming conventions normalise to one key, `*Ref` beats `Bone_*`, an unknown attachment falls back to `origin` like WC3, rig helpers (`handslot.l`, `IK-foot.l`) never masquerade as attachments, `none.mdl` stays invisible, repeated lightning ids survive | w3x-attach-tokens | unit | done |
| av-07 | the budget holds 12 champions × a 20-emitter effect under the screen caps, merges identical emitters losslessly, thins a RING evenly instead of cutting an arc, degrades monotonically as the arena fills, and never drops an effect to zero emitters | w3x-emitter-budget | unit | done |
| av-08 | the rig plays multi-emitter effects, binds them to the resolved joint, applies modelSpace/xYQuad/KP2E/KP2V, and leaves ZERO live systems on every exit path (stop, cancel, duration, maxEffectSec, orphaned anchor, dispose); a CONTINUOUS effect replayed from the pool still emits | w3x-emitter-runtime | unit | done |

## 球體 / 蝗蟲群 / 粒子 — the three families the owner named, as CONTENT

> 「[技能戰鬥效果] 及 [球體/蝗蟲群/粒子特效] 要記得明確比照原 w3x 實作」

The layer above rebuilds ONE emitter. A WC3 effect is N emitters at N PIVOTS,
hanging off ONE attachment point, alive for as long as the thing that owns it.
That composite is what turns 20 identical DivineRing emitters into a RING rather
than one blinding column — so it ships as DATA, generated, never hand-authored:

- `apps/client/src/render/vfx/w3xFamilies.ts` — PURE. Family classification
  (SHAPE first, then use: a buff-attached mote storm is a 蝗蟲群, and still
  attaches), the swarm-shape measurement (concurrency ≥ 90 · granularity ≤ 0.4 ·
  extent ≥ 100 WC3 units · lifespan ≤ 3 s · non-directional — thresholds read off
  the ranked list of all 238 emitters, not chosen by taste), the CC0 texture
  substitution rule ported byte-for-byte from `extract_particles.py` so this
  layer and the 282 extractor docs pick the same sprite, and `buildW3xFamilies()`
  → docs + manifest.
- `apps/client/src/render/vfx/w3xFamilyRuntime.ts` — PURE bridge: manifest effect
  → `W3xEffectSpec`. Expands a 蝗蟲群 LAYOUT into the ring of member instances
  WC3 spawns (count per level, radius, stagger, tint, scale), each a normal
  emitter with its own pivot — so the existing budget sees a ring and subsamples
  it evenly, with no rig change.
- `apps/client/scripts/gen-w3x-families.ts` — the generator. Reads ONLY
  `tools/w3x-import/out/emitters/{EMITTERS,MODEL_REFS}.json` (byte-exact PRE2,
  294/294 blocks fully consumed). Writes 118 `content/vfx/fx.w3x.*.json` +
  `content/assets/vfx/w3x-families.json`.
- `apps/client/src/render/vfx/w3xFamilyAudition.ts` +
  `public/w3x-family-audition.html` — auditions the SHIPPED CONTENT over HTTP,
  not a transcription of it. Nothing on that page is typed in by hand.

Census: **34 effects / 118 emitter docs — 球體 10 · 蝗蟲群 4 · 粒子 20.**
Scope = every model whose render is WRONG today (`pure-emitter` and
`emitter-dominant-hybrid`: the glb is a 288 B–5 KB shell) plus every model with a
persistent attachment reference (球體) plus every swarm-shaped one (蝗蟲群). The
55 `mesh-and-emitter-hybrid` models render their mesh and are missing only the
particle layer — the same fix at 4× the size, deliberately left for after the
binding lane rather than smuggled in here.

ADDITIVE: not one of the 153 `fx.*` presets or 282 `godie-*` docs was edited or
deleted. What each new effect is meant to REPLACE is declared per effect in
`supersedes`, for the binding lane to switch.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| av-09 | a WC3 effect's emitters land as ONE family effect with the model's real `PIVT` layout, its attach point taken from the PERSISTENT reference (DivineRing is `chest` on the `Asph` orb, not `origin` from A10W's 3 one-shot slots), `ambient` set from the reference kind, and the real `Textures\*.blp` recorded per layer beside the CC0 stand-in | w3x-family-build | unit | done |
| av-10 | the 蝗蟲群 classifier measures the ORIGINAL parameters: `Boomnl` (1,000 concurrent motes, 200-unit spread) is a swarm; `1hswd_01`'s blade shimmer (1,000 tinier motes in a 50×3 sliver) is NOT; `DivineRing` (20 concurrent) is NOT; latitude 555/900 clamps to a full sphere | w3x-family-shape | unit | done |
| av-11 | `A0IB 七夜怪談` ships its LAYOUT from the binaries (7/12/17/22 per level · 0.05 s stagger · `aare` 600 → 11 world units · 74 s · `usca` 0.6 · `uclg`/`uclb` 0 → red) and REFUSES to invent member art; given a named stand-in it expands to N distinctly-pivoted, distinctly-ided members with the tint and scale applied | w3x-family-swarm | unit | done |
| av-12 | a staggered member is held back on the RIG CLOCK (not `setTimeout`), is never merged away by the budget, fires a deferred burst at its own slot, and the effect's drain waits for it | w3x-swarm-stagger | unit | done |

### Known deviations, stated rather than smoothed over

1. **Texture 0 % faithful.** 73 of 81 distinct emitter textures live in
   `war3.mpq`. Geometry, timing, colour and alpha are ported; the sprite is a
   CC0 stand-in. True path per layer in `wc3Texture` (#81 / #116).
2. **14 of 34 effects have particles bigger than a champion**, up to
   `LasercannonfinalRED` at 21.6 world units (12.7×). That is the map's own
   `segmentScaling`, ported unchanged and FLAGGED in each effect's `notes`
   ([[ggd-faithful-import-over-rescale]]).
3. **The swarm ARRANGEMENT is an assumption**, the numbers are not. WC3's
   locusts spawn on the caster and fly out through the `aare` disc; this places
   them evenly on its rim. Reported in `problems`, every play.
4. **A swarm over `MAX_SYSTEMS_PER_EFFECT` reads differently.** The budget keeps
   6 evenly around the ring and folds the rest's emission into them: correct for
   a continuous ring (DivineRing), WRONG for discrete creatures (6 dense members
   instead of 22 sparse ones). Surfaced in `problems` rather than hidden.
5. **`HolyAwakening` is filed as 粒子, not 球體.** The archaeology calls A0DZ
   風王結界 a 常駐 weapon attachment, but the object data has it on
   `ability.casterArt`, which WC3 destroys when the cast ends. Field semantics
   win over prose; if the JASS says otherwise the binding lane should override.

### Handoff — things this lane must NOT fix itself

- **`packages/shared/src/content/bundle.test.ts` hard-codes the total doc count**
  (`expect(total).toBe(1598)` at :162 and `expect(perDocSource.reads).toBe(1611)`
  at :258). Adding the 118 family docs makes them 1716 / 1729. Any lane that adds
  content breaks these; the numbers belong to the shared lane.
- **`packages/shared/src/content/vfxParticles.test.ts` scans `content/vfx/`
  itself and skips only `_index.json` by name**, while `fsStore` skips every
  `_`-prefixed sidecar. That mismatch is why the composite lives at
  `content/assets/vfx/w3x-families.json` instead of `content/vfx/_w3x-families.json`.
- **Binding.** `vfxKey` is still one string and `ability@1` still has no
  `attachedModels` / `missile` / `beam` (L0 in `_vfx-fidelity-w3x.md`). Every
  effect here carries `usedBy` (the w3x object ids and fields) so the bind is a
  lookup, not another archaeology pass.

## The combat renderer's PATH to the rig (task #182/#183 → in-match)

The two layers above ship the rig and the content; the binding lane says which
30 abilities are entitled to the map's own art. None of that was reachable from
a match: `VfxSystem` played a promoted cast the way it plays a primitive — each
doc pooled separately and collapsed by `frontLoadDoc` into ONE capped burst —
so the authored emission stream, the KP2E/KP2V tracks, the effect-wide budget
and the per-effect lifetime were all allocated and never used.

- `apps/client/src/vfx/W3xCastFx.ts` — the branch. The ONLY thing under `vfx/`
  that knows the rig exists. Imports `render/vfx/W3xEmitterRig` DIRECTLY (the
  barrel's purity constraint sanctions exactly this; it is a static import
  because a dynamic one would make the first promoted cast draw nothing on the
  frame it fires) and constructs the rig LAZILY, so a match with no promoted
  cast allocates no rig, no pool and no `ParticleSystem`.
- `apps/client/src/vfx/VfxSystem.ts` — `playCastVfx()`, a four-rung ladder that
  cannot end in silence: rig → pooled w3x docs (cap reached) → the `fx.prim.*`
  key the row overrode (art missing) → a hit spark. An ability with no
  promotion is untouched and plays its one primitive exactly as before.
- `apps/client/src/render/vfx/w3xAbilityArt.ts` — `primitiveFallbackFor()`
  recovers rung 3 from `bindings.abilityVfxKeys()`. Undefined for the 17
  off-roster rows, whose champions cannot be picked in a match.

### Cost, measured against the real `content/vfx` docs

`emitterBudget` divides the screen budget by the effects live AT THAT MOMENT and
a live effect then keeps its allocation, so a SEQUENCE of casts sums past the
cap: 12 successive `boomnl` (78-04 死亡噴射肘擊, 3,400 particles for one cast)
plan to **19,624 particles — 2.45× the 8,000 budget**. `W3xCastFx.play()` closes
that by pre-planning each effect and refusing it when the running committed
total would exceed `SCREEN_PARTICLE_BUDGET` or `SCREEN_SYSTEM_BUDGET`. 12
simultaneous casts of the same family, all 15 families, after the bound:

| | admitted of 12 | planned particles | systems |
| --- | --- | --- | --- |
| `boomnl` (particle-bound) | 2 | 6,800 | 8 |
| `flamessmoke` (heaviest that fits) | 12 | 6,144 | 48 |
| `holyawakening` (system-bound) | 10 | 1,570 | 60 |
| `gx` (lightest) | 12 | 240 | 12 |

Every row is inside 8,000 particles and 64 systems. A refused cast is not
dropped — it plays its primitive, one capped burst.

### #131 and #17

This path plays at a WORLD POSITION, never parented to a champion node, so
there is no anchor for #131's orphan case to strand. The replacement risk is
"an emitter nobody stopped", bounded three ways: the per-effect
`durationSec = 0.55 s`, the rig's `maxEffectSec`, and a WALL-CLOCK reap inside
`play()` that holds even if the frame loop stops pumping `tick()` entirely.
The rig's emitter meshes are empty, invisible and now also unpickable — no
geometry, so nothing here can become one of #17's oversized effect meshes.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| av-13 | a promoted cast reaches `W3xEmitterRig` (not the pooled path) and plays its whole emitter set; an unpromoted one never builds the rig at all; missing w3x art degrades to the `fx.prim.*` key the row overrode; the concurrency cap, the particle budget and the system budget each refuse a cast rather than drop it; 12 concurrent casts of every family stay inside 8000 particles / 64 systems; an effect ends on its own duration, on the wall-clock ceiling, and even with `tick()` never called; `dispose()` leaves ZERO systems | w3x-cast-rig-path | unit | done |
| av-14 | every champion Q/W/E/R slot has a standalone twin — the mirror sweep never skips a slot and never passes vacuously | ability-mirror-pairs | unit | done |
| av-15 | ZERO fields present in BOTH the embedded and standalone copy with different values, across all 452 pairs; every violation collected into one failure, not fail-fast | ability-mirror-no-conflict | regression | done |
| av-16 | only `schema` may live on one side of the mirror; a new standalone-only field means a fresh one-sided write path. (`icon` was exempt until 2026-07-24 — the AI icon batch had written 416 standalone-only values; exemption removed once the icon mirror was synced, see `docs/todo/icons.md`) | ability-mirror-one-sided | regression | done |
| av-17 | #79 mirror gap: no embedded `vfxKey` still parked on `fx.ember-bolt-cast` while its standalone twin moved to a `fx.prim.*` primitive | ability-mirror-vfxkey | regression | done |
