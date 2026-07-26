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

**The roster swap moved the ECONOMY too, and that was missed once.** `content/config/store.json`'s
`championPrices` is the same 50-id set as `starterChampions`, and swapping the ten slots left it
holding the ten ALTERNATES: the swapped-in bases had no price (free on both sides — client
`lockStateOf` reads `price === undefined` as `"free"`, server `OwnsChampion` reads `!priced` as
`true`), and the swapped-out alternates kept theirs, so `FreeChampions()` went on seeding
`godie-h020` / `godie-o00x` / `godie-u01u` into every new account. Realigned by having each base
INHERIT the price of the alternate it replaced, so the economy shape is untouched at
**12 free / 38 priced @ 300**. Pinned in both directions by `tform-11` (Go) and its mirror in
`apps/game-server/src/curation/curationVsContentModel.test.ts`.

**拳四郎 got visibly worse, deliberately.** `godie-u00l` 北斗之鼠 wears the real
`imported.heropikachu`; the base `godie-umal` wears the CC0 stand-in `champ.skin.barbarian`, because
the map gives 拳四郎's base unit the Blizzard built-in VillagerMan1 and there is no mesh to import.
That is in policy per `starter.go` ("a shared stand-in mesh means the art is missing, not that it is
the same hero") and it is NOT a reason to put the alternate back on the roster. The existing skin doc
`content/skins/skin.godie-u00l.heropika.json` now hangs off an unpickable champion; re-pointing it at
`godie-umal` would be using the skin system to do a transform, which contradicts the owner's ruling,
so it is left for #119 / #116.

**The voice regression, and why it needed no assets.** The roster swap left the ten swapped-in
bases with NO combat voice: `content/assets/audio/voices/lines/` was generated against the OLD
roster, so it holds exactly the ten alternates. Owner ruling 2026-07-26 「變身前/後共用就好」 —
which is #249's own finding applied to audio, since `Eme1`/`Emeu` + the `unsf` sub-names already
prove the two halves are ONE character. So the pack is SHARED across the form link instead of
generating 460 duplicate clips.

*Which lookup actually needed it.* Five voice systems, and only one was short. `champion-voices.json`
(115 keys), the champ-select 稱號/全名 call-out (114), the 名言 pack (114) and the victory taunts (113)
**already cover both halves of every pair** — no fallback needed, and none was added. The gap was
`champions/MANIFEST.json` (51 keys), which is the ONLY source `contextualVoice.ts` reads: the click
has the name/quote rungs beneath it and was never silent, but combat has no floor, so the ten were
mute for every skill call-out, hurt grunt, kill line, death cry and win shout.

*Both layers, one table.* `packClips()` is the single reader; `resolveVoicePackId()` sends a
champion with no pack of its own to `counterpartFormId()`. `tools/voice-gen/index-lines.mjs` bakes
the same plan into the manifest (`sharedFrom` + a `formShares` header) so the mapping is inspectable
in the artifact, and the runtime resolution is the net for a STALE artifact — see `tform-16`, which
is not hypothetical. Direction-agnostic by construction: 10 alternate→base today, 9 base→alternate
(the direction #119's morph will need). `ROSTER.json` was NOT touched — it is a generated status
snapshot, and a share is playback, not generation.

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
| tform-11 | `content/config/store.json`'s `championPrices` and the first open roster are the SAME SET in BOTH directions, every price is 0 or the flat 300, and the economy keeps its 12-free / 38-priced shape — the guard that was missing when the ten swaps left the prices behind | whitelist-store-prices | regression | done |
| tform-12 | A stored wallet favourite naming a champion the catalog no longer carries is filtered out of every wallet read, while valid pins beside it survive and the durable record keeps all of them | meta-favourite-catalog-filter | regression | done |
| tform-13 | ~~Generate the 46-clip CosyVoice battle-voice pack for the ten swapped-in BASE heroes~~ — SUPERSEDED by the owner's 2026-07-26 ruling 「變身前/後共用就好」: a base and its alternate are ONE character, so the pack is SHARED across the form link instead of duplicating 460 clips. Closed by tform-14/tform-15 | transform-forms-voice-shared | regression | done |
| tform-14 | The share PLAN works in both directions on a real pair (alternate→base and base→alternate), never lends to a champion that owns a pack, lends nothing when neither half has one, and is order-independent + sorted so the generated manifest diff is stable | transform-forms-voice-share | unit | done |
| tform-15 | Every one of the 50 first-open-roster champions resolves to a non-empty combat voice pack in the SHIPPED manifest, through the real reader, with every clip on disk — and the failure message NAMES the mute champions. This is the regression that was missing when #249 swapped ten slots and left them silent | transform-forms-voice-coverage | regression | done |
| tform-16 | `pnpm voice:index` cannot regenerate `champions/MANIFEST.json` today: `godie-zombiex`'s four `skill-name.{q,e,r,ex}` clips fail the byte gate (status.json records takes that were never rendered — the audio on disk still speaks the pre-#244 skill names). PRE-EXISTING on main, unrelated to the form share, and it needs re-synthesis, not a metadata edit. The committed manifest is also stale for `godie-huth` / `godie-hvwd` / `godie-ogld` / `godie-osam` / `godie-udea` (texts + durations moved when `apply_skill_readings` ran) | (task #244) | integration | pending |
