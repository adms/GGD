# Task #113 — 14 same-name champion doc pairs: dedup vs distinct

**Question.** 14 pairs of champion docs ship with byte-identical (or near-identical)
`name` / `model` / `stats`. Are they duplicate ENTRIES of one character (fold to one),
or genuinely-distinct heroes that merely share a mesh under the hero-number identity
rule (#55)?

**The governing rule (#55).** A champion's identity is its **hero 編號** — the `NN-0X`
prefix on its four ability names — **not** its 3D model and **not** its portrait PNG.
`packages/shared/src/content/championIdentity.ts::isSameCharacter` encodes it: two
entries are the SAME character iff **both parse the same hero number AND carry an
identical display name** (line ~227), regardless of mesh or tint. Policy on doubt
(user, 2026-07-22): 「遇到疑慮一律判斷寬鬆為多英雄」— merge only on positive, strong
evidence; the cost of a wrong merge (a champion + its kit vanishes) dwarfs the cost of a
wrong keep (a cosmetic tile, trivially removed later).

**Method.** For every pair I parsed the hero number off each doc's embedded ability
names (cross-checked against `tools/w3x-import/out/GoDieEX22s-src/HERO_NUMBERS.json`),
compared the four `Q/W/E/R` ability names (the kit), the `modelKey`, and
`baseStats`/`growth`.

## Verdict table

Every pair below resolves to `isSameCharacter = true`: **same hero number + identical
name + identical kit**. None is a #55 "distinct heroes under one mesh" case (that
requires *different* hero numbers, or the *same* number under *different* names — e.g.
the documented 05/53/61/91 collisions, which are **not** in this set because those have
different names). So the identity verdict for all 14 is **DUPLICATE (one character)**.

| # | Character | ids (a / b) | hero # | model a / b | stats identical | kit identical | verdict |
|---|-----------|-------------|--------|-------------|:---:|:---:|---------|
| 1 | 三刀流劍士 - 索隆 | godie-u01u / godie-udre | 11 | heromusashimiyamoto / same | no | yes | **dedup** |
| 2 | 亞瑟王 - Saber | godie-e002 / godie-e00l | 20 | herosaber / same | **YES (byte-identical)** | yes | **dedup** |
| 3 | 傳說的龍騎士 - 勇者小呆 | godie-n01c / godie-nbbc | 08 | sd2 / same | no | yes | **dedup** |
| 4 | 妖狐藏馬 - 南野秀一 | godie-n00p / godie-nsjs | 18 | **fox / fox2** | no | yes | **dedup** (mesh variant) |
| 5 | 戰國刺客Azumi - 安云 | godie-e00k / godie-e00z | 19 | herokunoichi / same | no | yes | **dedup** |
| 6 | 看似憂鬱的神獸 - 草泥馬 | godie-h02u / godie-h02v | 92 | horse / same | no | yes | **dedup** |
| 7 | 神鳴流劍士 - 櫻綻剎那 | godie-e00w / godie-e00x | 77 | mfls / same | no | yes | **dedup** |
| 8 | 職業獵人 - 傑 富力士 | godie-u034 / godie-ucrl | 06 | herobiggon / **champ.thorne (CC0 stand-in)** | no | yes | **dedup** (stand-in variant) |
| 9 | 草帽小子 - 蒙其.D.魯夫 | godie-u00n / godie-u00o | 76 | luffe / same | no | yes | **dedup** |
| 10 | 蟬在叫人壞掉 - 龍宮禮奈 | godie-e001 / godie-e00n | 22 | renaryugu2 / same | no | yes | **dedup** |
| 11 | 邪眼師 - 飛影 | godie-u010 / godie-uvng | 38 | herohehi / same | no | yes | **dedup** |
| 12 | 黑暗福音 - 依文潔琳 | godie-n003 / godie-n01g | 42 | long / same | no | yes | **dedup** |
| 13 | 黑魔導士 - 莉娜因巴斯 | godie-h020 / godie-hjai | 04 | linainvers / same | no | yes | **dedup** |
| 14 | 龍之子 - 天地志狼 | godie-e007 / godie-ewar | 12 | herolingtong / same | no | yes | **dedup** |

Notes:
- **Pair 2 (Saber)** is the only pair identical across *every* field (name+model+stats+
  growth+kit+number). Its `.q..r` names are `20-01 風王結界 / 20-02 感知能力 /
  20-03 約束與勝利之劍 / 20-04 Avalon`. This is NOT 黑化Saber — that is `godie-e00q`,
  hero **69**, a separate 黑泥 kit, and is correctly excluded from this pair (protected by
  identity test ident-03).
- **Pairs 4 and 8** are the same character wearing a *different mesh* (fox↔fox2;
  herobiggon↔the `champ.thorne` CC0 stand-in). Under #55 the mesh is not identity, so
  they still fold; treat them as skin/stand-in variants, exactly like the documented
  拳四郎/皮卡丘 twins.
- The other 12 pairs share the exact mesh and differ only in `baseStats`/`growth` by
  small amounts (importer read two unit instances of the one hero). Stats are not
  identity, so they fold.

## Recommendation — ACT: none (report only)

**No champion content doc was deleted or edited.** Although all 14 are unambiguous
same-character duplicates, hand-removing a doc is the wrong instrument here:

1. **The runtime already folds them.** `distinctCharacters()` partitions the roster with
   `isSameCharacter`; the login strip's `SHARED_PORTRAIT_GROUPS`
   (`apps/client/src/ui/platform/marqueeRoster.ts:125-149`) enumerates all 14 pairs and
   hides the duplicate *tile*. The dedup is a live, tested behaviour, not a missing one.
2. **Project policy keeps every doc.** `apps/admin/src/curation.ts` deliberately does NOT
   dedupe — every authored champion stays individually listable/curatable — and the
   canonical survivor is chosen by the map's own random-hero pool (`compareCanonical`),
   never by deleting the loser.
3. **Deleting breaks off-limits tests.** Both ids of every pair are referenced by
   `marqueeRoster.ts`, `championIdentity.test.ts`, and the Go curation tests
   (`apps/platform/internal/curation/*_test.go`). Removing a doc (and the `.strict()`
   schema forbids adding a "duplicate-of" marker field) would red those suites — all in
   `apps/**`/`packages/**`, outside this task's file ownership.

So the correct outcome is exactly what #113 asks for when action is not unambiguously
safe: **report, and leave the decision to the user.** If the user later wants the docs
physically pruned, the safe order is (a) drop each loser id from `SHARED_PORTRAIT_GROUPS`
and any test fixtures, (b) delete the doc, (c) `pnpm content:build`, (d) re-validate —
a cross-cutting change spanning apps + packages, not a content-only edit.
