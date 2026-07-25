# voxel-gen — the blocky champion generator (owner directive #226)

```
pnpm voxel:gen      # write content/assets/models/champions/blocky-*.glb
pnpm voxel:check    # verify the shipped files match the generator, byte for byte
```

Bakes five `.glb` files — `blocky-{mage,knight,barbarian,rogue,undead}.glb` — that
44 champions render as. Each is **168 triangles, one mesh, one material, one
draw call, a 16×16 palette texture, a 15-joint rig and seven clips**, in ~51 KB.

## Provenance — read this first

**Nothing here is downloaded, and nothing is derived from any Mojang/Microsoft
asset.** No Minecraft model, skin or texture was consulted, copied or converted.
The owner's directive asked for Minecraft-*style* blocky humanoids; the blocky
voxel *style* is not a protectable element, and every vertex, keyframe and
colour in these files comes from the parameter tables in this directory.

The box vocabulary is also not borrowed: `apps/client/src/render/views/
ChampionView.ts` has drawn this exact figure procedurally as its fallback since
task #64, and `boxman.ts` uses its proportions verbatim (8:12:4, 32 voxel-px
tall, `PX = 1.8/32`). The generated mesh and the procedural fallback are the same
character — which is also why they cannot drift apart.

Output is **byte-deterministic**, so the provenance is a build step anyone can
re-run rather than a claim in a file. `gen.test.ts` pins each output's sha256.

## Why bake files at all

`ChampionView` can already draw the figure, so "just use the procedural one"
looks like the smaller change. It is not:

- `model@1` (`packages/shared/src/content/schema/model.ts`) makes `glbPath` a
  **required** `^assets/` string on a `.strict()` object. A doc with no file is
  not representable without a schema change that ripples into the editor, the
  admin mirror and every `doc.glbPath` reader.
- `StorePreview` has **no** procedural fallback (unlike `ChampionView`), so an
  unloadable path blanks champ-select, the shop stand and the round-winner
  stage — a #129 / #111 / #143 regression.
- `packages/shared/src/content/mcoinStore.test.ts` asserts the two skin `.glb`
  exist on disk.

Baking keeps every one of those consumers working with **zero** code change, and
yields real `AnimationGroup`s so `ClipAnimator`, the cast-strike alignment and
`reactionClip` keep working unmodified.

## Why there is no glTF library

There isn't one in the repo and this doesn't add one. `tools/model-budget/glb.ts`
already carries the *reading* half of the same primitives (12-byte header,
length-prefixed JSON/BIN chunks, 4-byte-aligned bufferViews) plus a `rebuildGlb`;
`glbWrite.ts` is the authoring counterpart, small enough that every emitted byte
is re-derivable by reading one file. `png.ts` likewise writes the palette PNG
with stored DEFLATE blocks, so the sha256 pins survive a Node/zlib upgrade.

## Files

| file | what it holds |
|---|---|
| `boxman.ts` | the part table: 14 boxes, 15 joints, 8 palette slots |
| `clips.ts` | the seven keyframe tables (`idle run attack cast hurt death cheer`) |
| `archetypes.ts` | the five parameter sets (palette, prop mask, pose bias, clip rate) |
| `glbWrite.ts` | dependency-free, deterministic GLB writer |
| `png.ts` | dependency-free, deterministic RGBA8 PNG writer |
| `gen.ts` | CLI: assembles and writes the five files |

## The two design rules everything else rests on

1. **Skinning is RIGID** — one joint per box at weight 1.0.
2. **No clip animates `scale`** — asserted on the emitted bytes in `gen.test.ts`.

Together they turn a baked mesh back into a parametric rig: the client writes
per-champion joint scales and offsets once at spawn
(`apps/client/src/render/views/voxelSkin.ts`) and no animation can clobber them.
Hiding a prop is the same mechanism — its joint goes to scale 0 and the box
collapses to zero pixels. That is what lets **four baked meshes carry 44 visually
distinct champions**, seeded deterministically from the champion id by
`voxelLook.ts`.

## Invariants worth not breaking

- Every box stays inside `y ∈ [0, 32]` voxel-px, so the measured hierarchy height
  is exactly **1.8 u = `ChampionView.TARGET_HEIGHT`**. #150's normalisation factor
  is therefore 1.0 and `doc.scale` is an honest 1.0. (The retired `mage.glb`
  measured 3.0028 u because its staff inflated the bbox, so the body rendered
  small to compensate — this is the fix for that class of bug.)
- Forward is `+Z` in the file. Babylon's loader flips **X**, not Z, so `+Z`
  survives and these files take `NATIVE_GLB_YAW_OFFSET = 0` like the meshes they
  replace; the emitter mirrors X so `handRight` lands on the character's right.
  Measured through the loader — see the note in `gen.ts`.
- `cheer` is not optional. `reactionClip.pickReactionClip` ignores `clipMap` and
  regex-matches raw group names, so dropping it silently downgrades every shop
  purchase reaction to an attack swing.
- These models sit **below the LOD floor** and legitimately ship ONE tier. See
  `apps/client/src/render/modelLod.ts` and the floor in `tools/lod-gen/gen_lod.py`.

## Regenerating

Edit a parameter table, run `pnpm voxel:gen`, then paste the new hashes into
`gen.test.ts`. Both the files and the hashes belong in the same commit — the test
also asserts the shipped bytes match, so a stale file fails loudly.
