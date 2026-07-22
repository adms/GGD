# WC3 dummy-effect-units + orb/attachment → VFX/ambient (化繁為簡) — TODO

Task #9 wiring half. WC3 custom maps fake many "visuals" as gameplay units:

- **(A) dummy effect unit** — a Locust/invuln unit that only carries a MODEL and
  expires (`UnitApplyTimedLife`/`KillUnit`). NOT a summon: it's a one-shot VFX at
  a position. Route → a new **`spawnVfx`** `EffectDef` that emits a `vfxSpawn` sim
  event; the client's `VfxSystem` plays the matching `vfx@1` doc there.
- **(B) orb / attachment** — a model/particle bound to a hero attachment bone that
  persists. Route → the existing **ambient-vfx** channel (`config/ambient-vfx.json`
  → `AmbientVfx`), binding the effect's `vfx`/`ribbon` doc to the hero's modelKey.

Analysis + full per-ability worklist:
`tools/w3x-import/out/GoDieEX22s-src/DUMMY_ORB.md` (+ `DUMMY_ORB_MAP.json`).

This phase (additive, no new sim primitive): added the `spawnVfx` effect kind
(schema + sim EffectDef + effectRunner emit + `vfxSpawn` on the MatchRoom event
whitelist + client `VfxSystem` mapping); wired the **3** placeholder abilities
whose dummy uses a CUSTOM model with an already-extracted particle doc
(剎那 `77-04 真-雷光劍`→`godie-lightningtornado-p0`, 黑崎一護 `79-03 月牙天衝`→
`godie-deathwave-p0`, 桔梗 `02-04 百鬼夜行`→`godie-aquaspikeversion2-p0`) — real
damage kept, spawnVfx appended, in BOTH the embedded champion copy and the
standalone ability doc; and extended `ambient-vfx.json` with the **3** section-C
champion weapon-trail ribbon bindings that go live (剎那 `imported.mfls`, 索隆
`imported.heromusashimiyamoto`, 殺生丸 `imported.sesshomaru`).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| do-01 | `spawnVfx` EffectDef parses through `zEffectDef` (at self/target/point + optional durationSec); `.strict()` rejects unknown `at` / extra keys / missing vfxId; sim `EffectDef` ⇄ Zod stay structurally compatible | do-schema-parse | unit | done |
| do-02 | `effectRunner` spawnVfx emits a deterministic `vfxSpawn` event — two seeded runs produce identical events — with the resolved world point for `at` self/target/point, and mutates no world state (no damage/status/spawn) | do-runner-emit | determinism | done |
| do-03 | the 3 dummy placeholders each gained a `spawnVfx` to an EXISTING `vfx@1` doc AND kept their real per-rank damage, in the embedded champion copy (sim-registered) AND the standalone ability doc; docs validate | do-placeholder-wire | unit | done |
| do-04 | `ambient-vfx.json` parses as `config.ambient-vfx@1`; every bound `vfx` (incl. the 3 new ribbon bindings) resolves to an on-disk vfx/ribbon doc that carries a real `anchorBone` | do-ambient-bind | unit | done |
| do-05 | no dangling vfx refs: `spawnVfx.vfxId` is registered as a SOFT `vfx` ref by the ref-graph walker and resolves to an existing doc (`validateReferences`) | do-no-dangle | unit | done |
