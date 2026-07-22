# BabylonPreview — the rendering half of the preview seam (client engineer)

`PreviewController.ts` in this folder defines the contract and ships
`createSimPreviewController()`, a **renderless** implementation that already
runs the DATA half through the real engine: sandbox `SimWorld` + the real
`statPipeline` / `spawnChampion` / `resolveScaling` (no mocks). `PreviewPanel.tsx`
renders its output as structured text.

> **STATUS (2026-07-20):** `src/preview3d/` now ships REAL Babylon panels the
> PreviewPanel mounts per collection: model inspector (GLB + AnimationGroups +
> clipMap quick-play + collisionRadius overlay), vfx (data-driven
> `toParticleSystem` in `preview3d/particles.ts`), arena (zones/obstacles/
> spawns/decor), and the champion modelKey embed. Assets flow through the
> content-api `GET /content-api/assets/*` route. STILL OPEN below: the
> controller-shaped `createBabylonPreviewController` — in particular the
> `previewAbility` cast through a PreviewDriver `IntentFrame` (content-11) and
> reusing apps/client `render/*`. When that lands, fold the preview3d panels'
> scene ownership into it (keep `toParticleSystem` as the shared factory).

## What to build here

A `createBabylonPreviewController(): PreviewController` that keeps the same
interface and adds the visual half:

- `mount(canvas)` — create ONE Babylon `Engine` + `Scene` (dispose on `dispose()`);
  reuse `apps/client`'s `render/*` (ArenaScene, Lighting, CameraRig) — do NOT fork.
- `previewChampion` — load the champion's model via the `models` collection doc
  (`modelKey` → glbPath/clipMap), play `idle`/`run` clips, capsule fallback while
  loading. Keep returning the sim-computed `ChampionPreview`.
- `previewAbility` — cast through a **PreviewDriver emitting an `IntentFrame`**
  (`{ commands: [{ kind: "castAbility", slot, target }] }`) into `world.step()` —
  NEVER call the effectRunner directly. Telegraph + projectile + impact vfx.
  (`content-11` / test `content-preview-real-engine` flips to done when this
  cast path is covered by a test.)
- `previewItem` / `previewAugment` — keep the stat-delta output; optionally flash
  an equip vfx.
- `spawnVfx(vfxKey)` — resolve the `vfx` collection doc and build the particle
  system through the SHARED `toParticleSystem` factory (also used by the game
  client) so preview == ship.
- `stepFixed(ticks)` — already correct; drive it from the render loop at 30 Hz.

## Wiring

`PreviewPanel.tsx` currently instantiates `createSimPreviewController()`.
Swap-in point is that single call site. Keep `PreviewController` as the only
import surface — the panel must not know which implementation it got.

Only `preview/*` may import `@babylonjs/*` (mirror of the client rule that
only `render/*` and `vfx/*` touch Babylon).
