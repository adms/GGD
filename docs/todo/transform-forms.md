# 變身 form link (base ⇄ alternate) — TODO

**The finding (task #249).** 26 abilities in `war3map.w3a` carry the WC3 **Metamorphosis**
field pair `Eme1` (normal-form unit rawcode) / `Emeu` (alternate-form unit rawcode). Every
champion transform in GoDieEX22s uses that one pattern, so each second form is a COMPLETE
second unit definition in `war3map.w3u` — its own model, scale, movement speed and ability
list — never a buff on the first.

**Why nobody knew.** The importer whitelists ~30 of the map's 180 w3u field codes (task #56),
and `Eme1`/`Emeu` are not among them, so the relationship was dropped on import. Nothing
downstream could tell a hero from its transformed body.

**The live bug that caused.** 10 of the 50 first-open-roster slots shipped the ALTERNATE form,
offered to players as if it were the champion:

| # | shipped (alternate) | should be (base) | what the player got |
| --- | --- | --- | --- |
| 92 | `godie-h02u` 臥草泥馬 | `godie-h02v` 草泥馬 | the lying-down body — w3x `umvs` **0** |
| 90 | `godie-h02r` 妙蛙花 | `godie-hgam` 妙蛙種子 | the final evolution at `usca` 3.0 from round 1 |
| 25 | `godie-u00l` 北斗之鼠 | `godie-umal` 拳四郎 | the joke Pikachu-DNA form |
| 09 | `godie-o00x` 超級賽亞人 | `godie-ogrh` 悟空 | R「超級賽亞人」turns him into what he already is |
| 04 | `godie-h020` | `godie-hjai` 莉娜因巴斯 | 惡夢魔王的碎片 state |
| 08 | `godie-n01c` | `godie-nbbc` 勇者小呆 | 龍魔人 state |
| 11 | `godie-u01u` | `godie-udre` 索隆 | 武裝色霸氣 state |
| 12 | `godie-e007` | `godie-ewar` 天地志狼 | 破凰之心 state |
| 18 | `godie-n00p` | `godie-nsjs` 南野秀一 | 妖狐化 state |
| 38 | `godie-u010` | `godie-uvng` 飛影 | 邪眼全開 state |

**Owner ruling (2026-07-26):**「換成本體，變身態改由技能觸發」— the roster holds the BASE;
the second form becomes reachable only through its transform ability once that mechanic exists
(task #119 owns the mechanic; this task is DATA ONLY and builds no trigger).

**Reading the w3a correctly.** `Eme1`/`Emeu` are LEVELED fields and the author only ever
re-pointed level 1 when cloning an ability, so levels 2-4 still hold the DONOR's rawcodes
(`A10N 11-002 武裝色霸氣` reads 索隆 at level 1 and 安云 at levels 2-4). A "last writer wins"
parse is wrong on ~9 of the 26 pairs. **Always read level 1.**

**Direction proof, 26/26.** Every hero unit carries a `unsf` sub-name: the base's is the bare
編號 「(NN)」 and the alternate's names the form 「(NN變身名)」 — `Hgam`「(90)」 → `H02R`
「(90 妙蛙花)」, `H02V`「(92)」 → `H02U`「(92 臥草)」. So `Eme1` = base is corroborated by the
map itself, not assumed.

**Shape:**
- `tools/w3x-import/extract_transform_forms.py` → `out/GoDieEX22s-src/TRANSFORM_FORMS.json`
  (regenerable from `raw/war3map.{w3a,w3u,wts}`; the fixture the tests pin against).
- `packages/shared/src/content/championForms.ts` — the shipped 26-pair table plus
  `isAlternateForm` / `isBaseForm` / `counterpartFormId` / `isW3xFormPair` / `baseFormIdOf`.
  This is the ONE place any surface asks "is this a hero or a hero mid-transform?".
- `champion@1.transform` (`packages/shared/src/content/schema/champion.ts`) — the per-doc link:
  `role` (`base` | `alternate`), `counterpartId`, both unit rawcodes, and the trigger ability's
  rawcode + per-level `durationSec` / `cooldownSec`. Present on both halves of each pair.
- `apps/platform/internal/curation/starter.go` — roster gate **R6**: no starter id may be an
  alternate form.
- `apps/client/src/ui/platform/marqueeRoster.ts` — `isSelectableChampion` excludes alternate
  forms via the form link. `SHARED_PORTRAIT_GROUPS` stays a pure icon-BYTES table.

**Deliberately absent:** four alternate bodies have no champion doc (`H00W` 26洨者狀態,
`O030` 30變態紳士, `N01B` 40萬解, `E010` 70紮根). Their base still declares the link; a missing
counterpart is a recovered fact, not a TODO. `O02N` — 曹操孟德's BASE — was pruned in the same
sweep and IS imported here, because pruning it left the hero present only in his transformed
state.

**Three pairs carry no duration**, and that is data, not a gap: `A0DZ 20-01 風王結界` and
`A0O6 70-00 紮根` are TOGGLES (no `ahdu` at all — the form persists until re-cast) and
`Aphx 61-00 百連我殺` is a death-state morph (`adur` 0.01s, an instant swap).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| tform-01 | The shipped 26-pair table equals the map's `Eme1`/`Emeu` fields exactly — a dropped, added or REVERSED pair fails, and so does a drifted duration/cooldown | transform-forms-w3x-pin | regression | done |
| tform-02 | The base/alternate direction is re-derived from the map's own `unsf` sub-names (base = bare 「(NN)」, alternate names the form), 26/26 | transform-forms-direction | unit | done |
| tform-03 | The three no-duration entries stay exactly `A0DZ` / `A0O6` / `Aphx` (two toggles + a death-state morph); every other pair carries a level-1 duration | transform-forms-no-duration | unit | done |
| tform-04 | `isAlternateForm` / `isBaseForm` / `counterpartFormId` / `isW3xFormPair` / `baseFormIdOf` agree with the table; the pairing is a clean bipartition and leaves non-pair champions alone | transform-forms-helpers | unit | done |
| tform-05 | Both halves of every imported pair carry a `transform` block that points back at the other and repeats the same w3x facts; the four un-imported alternates leave `counterpartId` absent rather than inventing one | transform-forms-docs | unit | done |
| tform-06 | No champion doc outside the w3x table claims a `transform` link | transform-forms-docs-closed | regression | done |
| tform-07 | The per-level w3x numbers ride on the doc (sparse `{1,4}` for 妙蛙花; absent for the 風王結界 toggle) so the mechanic needs no second trip into the .w3x | transform-forms-doc-numbers | unit | done |
| tform-08 | No first-open-roster id is an alternate form, and the ten that were wrong now hold their base id-for-id | whitelist-no-alternate-forms | regression | done |
| tform-09 | Build the transform MECHANIC: form swap, revert on the map's own timer, reset to base per round. Owner is still deciding the auto-trigger conditions for the four passive-slot transforms | (task #119) | integration | pending |
| tform-10 | Import the four alternate bodies that have no champion doc (`H00W` / `O030` / `N01B` / `E010`) so every pair is complete | transform-forms-import-missing | integration | pending |
