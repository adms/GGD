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
Top-level authoring screens also have reload-safe URLs:
`/editor/forge`, `/editor/vfx-forge`, and `/editor/export`. Sidebar navigation
updates browser history, and Back/Forward restores the matching screen.

## Authoring surfaces

- **鑄技工坊** — creates a new standalone local `ability@1` from a designer
  skill-type recipe or edits an existing skill. New Q/W/E skills are seeded at
  four ranks and R at three; mana, cooldown, range and every other displayed
  tier value come from Main's shipped resolver/config rather than Editor
  constants. Recipes live in machine-readable `skill-type-recipes.json`, combine
  existing template bricks, and use the selected champion's live origin/stat
  normalization only to rank recommendations—nothing is hidden or forced.
  The studio provides a visual template-product stack, drag-and-drop ordering,
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
  earlier run. AI-authored VFX never writes live content from this page: a
  candidate must include one framebuffer proof (two for the eight named
  capability fixtures), the proof is cleared on every draft/target change, and
  the admin page shows those exact frames beside the hash-locked JSON before a
  human can score it. The eight fixtures are server-classified and permanently
  non-promotable even if a client lies about their purpose.
  Changing a segment's representation preserves its trigger, `strikeIndex`
  and exact timeline offset. Every active script separately requires a caster
  action on `castStart`/`castEffect`; a later strike cannot masquerade as its
  cast. Every authoritative strike is guarded as an actor
  pair: the caster attack and target reaction must both cover that beat, so a
  cloud of slash particles cannot pass while either character remains static.
  The guard consumes real SimWorld strike/projectile-hit cues, so a gameplay
  hit with no authored VFX is still checked. Capture and submission remain
  fail-closed until that trace is accepted and runtime-compatible; switching
  abilities clears the prior trace immediately. Timeline controls and tracks
  use player-facing labels such as `角色動作`, `施法者攻擊` and `第 N 段傷害`;
  raw schema ids remain available in tooltips for diagnosis.
- **Champions / Skins** — complete schema forms plus live final stats and the
  actual GLB presentation path: facing correction, hidden primitives, body
  normalization, ground placement, animation clips, tint and alpha. Champion
  preview can switch between the base body and all compatible skins.
- **匯出中心** — reads the published target profile through a bounded,
  allow-listed loopback bridge and derives `bootstrap` / `full` / `delta`
  availability from that receipt. It now builds deterministic, self-validating
  `ggd-editor-import@1` Package JSON and byte-stable STORE ZIP, including JCS
  document hashes, exact Base hashes, dependency closure, reports, semantic
  package digest, transport digest and its own ZIP safety preflight. Full export
  refuses implicit deletion. Delta keeps the operator's selected root separate
  from the actual change set, walks changed forward dependencies transitively,
  excludes unrelated local drafts, labels auto-added changes as
  `required-dependency`, and pins every omitted reference to the exact Base
  bundle rather than the current workspace. Production buttons remain visibly
  blocked until main aligns the runtime-direct authoring receipt, G2 Base
  receipts and importer endpoints; the UI never fills a fake compiler
  fingerprint or labels a local file bundle as an applicable production package.
- **Collections** — schema-driven controls cover every current authorable field
  for abilities, VFX, models, projectiles, skins, templates and the remaining
  registered content collections. Bounded numbers render sliders and references
  use content indexes.

## Main / Editor boundary

Main manufactures reusable bricks: authoritative gameplay events, schemas,
runtime behaviour, model/VFX primitives, resolver rules, asset safety and
machine-readable receipts. Editor composes those bricks into finished skills:
skill-type recipes, effect-template product stacks, timelines, character
actions, colour, camera, drag/drop authoring, visual evidence and iterative
review. A named acceptance skill is evidence that the Editor can compose the
grammar; it is not a request for Main to hand-author that finished scene.

If a design cannot be represented, Editor fails closed and requests the
smallest reusable primitive or event contract. It does not approximate the
mechanic, duplicate the renderer, or ask Main to tune a particular skill's
timeline. All authoring remains ordinary JSON controlled through no-code UI;
AI may propose a composition, but the same visual review and human approval
gate applies before production use.

## Source ownership and writes

Before changing a content path, use `bash scripts/genguard.sh <path>`.

- `content/abilities/*.json` and the existing `content/champions/*.json` are
  generator products. The editor does not overwrite or delete them.
- The editor asks `GET /content-api/editor-source` for authoritative ownership.
  A hand-authored descriptor may allow a document write; a generator-owned
  descriptor must point to a source adapter. If that route is unavailable, the
  editor fails safe and shows a read-only blocker.
- `content/vfx-scripts/*.json` and `content/skins/*.json` are directly authored
  collections today. Skin writes still follow the ordinary source policy; VFX
  Forge deliberately has no direct writer and can only create a hash-locked AI
  proposal. After human approval, Promote revalidates the exact script before
  the content API writes it.
- Save and delete share the same source policy. Network or provenance lookup
  failures block deletion instead of falling through.
- The desktop shell separately exposes `ggd-editor-desktop-source@1` from
  `GET /content-api/desktop-source`. The sidebar therefore reports whether the
  Base is local or remote and whether the local working tree is current, changed,
  conflicted, offline, or carrying compatibility warnings. This status contract
  is deliberately not overloaded onto the per-document ownership schema.

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
supports `bootstrap`, declares runtime-direct `ability@1` / `item@1` authoring,
and has no active authoring store. Package generation now pins the shipped
`authoringProcessor` receipt and omits `compiler`, matching Main's
runtime-direct contract. The set of package-applicable runtime representations
is derived from the digest-verified contract index rather than a third Editor
allow-list; a new Main representation without an Editor builder, or a profile
summary that disagrees with the full index, fails closed. Production export remains fail closed until the target
declares G2 and supplies the exact Base facts required by the selected mode.

The desktop app can use either a local GGD directory or an HTTPS remote Base such
as `https://ggd.adms.ai`. Remote manifest, bundle, target profile and individual
document hashes are validated before the snapshot is pinned. Local edits stay in
the desktop working tree and are three-way merged on refresh; conflicts are
preserved for review. Binary assets are local-first and fetched through a bounded,
allow-listed cache bridge. Main's complete `assets-manifest.json` is fetched and
verified against the pinned target-profile digest before that bridge is enabled.
Every downloaded or cached GLB／texture／audio byte stream is checked against its
manifest byte count and SHA-256; unlisted assets, tampered responses and stale
cache entries fail closed instead of entering the preview. Older profiles without
the receipt may still load JSON, but remote binary fetching remains disabled and
the desktop source status reports that compatibility state.

Last verified 2026-09-04 07:04 CST, the feature branch contains
`origin/main@b45a2957` (tag `v0.37.1`). Treat this as a receipt rather than a
permanent constant: fetch Main and compare the live ref before making a current
compatibility claim. Live and repository profile digests likewise remain
volatile receipts and are never compiled into the Editor as constants.

## Contract gates

The branch does not use the old `required = 546` count as a constant. Current
generated truth is:

```text
editor coverage fingerprint     61d8319c6a7c
capability fingerprint          de945f42
required cells                  5070
```

The count includes `vfx-script@1`, the complete nested visual-document surface,
and main's `effectFieldPath` axis: 430 nested effect paths such as
`block.vfxId` and `amount.attrRatios.coeff`. The walker repair is tracked by
[#888](https://github.com/adms/GGD/issues/888); do not hand-edit the generated
coverage JSON.

Run the authoritative checks from the repository root:

```bash
pnpm editor:accept          # compact deterministic loop
pnpm editor:accept:visual   # + texture/alpha and stored framebuffer evidence
pnpm editor:accept:release  # + full Editor tests, typecheck and build

# Individual underlying gates, when diagnosing one layer:
pnpm caps:check
npx vitest run packages/shared/src/ops/editorCoverageFresh.test.ts
pnpm --filter @ggd/editor typecheck
pnpm --filter @ggd/editor test
pnpm --filter @ggd/editor build
```

`fullCoverageMatchesContract.test.ts` is the bidirectional gate: a contract cell
without a real control is red, and an editor control outside the contract is red.
`readmeContract.test.ts` separately makes stale fingerprints and required counts
red instead of leaving the next handoff on an old contract snapshot.

## Named VFX acceptance cases

The eight Owner-named scenes are Editor capability fixtures, not replacement
game content. Each was rebuilt from a blank canvas using exposed recipe cards
and entered the local review queue with two actual-model framebuffer proofs.
Those pictures then exposed a false-negative in the old timeline-only backdrop
scan: red/purple diagnostic carriers were visible at exact reviewer keyframes.
All eight records are therefore retained as failure evidence and quarantined;
none is a visual pass. The server exposes pass/fail only and has no Promote
path for these IDs.

| Ability | Required visual grammar | Main/JASS adoption |
| --- | --- | --- |
| `godie-hjai.e` — 04-03 龍破斬 | projectile travels, then remote explosion | JASS order retained; Owner's red-orange volume wins |
| `godie-hjai.r` — 04-04 神滅斬 | real caster dash plus purple-black slash | Owner override: JASS moved the victim |
| `godie-hart.r` — 01-04 超究武神霸斬 | animated multi-hit plus yellow-blue vertical finisher | Main vertical column bricks; Editor owns timing, split colour and framing |
| `godie-nbbc.r` — 08-04 阿邦快速劍X | blue shockwave then authoritative blink slash | ability owns the blink; script must not move the body again |
| `godie-nbbc.e` — 08-03 龍鬥氣砲咒文 | broad blue-white horizontal beam | Editor recipe reuses Main `ReviveHuman＋FragDriller`; exact colour/scale awaits model-owned emitter instance inheritance |
| `godie-ogrh.r` — 09-04 龜派氣功 | broad orange-gold horizontal beam | JASS `h007＋h008` maps to Main `ReviveHuman＋FragDriller`; no particle-row substitute; same emitter seam applies |
| `godie-e002.ex` — 20-002 理想鄉EX | reflect success, six reposition slashes, seventh yellow-blue beam | JASS `h00S＋h008`; timing stays Editor-owned, exact beam palette awaits the shared emitter seam |
| `godie-hvsh.r` — 48-04 騎英之手綱 | real Rider dash plus blue-white beam | Editor owns dash, colour and camera; exact model-emitter tint/scale awaits one reusable Main seam |

Authoritative local review records live under `docs/_review/ai-proposals/`;
source comparison and rejected experiments are documented in
`docs/_reports/vfx-forge-editor-acceptance-20260902/README.md`; the latest
browser-captured two-frame-per-skill evidence and structured full-timeline GPU
scan are in
`docs/_reports/vfx_forge_8_ability_visual-proof_20260902-1131/README.md`.

Every new VFX proposal carries a structured `ggd-vfx-visual-audit@3` receipt
from both the complete runtime timeline scan and an exact GPU readback for each
submitted reviewer keyframe. The exact-frame guard rejects diagnostic
red/purple/blue checker carriers, opaque local cards and unsafe washout; a
15 Hz sweep cannot excuse a bad frame it skipped. Human verdicts and Promote
are bound to a `reviewHash` over the candidate JSON, base hash, purpose,
explanations, screenshots, automatic score and GPU receipts. Changing only a
screenshot or audit result therefore invalidates the old verdict just as
changing JSON does. `@1`, `@2`, and incomplete `@3` records remain readable so
the Owner can record a failure, but cannot receive pass/approve or Promote.

Remote Desktop previews consume the digest-verified profile pinned beside the
immutable Base. When `effectiveVfxLimits` is present, all eight resolved fields
must match the renderer actually running in the Editor; any drift fails closed
instead of printing remote numbers over different local behavior. Older
profiles that omit the whole object stay usable through the shared local
runtime resolver, with that compatibility state shown in the Forge UI.

Desktop release builds keep their Vite output under
`apps/editor-desktop/dist/renderer/`; they never overwrite the production web
Editor or Admin `dist/` trees. `dist:mac` emits one universal Apple Silicon +
Intel DMG/ZIP, while `dist:win` emits x64 NSIS + portable EXE. The packaged app
also supports `--smoke-test`, which starts the real loopback server, verifies
the embedded Editor/Admin and source/profile routes, prints a JSON receipt, and
exits without opening a window. The latest packaging evidence is recorded in
`docs/_reports/editor-desktop-release-smoke_20260902-0337/README.md`.

The former Ideal EX join from [#885](https://github.com/adms/GGD/issues/885) is
now guarded through the real shipped chain. Unknown provenance still fails
closed; do not work around it by changing visual timing or using a similar
existing trigger.

## Feature branch handoff

Implementation lives on `feat/vfx-forge-codex`, containing Main through the
last verified receipt `origin/main@b6f0bf4bf793`; the feature-branch tip is the
only current Editor revision. It is intentionally not merged or pushed to
`main`. Main should use
`docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md` as a reference
and reimplement only the main-owned seams on its own feature branch; the
coordination contract explicitly forbids wholesale cherry-picking this branch.

Editor-owned VFX recipes are also exported deterministically for optional Main
review in `docs/editor-contract/editor-vfx-template-handback.json` and
`docs/editor-contract/EDITOR_VFX_TEMPLATE_HANDBACK.md`. They use semantic
family/variant names rather than landed `typeN` ids and remain advisory-only:
Main may absorb a repeated low-level capability, but must not copy skill timing,
palette or camera compositions into runtime defaults.
