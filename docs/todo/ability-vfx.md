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
| av-05 | every champion Q/W/E/R slot has a standalone twin — the mirror sweep never skips a slot and never passes vacuously | ability-mirror-pairs | unit | done |
| av-06 | ZERO fields present in BOTH the embedded and standalone copy with different values, across all 452 pairs; every violation collected into one failure, not fail-fast | ability-mirror-no-conflict | regression | done |
| av-07 | only `schema` may live on one side of the mirror; a new standalone-only field means a fresh one-sided write path. (`icon` was exempt until 2026-07-24 — the AI icon batch had written 416 standalone-only values; exemption removed once the icon mirror was synced, see `docs/todo/icons.md`) | ability-mirror-one-sided | regression | done |
| av-08 | #79 mirror gap: no embedded `vfxKey` still parked on `fx.ember-bolt-cast` while its standalone twin moved to a `fx.prim.*` primitive | ability-mirror-vfxkey | regression | done |
