# content/ — the game content store

One **JSON file per object**, `filename stem == id`, each doc restating `id` plus a
`"schema"` discriminator (e.g. `"ability@1"`). Validated by the Zod schemas in
`packages/shared/src/content/schema/*` — the **single source of truth** that also
drives the editor's generated forms.

```
content/
  manifest.json            # { contentVersion: "cv_<12hex>", collections: {name: {hash,count,path}} }
  <collection>/_index.json # { collection, hash, entries: [{id, path, hash, size}] }
  <collection>/<id>.json   # one object
  assets/**                # binaries (.glb, textures) referenced BY PATH, never inlined
```

Collections: `champions, abilities, items, augments, projectiles, status-effects,
loot-tables, arenas, config, models, vfx, skins`.

The `config` collection holds two schema variants: `config@1` (`config.match`, the
match/economy constants) and `config.store@1` (`store.json`: M COIN champion prices
+ per-placement match rewards, consumed read-only by the Go platform via
`CONTENT_DIR`). `skins/*.json` (`skin@1`) are purchasable cosmetics: `championId`
→ champions, `modelKey` → models (the KayKit barbarian/rogue GLBs are staged as
skin models under `assets/models/champions/`).

## Hashing / caching

- object hash = `sha256(safeStableStringify(doc))` truncated to 12 hex — independent
  of file formatting and key order;
- collection hash and `contentVersion` (`cv_<12hex>`) are pure functions of content;
- serve any `?h=<hash>` request with immutable cache headers; `manifest.json` is no-cache.
  Clients never hash — they only read hashes to build cache-busting URLs.

## Tooling (packages/shared)

- `pnpm content:export` — one-time migration/regeneration from the TS skeleton literals;
- `pnpm content:build` — rebuild every `_index.json` + `manifest.json`;
- `pnpm content:validate` — full load + schema + referential-integrity + stale-index
  check (CI gate; non-zero exit on error).
- dev editing: `apps/content-api` (Fastify :8787, dev-only) does validated writes +
  incremental reindex + SSE change events; `apps/editor` is the authoring UI.
  In production this tree is served as static files (nginx) — no service writes it.

## Referential integrity

Hard refs (dangling = **error**): `spawnProjectile.projectileId → projectiles`,
`buildPriority[] / loot-table entries → items`, `champion.modelKey → models`,
`champion.abilities[slot].id → abilities`, `skin.championId → champions`,
`skin.modelKey → models`.
Soft refs (dangling = **warn**): `vfxKey → vfx`, `applyStatus.statusId → status-effects`
(content that may not be authored yet).

## Migration note (read me before deleting things)

`packages/shared/src/sim/content/skeleton.ts` (the TS literals) **stays** for now:
the sim unit tests register content through it. This JSON store is authoritative
for **runtime loading** (game-server/client via `ContentLoader`), and the two are
kept provably in sync by `packages/shared/src/content/loader.test.ts`, which
asserts the JSON round-trip reproduces the literals exactly. Delete the literal
module only when the game-server has switched to the ContentLoader.

The `models/*.json` docs point at `assets/models/champ.{sela,thorne}.glb`, which
do **not** exist yet — authoring the voxel models in Blockbench is a parallel task;
the client uses a capsule fallback until then.
