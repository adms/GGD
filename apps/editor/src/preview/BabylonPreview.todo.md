# BabylonPreview — the rendering half of the preview seam (client engineer)

`PreviewController.ts` in this folder defines the contract and ships
`createSimPreviewController()`, a **renderless** implementation that already
runs the DATA half through the real engine: sandbox `SimWorld` + the real
`statPipeline` / `spawnChampion` / `resolveScaling` (no mocks). `PreviewPanel.tsx`
renders its output as structured text.

> **STATUS (2026-09-02):** `src/preview3d/` still ships the collection-specific
> Babylon panels described below. Ability authoring is no longer renderless:
> 鑄技工坊 and VFX Forge run real `SimWorld` casts/reactions and render them
> through the shipped `CameraRig`, arena ground, champion GLBs and `VfxSystem`,
> with one shared 1/60 playhead, frame step and deterministic scrub. The eight
> named VFX fixtures have browser-captured evidence under `docs/_reports/`.
>
> **STILL OPEN, MAIN-OWNED:** a single general-purpose client render bridge for
> the generic collection `PreviewPanel`. Do not replace the working Forge stage
> with a second preview rules engine. When main exposes that bridge, this panel
> should delegate to it and retain the current collection inspectors as focused
> asset views.

## Remaining bridge contract (main-owned)

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
