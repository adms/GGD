# Champion identity (who is a hero) — TODO

**The rule: a champion's identity is its hero 編號 — the `NN-0X` prefix on its ability names
(task #11) — NOT its 3D model and NOT its portrait PNG.**

Why this needed a rule at all: 80 of 113 imported champions wear one of four CC0 stand-in
meshes (`champ.sela` alone is worn by 18 unrelated heroes) because their WC3 model was a
Blizzard built-in we cannot ship, and w3x icon extraction handed the same PNG to several
heroes at different paths (曹操孟德 literally wears 皮卡丘's portrait). Two independent
heuristics — "same model ⇒ duplicate" and "same portrait bytes ⇒ duplicate" — therefore both
concluded that 英靈-亞瑟王 - 黑化Saber (`godie-e00q`) was a copy of 亞瑟王 - Saber
(`godie-e002`), and it silently vanished from the roster. It is a separate character: hero
**69** (力量強化 / 黑泥召喚 / 約束與勝利之劍 / 魔力增幅) against Saber's **20**, with 黑泥
(the corrupted Grail mud) appearing on no other champion in the map.

**Governing policy** (user, 2026-07-22):「遇到疑慮一律判斷寬鬆為多英雄」— when in doubt, treat
entries as SEPARATE heroes. The costs are asymmetric: a wrongly-merged champion disappears
from the game along with its bespoke kit, while a wrongly-kept duplicate is cosmetic and
trivially removed later. Merging therefore requires positive, strong evidence; absence of
evidence (no parseable number, an unknown mesh, a partial view of the doc) never merges.

**Shape:**
- `packages/shared/src/content/championIdentity.ts` — the single rule.
  `heroNumberOf` (parse `NN-0X` / `NN-00X` off the kit; ambiguous ⇒ null), `isSameCharacter`
  (pairwise predicate), `groupCharacters` / `characterKeys` / `distinctCharacters` (roster
  partition), `heroNumberCollisions` (report, never resolve), `compareCanonical` (which entry
  represents the character — ordered by the map's own 78-entry random-hero pool, which is
  ORDERING evidence only and must never become identity evidence).
- `apps/client/src/ui/platform/marqueeRoster.ts` — consumes `distinctCharacters()`; its old
  `DUPLICATE_ALT_IDS` (by name) and `ICON_DUPLICATE_IDS` (by md5) are gone. The genuine
  cosmetic problem those solved is now a separate pass, `SHARED_PORTRAIT_GROUPS` +
  `withoutDuplicatePortraits()`, which hides a TILE and never a CHAMPION, and which exempts a
  champion whose w3x `tint` re-colours the shared bitmap (so 黑化Saber renders as the black
  Saber it is). Membership is pinned against the PNG bytes on disk, so it shrinks as icons are
  fixed.
- `apps/platform/internal/curation/starter.go` (G9) + `heroidentity_test.go` — the starter
  bundle is gated on the same rule; G5 still forbids two picks sharing a mesh, but explicitly
  for presentation, not identity.
- `apps/admin/src/curation.ts` — deliberately does NOT dedupe champions; every authored
  champion stays individually listable/curatable in the ops console.

**Known source-data collisions (reported, NOT resolved — both sides stay playable):** hero
`05` 賈修貝爾/阿強一號, `53` 傑洛士/涼宮八ㄦ匕, `61` 克勞薩先生/克勞薩II世, `91` 死亡騎士/不良少年
each share one 編號 (and, in the w3x, the same four ability rawcodes) across two unrelated
characters. Heroes `25` 拳四郎 and `58` 皮卡丘 each exist twice on different meshes — a
skin/variant relationship, likewise kept.

**Open content bug (separate from identity):** 9 groups of DISTINCT champions still ship
byte-identical portrait PNGs because icon extraction mis-assigned them. Fixing the extraction
shrinks `SHARED_PORTRAIT_GROUPS` (its test fails until the stale entry is deleted).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ident-01 | Hero number is parsed off the `NN-0X` / `NN-00X` ability prefix (incl. unspaced names); a kit that mixes numbers resolves to "unknown", never to a merge | champion-identity-hero-number | unit | done |
| ident-02 | Parsed numbers agree with the importer's own `HERO_NUMBERS.json` for every champion it knows | champion-identity-importer-agreement | unit | done |
| ident-03 | 黑化Saber (`godie-e00q`, hero 69) is NOT collapsed into `godie-e002`/`godie-e00l` (hero 20) despite the shared mesh and shared portrait; its bespoke 黑泥 kit survives | champion-identity-saber-alter | regression | done |
| ident-04 | Every known duplicate ENTRY pair still folds to exactly one surviving champion, keeping the map's own random-hero pick as canonical | champion-identity-true-duplicates | unit | done |
| ident-05 | No two champions sharing a CC0 stand-in mesh are ever treated as the same character | champion-identity-standin-mesh | regression | done |
| ident-06 | Numberless champions (`godie-e00u`, `godie-u01f`, `godie-h02n`, `godie-u01q`, `sela`, `thorne`) each keep their own identity and never merge — with each other or into a numbered hero | champion-identity-no-number | unit | done |
| ident-07 | Leniency policy: hero-number collisions keep BOTH sides and are reported; same-number/different-mesh variants stay apart; a partial view of a champion can only look MORE distinct | champion-identity-leniency | regression | done |
| ident-08 | The curation starter bundle is gated on the same rule (no two picks are the same character; stand-in wearers and collisions stay curatable) | whitelist-champion-identity | unit | done |
| ident-09 | Login marquee keeps 黑化Saber on its own tile (tinted) while still folding the real Saber twin; a shared-portrait champion is hidden from the STRIP only, never from the roster | champ-marquee-saber-alter | regression | done |
| ident-10 | `SHARED_PORTRAIT_GROUPS` equals the byte-identical portrait groups actually on disk — no stale entries, and fixing an icon shrinks the table | champ-marquee-portrait-groups | unit | done |
| ident-11 | Re-extract the mis-assigned champion portraits so the 9 remaining shared-PNG groups disappear (曹操孟德 wearing 皮卡丘's icon, 志志雄 wearing 初音's, …) | champion-identity-icon-reextract | integration | pending |

**#113 investigation (2026-07-23) — 14 same-name doc pairs → all DEDUP, no doc removed.**
See `docs/_champion-dedup-113.md`. All 14 pairs resolve to `isSameCharacter = true`
(same hero 編號 + identical name + identical kit), so none is a #55 "distinct heroes /
shared mesh" case. Pairs 4 (妖狐藏馬 fox/fox2) and 8 (傑富力士 herobiggon/champ.thorne
stand-in) are the same character on a different mesh; the rest share the exact mesh with
minor stat drift. **Action: report only** — the runtime (`distinctCharacters` +
`SHARED_PORTRAIT_GROUPS`) already folds every pair, `apps/admin/curation.ts` intentionally
keeps every doc listable, and both ids of each pair are pinned by off-limits
apps/packages tests, so hand-deleting a doc is unsafe and unnecessary. Left for the user
to decide if physical pruning is ever wanted.
