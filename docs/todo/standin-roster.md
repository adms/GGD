# Voxel stand-in roster — 25 draft heroes promoted, 5 duplicates pruned (20 kept) — TODO

Task #31A. The 25 heroes drafted in `tools/w3x-import/out/GoDieEX22s/drafts/champions/` could
not ship with their original models — those are **Blizzard built-ins** (`units\...` paths or
inherited from the base unit rawcode), which the importer cannot extract from the map archive.
Per explicit user directive they are promoted to playable champions using the **default KayKit
voxel block characters** as stand-in models.

**Shape:**
- 25 NEW `content/champions/godie-*.json` docs (champion@1) — ids keep the draft `godie-<raw>`
  convention; combined 名字+稱號 names, stats/abilities carried verbatim from the drafts
  (same conversion conventions as the live 91). No existing doc was modified.
- `modelKey` → one of the four EXISTING voxel model@1 docs, chosen by role heuristic
  (ranged or INT-primary → `champ.sela`/mage; STR melee tank → `champ.thorne`/knight;
  STR high-damage melee → `champ.skin.barbarian`; AGI melee → `champ.skin.rogue`).
  Distribution: mage 11 · knight 6 · barbarian 4 · rogue 4. Collision radius / scale come
  from the model docs (voxel-native), NOT the w3x scale column.
- Every doc tagged **`voxel-standin`** so real models can be swapped in later.
- Full hero → model table + original WC3 model paths + ability-substitution log (none needed):
  `tools/w3x-import/out/GoDieEX22s/drafts/PROMOTED.md`.
- Suite: `packages/shared/src/content/standinRoster.test.ts` — reads the promoted docs by
  DIRECT file path (green before AND after `content:build`, which only the main session runs).

**Reconciliation notes for the main session (post `content:build`):**
- `content/champions/_index.json` must be rebuilt to pick up the 25 docs (and the abilities
  index to extract their embedded Q/W/E/R docs, per pipeline convention).
- `EX_MAP.json` partitions only the previous 91-hero roster (88 with EX + 3 without); the
  25 promoted heroes are absent from it and carry NO `exAbility`. The `ex-map-subset` test
  asserts `withEx + withoutEx == total godie champions` and will need EX_MAP's `withoutEx`
  extended (or extract_ex.py re-run) once the index includes the newcomers.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| standin-01 | 20 kept docs exist; the 5 pruned duplicates (e010/o02n/h00w/n01b/o030 — user rule「盡量收，除非重複」) are absent, incl. their orphan .ex docs | draft-promote-count | unit | done |
| standin-02 | every promoted doc parses as a strict `champion@1` (current zChampionDoc, incl. embedded Q/W/E/R slot integrity + `<id>.<slot>` ability ids) | standin-schema-valid | unit | done |
| standin-03 | every hard ref closes against the EXISTING indexes: modelKey→models, buildPriority→items, spawnProjectile→projectiles, exAbility (if ever set)→abilities | standin-refs-closed | unit | done |
| standin-04 | modelKey ∈ the 4 voxel model docs; all 4 bodies used; ranged heroes always mage rig; no model bucket > 12 of 20 | standin-model-dist | unit | done |
| standin-05 | every promoted doc carries the `voxel-standin` tag (swap marker) plus the `wc3-import`/`godie` lineage tags | standin-tag | unit | done |

## Prune record (user whitelist decision, 2026-07-21)

Rule:「盡量先收，除非重複」. Removed 5 exact-name duplicates:
`godie-e010` (= godie-e00s 白木卡迪那), `godie-o02n` (= godie-o02o 曹操孟德),
`godie-h00w` (= live godie-harf 鄭先生), `godie-n01b` (= live godie-nman 胖虎),
`godie-o030` (= live godie-orkn 臭作). Final roster: 111 godie + sela + thorne = 113.
EX regenerated post-prune: 102 with EX / 9 without (extract_ex.py + gen_ex_content.py).
