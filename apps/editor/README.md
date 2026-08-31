# GGD No-Code Content Editor

This app is the local authoring UI for GGD content. It edits JSON through the
loopback-only `content-api`, previews content with the shipped runtime code, and
keeps generated products read-only unless the server identifies an authoritative
writable source.

## Run locally

From the repository root:

```bash
pnpm install
pnpm dev:editor
```

Open `http://127.0.0.1:5174/editor/`. The editor and `content-api` are started
together; writes remain local. The API guard rejects non-loopback mutation.

## Authoring surfaces

- **鑄技工坊** — visual template-product stack, drag-and-drop ordering,
  structured condition leaves, bounded controls, undo/redo, and a scrub/play
  timeline built from real `SimWorld` events. Its preview now shares the VFX
  Forge's shipped `CameraRig`, arena ground, dual champion GLBs and real
  `VfxSystem`; the 3D stage and event ruler use the same playhead and 1/60 frame
  step. After the first manual cast, changing a card or VFX parameter reruns the
  real cast automatically. The draft is overlaid on the already-registered
  runtime ability, so model presets, tier values and combo families are resolved
  exactly as they are in the game while writeback still preserves the authoring
  shape. Ability behaviour is never reproduced in a second preview-only rules
  engine.
- **特效工坊** — model/VFX resource palette, drop placement, the real
  `CameraRig` and ground, segment sliders, WYSIWYG replay, 1/60 frame step,
  timeline scrub/play, undo/redo, and middleware writeback. The stage uses the
  selected ability owner's actual champion GLB plus a selectable target GLB,
  including the shipped facing, hidden-primitive, normalization, tint and clip
  rules. Script assets are preloaded before deterministic replay; framing can be
  inspected through the config-backed `CameraRig` zoom clamps. It writes only
  `content/vfx-scripts/`; a script replaces the default binding instead of
  stacking with it. Scene reset also clears not-yet-fired script segments and
  cast-end waiters, so scrub/replay cannot accumulate delayed effects from an
  earlier run.
- **Champions / Skins** — complete schema forms plus live final stats and the
  actual GLB presentation path: facing correction, hidden primitives, body
  normalization, ground placement, animation clips, tint and alpha. Champion
  preview can switch between the base body and all compatible skins.
- **匯出中心** — reads the published target profile through a bounded,
  allow-listed loopback bridge and derives `bootstrap` / `full` / `delta`
  availability from that receipt. A saved `ability@1` or `item@1` can be
  validated and downloaded as the contract-approved compiled-only single JSON.
  Package JSON/ZIP remains visibly blocked while the target has no compiler
  receipt, exact authoring base, or activation importer; the UI never labels a
  local file bundle as a production package.
- **Collections** — schema-driven controls cover every current authorable field
  for abilities, VFX, models, projectiles, skins, templates and the remaining
  registered content collections. Bounded numbers render sliders and references
  use content indexes.

## Source ownership and writes

Before changing a content path, use `bash scripts/genguard.sh <path>`.

- `content/abilities/*.json` and the existing `content/champions/*.json` are
  generator products. The editor does not overwrite or delete them.
- The editor asks `GET /content-api/editor-source` for authoritative ownership.
  A hand-authored descriptor may allow a document write; a generator-owned
  descriptor must point to a source adapter. If that route is unavailable, the
  editor fails safe and shows a read-only blocker.
- `content/vfx-scripts/*.json` and `content/skins/*.json` are directly authored
  collections today. They still pass server-side schema validation and the
  content API guard before a write.
- Save and delete share the same source policy. Network or provenance lookup
  failures block deletion instead of falling through.

Upstream source-adapter work is tracked by
[#887](https://github.com/adms/GGD/issues/887).

## Published target profile

The Export Center defaults to
`https://ggd.adms.ai/content/editor-target-profile.json`. The site currently
does not opt into browser CORS, so the local content sidecar performs the read.
It is not an open proxy: only HTTPS, standard port, a bounded UTF-8 JSON body,
and recognized target-profile schemas are accepted. The default hostname
allow-list contains only `ggd.adms.ai`; a local operator can replace it with a
comma-separated `GGD_EDITOR_PROFILE_HOSTS` value.

The three package modes stay present even when blocked so later main-side work
does not require redesigning the editor. The current published profile only
supports `bootstrap`, has no compiler receipt, and has no active authoring store;
the main importer still reports G1 and returns 501 for validate/apply/rollback.
Consequently only single runtime JSON is honestly exportable today.

## Contract gates

The branch does not use the old `required = 546` count as a constant. Current
generated truth is:

```text
editor coverage fingerprint     e459792944b8
capability fingerprint          f3f4185c
required cells                  680
```

The count increased because `vfx-script@1` entered the contract and the coverage
walker now includes nested record/tuple fields. The walker repair is tracked by
[#888](https://github.com/adms/GGD/issues/888); do not hand-edit the generated
coverage JSON.

Run the authoritative checks from the repository root:

```bash
pnpm caps:check
npx vitest run packages/shared/src/ops/editorCoverageFresh.test.ts
pnpm --filter @ggd/editor typecheck
pnpm --filter @ggd/editor test
pnpm --filter @ggd/editor build
```

`fullCoverageMatchesContract.test.ts` is the bidirectional gate: a contract cell
without a real control is red, and an editor control outside the contract is red.

## Named VFX acceptance cases

| Ability | Editor result | Runtime result |
| --- | --- | --- |
| `godie-hart.r` — 01-04 超究武神霸斬 | Real cast trace and 12 script tracks load without a blocker. | Playable through the current event path. |
| `godie-hjai.e` — 04-03 龍破斬 | Real cast trace and 2 script tracks load without a blocker. | Playable; asset-fidelity gaps remain documented in the shipped script notes. |
| `godie-e002.ex` — 20-002 理想鄉EX | The Forge performs the real reflect setup, enemy magic hit, passive hook and seven-strike schedule; all 17 tracks are editable. | **Passed:** the editor and shipped `VfxScriptPlayer` share one strict authored-origin parser, so the real `hook:abilityPassive:godie-e002.ex` strikes select the EX script without rewriting the event. A shipped-content → real Sim → real player guard covers the seam. |

The former Ideal EX join from [#885](https://github.com/adms/GGD/issues/885) is
now guarded through the real shipped chain. Unknown provenance still fails
closed; do not work around it by changing visual timing or using a similar
existing trigger.

## Feature branch handoff

Implementation lives on `feat/vfx-forge-codex`, based on
`origin/main@de7006c6`. It is intentionally not merged or pushed to `main`.
Review the commits after that base in order; each authoring layer has its own
commit so GGD can cherry-pick or rollback it independently.
