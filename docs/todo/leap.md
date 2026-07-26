# Leap — parabolic jump primitive (task #247) — TODO

`packages/shared/src/sim/movement/leap.ts` + `sim/systems/LeapSystem.ts`, the `leap` EffectDef
(`content/schema/effect.ts`), the `h` wire channel (`protocol/schema.ts` → `net/snapshot.ts` →
`net/InterpolationBuffer.ts` → `render/views/ChampionView.ts`), and the `tpl-leap-strike`
Skill-Forge template.

Rebuilt from the source map's own JASS, not invented: **ten** `SetUnitFlyHeightBJ(-k·Pow(i-m,2)+A)`
sites across **nine** abilities (A0JZ owns two arcs, j:30802 + j:30990). Every one satisfies
`A = k(m-1)²`, so they all collapse to the single normalised parabola `h = 4·A·u·(1-u)` that the
primitive ships. Bound abilities: `godie-hpb1.e` (A0G3), `godie-hart.w` (A0UX),
`godie-u00n.r`/`godie-u00o.r` (A0RZ, vertical inPlace), `godie-hapm.w` (A0U1, `applyTo: "target"` —
the victim flies, not the caster).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| leap-01 | the normalised arc reproduces all TEN JASS `(k, m, A)` triples at every integer index | leap-jass-arc | unit | done |
| leap-02 | same seed ⇒ byte-identical digests with a leap in flight, and the leap is genuinely inside the hash | leap-determinism | determinism | done |
| leap-03 | no trig / rng / clock reachable from the arc sources (static ban) | leap-no-trig | determinism | done |
| leap-04 | a leap CROSSES a pillar a walker cannot pass, and lands on the requested point | leap-crosses-terrain | integration | done |
| leap-05 | a blocked / out-of-bounds landing re-aims at TAKEOFF and touches down legally, with no landing-tick snap | leap-landing-legal | integration | done |
| leap-06 | hitstop freezes the arc and it resumes on the exact same curve | leap-hitstop | integration | done |
| leap-07 | death mid-air drops the body to the floor and fires NO landing effects | leap-death-midair | integration | done |
| leap-08 | the landing detonates `onLand` on the landing tick, centred on the landing point | leap-detonate | integration | done |
| leap-09 | reach is bounded UPSTREAM at cast resolution — a ground cast clicked far past its range lands at the range, not at the click | leap-reach-upstream | integration | done |
| leap-10 | a landing payload may MUTATE the entity set (`spawnProjectile` in `onLand`) without corrupting the arc walk | leap-payload-mutates | regression | done |
| leap-11 | detonation order is uniform: a re-leap fired by a landing starts at `elapsed 0` regardless of spawn order | leap-detonate-order | regression | done |
| leap-12 | fly height reaches the renderer and interpolates (Catmull-Rom), and a body killed at apex SNAPS down | leap-render-height | unit | done |
| leap-13 | the editor form renders a REAL leap card (typed widgets + recursive `onLand`), not just a union tag | leap-editor-form | unit | done |
| leap-14 | the editor's live preview lists a leap-only ability instead of showing an empty effect list | leap-editor-preview | unit | done |
| leap-15 | wire the caster model-scale ramp (A0U8 巨神一擊: 130→190 % over 7×0.04 s, restore to the hero's 120 % base) — needs a real EffectDef + ramp store; the #247 `sc` channel was removed as dead | leap-caster-scale | integration | pending |
