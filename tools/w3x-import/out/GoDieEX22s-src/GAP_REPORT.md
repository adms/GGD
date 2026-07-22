# GGD Source-Map GAP REPORT

Comparison of what the **unprotected source map** (`src_gogodieEX227s.w3x`) now makes
available vs. what `content/` currently holds. Analysis only — no content was edited.

Inputs used: `OBJECTS.json`, `STRINGS.json`, `JASS_INDEX.json`, `HERO_TRIGGERS.json`,
`HERO_NUMBERS.json`, `EX_MAP.json`, `import_report.json` (placeholder ledger), and the
raw `war3map.j` (2.8 MB, 4 719 named functions, 278 `GetSpellAbilityId` spell handlers).

Machine-readable side-cars written next to this file: **`ABILITY_GAP.json`**,
**`ITEM_GAP.json`**.

---

## 0. Top-line numbers

| Area | Headline |
|---|---|
| **Placeholder abilities** | 178 unique docs (169 content-backed). **135 are now ADDRESSABLE** from the source; **34 STILL-IMPOSSIBLE** (of which 16 = 4 unreleased empty heroes, so only 18 are truly lost). |
| **Stat-less items** | 97 total: **55 recipe scaffolds**, 21 token/fragment/pet stubs, 21 with a real WC3 item-ability (mostly **click-actives** → need an `active` schema field), 4 summon-actives. |
| **TEXT (biggest cheap win)** | **429 ability tooltips + 207 item descriptions + 100 champion lore blobs + 109 proper-names** available from source; content currently stores **0** — because `ability@1`/`item@1`/`champion@1` have **no description field at all** (needs a 1-line schema add, then bulk fill). |
| **EX skills** | **CONFIRMED**: R00R tech + unlock level 30 both present in JASS; 102 with EX / 9 without matches exactly. |
| **Transforms** | **CORRECTED**: not 4 — there are **17 `AEIl` metamorphosis abilities** (10 hero-slot + 7 EX-tier). All APPROXIMABLE via timed `applyBuff`. |

---

## 1. ABILITIES — the 194/178 placeholder nukes

### 1.1 Marker convention (how they were found)
Placeholders are **not** flagged inside the content JSON (no TODO/tag). They are recorded
in `out/GoDieEX22s/import_report.json → notes`, one line each:

```
godie-e001.r [A02Q base AEIl] illusions → placeholder nuke (TODO)
godie-e00u.q: no WC3 ability for slot Q → placeholder
```

- **178 `→ placeholder nuke (TODO)`** lines + **16 `no WC3 ability → placeholder`** lines = the "194".
- The 16 are 4 empty heroes × Q/W/E/R, each **double-noted** (also `[none base None] … nuke`), so the
  **true unique count is 178**; **169 have a content file** (9 belong to 5 *draft-only* champions
  not present in `content/champions/`).
- In the content JSON these render as a single `damage` effect with `amount.perRank:[0,0,0,0]`
  and the default `vfxKey:"fx.ember-bolt-cast"`.

### 1.2 Classification (content-backed = 169)

| Class | Count | Meaning |
|---|---:|---|
| **PORTABLE** | 9* | Mechanic maps 1:1 to an existing `EffectDef`; numbers recoverable. |
| **APPROXIMABLE** | 126 | Expressible as a faithful stand-in that loses one defining trait. |
| **STILL-IMPOSSIBLE** | 34 | Needs a sim primitive we don't have, or no recoverable logic. |

\* PORTABLE is **conservatively understated** by the automated scan: damage numbers usually live in
a *periodic* sub-trigger (e.g. `Bleach_Moon_Effect`), not the cast `_Actions` body the scanner read,
so many single-target/AoE nukes fell into APPROXIMABLE. The robust cut is **ADDRESSABLE (135) vs
STILL-IMPOSSIBLE (34)**. Crucially, the recovered **tooltips already state the exact formulas**
(e.g. `力量*0.4+350點傷害`, `一直線敵人450點傷害`, `暈眩1秒`), so most APPROXIMABLE actives become
clean ports once tooltip+JASS numbers are transcribed.

### 1.3 Mechanism sub-buckets (the actual worklist)

| Mechanism | Count | Class | How to close |
|---|---:|---|---|
| Passive / aura / on-hit (no cast handler) | 54 | APPROX | Move to `champion.passive` hook, or model as always-on `applyBuff`; auras lose ally-radius. |
| Hero-form **transform** (`AEIl` metamorphosis) | 28 | APPROX | Timed `applyBuff` stat pump for `hero_duration`; model/ability swap not simulated. |
| **Channel** (`ANcl`, tick logic in JASS) | 19 | APPROX | Burst or short DoT; JASS gives tick dmg × interval. |
| Triggered active (JASS recoverable) | 13 | APPROX→mostly PORTABLE | Transcribe JASS/tooltip numbers → `damage`/`applyStatus`/`dash`. |
| Dummy-caster / add-ability pattern | 10 | APPROX | Dummy that casts a stock spell → map to the stock effect (stampede→AoE dmg, etc.). |
| **Attribute bonus** (`Aamk`) | 6 | PORTABLE | Passive stat `modifiers` on the champion/ability. |
| Projectile / AoE nuke, heal, single nuke | 3 | PORTABLE | `spawnProjectile`+`damage` / `heal`. |
| **Summon / pet** (inferno, raise, serpent ward) | 6 | IMPOSSIBLE | Needs a summon primitive (not in sim). |
| **Illusion / clone** (`AOmi`, `AIil`) | 2 | IMPOSSIBLE | Needs clone-unit primitive. |
| Pure stub (no recoverable logic anywhere) | 10 | IMPOSSIBLE | Archetype unmapped, 0 JASS refs, no object-data effect. |
| Unreleased empty-hero slots (4 heroes ×4) | 16 | IMPOSSIBLE | No source ability — handle via **whitelist**, not backfill. |

### 1.4 STILL-IMPOSSIBLE (real, non-empty-hero) — 18 abilities

| id | rawcode | base | source name | reason |
|---|---|---|---|---|
| godie-e00q.w | AOsw | AOsw | 69-02 黑泥召喚 | summon (serpent ward) |
| godie-h001.e | A0PH | Arai | 41-03 召喚術 | summon (raise) |
| godie-etyr.r | A0SS | Arai | 14-04 聖夜降臨 | summon (raise) |
| godie-n00p.r / godie-nsjs.r | A0P7 | AUin | 18-04 億年樹 | summon (inferno-style) |
| godie-ecen.r | A0A3 | Ainf | 64-04 魔幻浮水印 | summon (inferno) |
| godie-n00b.w | A0NE | AIil | 57-03 複製鏡 | illusion/clone |
| godie-huth.e | A03T | AOmi | 28-03 分身 | illusion (mirror image) |
| godie-h02u.e / h02v.e | A0WA | ANab | 92-02 消化液 | pure stub |
| godie-h02y.q | ANic | ANic | 97-01 壹之秘劍-焰靈 | pure stub |
| godie-h02y.e | A0YG | AUav | 97-03 弱肉強食 | pure stub |
| godie-n01l.e | A0ZH | Aegr | 98-03 從過去中學習 | pure stub |
| godie-u00b.q | A075 | Aspb | 75-01 超．祕技略決 | pure stub |
| godie-u00b.e | ANto | ANto | 75-02 龍捲風 | pure stub |
| godie-harf.w | A0BS | Awar | 26-02 亂入 | pure stub |
| godie-opgh.w | A0TH | ANca | 32-02 橫掃千軍 | pure stub |
| godie-ogld.q | ANmo | ANmo | 72-01 洗刷刷 | pure stub |

> The 10 "pure stub" ones have a WC3 base code the importer never mapped and **no** `GetSpellAbilityId`
> handler; several may still be recoverable by reading their base-ability object data + tooltip
> (e.g. `龍捲風` = tornado, `橫掃千軍` = sweep) — worth a second manual pass before declaring them lost.

Full per-ability table in **`ABILITY_GAP.json`**.

---

## 2. ITEMS — the 97 stat-less items

All 97 are `godie-*` wc3-import items with no `modifiers` and no `passive`.

| Category | Count | Disposition |
|---|---:|---|
| **Recipe books** (`製作書` / scrolls) | 55 | Build-path scaffolding. GGD has no recipe/combine system — **flatten or skip**; not real items. |
| Token / fragment / pet stub (`兌換…`, `…碎片`, `認領寵物`) | 21 | Exchange tokens, set-item fragments, pet-claim items. Need set-item / pet systems (out of scope) — **skip / curate out**. |
| Real WC3 item-ability | 17 | Source reveals the effect; see below. |
| **Summon-active** (`出動…兵團` legions) | 4 | STILL-IMPOSSIBLE (summon primitive). |

### 2.1 The 17 with a real item-ability — schema blocker
Tooltips resolve their exact effects, e.g.:
- `山之書` — active fire-rain, 25/wave + 10/s DoT (10 s CD)
- `澤之書` — active heal 500 HP over 10 s
- `我愛一條柴` — active heal 150 HP over 7 s
- `雷神之鎚` / `黑色魔書` — active ground-pound nuke
- `復仇之袍` (`ACah`) — thorns/return-damage (**passive**)
- `雷神之鎚` also carries `AOeq`+`ANd1` — orb + chain-lightning **on-hit**

**Blocker:** `item@1` supports `modifiers` + `passive: HookDef[]` (on-hit hooks) but has **no
active-cast slot**. So:
- **~2-3 passive/orb items** (`復仇之袍` thorns, orb-on-hit procs) → **PORTABLE today** via `item.passive`
  hooks (`onDamageTaken` / `onBasicAttack`).
- **~15 click-active items** (element books, heal potions, ground-pound) → **need a new `active`
  field on `item@1`** (cooldown + manaless + `effects: EffectDef[]`). **Flag — do not implement here.**
  Once added, the tooltips give the numbers directly.

Full per-item table in **`ITEM_GAP.json`**.

---

## 3. TEXT — the single biggest, cheapest win

Content currently has correct **names** but **zero descriptions**, because the schemas
have no field for them:

> `champion@1`, `ability@1`, `item@1` define only `name` — **no `description`/`tooltip`/`lore`/
> `flavor`**. (Only `augment`, `skin`, `status-effect` have `description`.)

### 3.1 What the source now resolves (was gutted to ~30 strings before)

| Doc type | In content now | Source resolves | Gap |
|---|---:|---:|---|
| Ability tooltip/description | **0** / 554 | **429** (428 core Q/W/E/R + EX) | +429 |
| Item description/flavor | **0** / 212 | **207** / 208 matched | +207 |
| Champion lore / story | 0 | **100** / 111 heroes | +100 |
| Champion proper-name (character vs title) | 0 | **109** / 111 | +109 |

- Ability **names** are already exact: for the 428 mapped core slots, content name ==
  source name minus the `NN-XX ` prefix, **0 mismatches**.
- All 428 source names carry the `NN-XX` prefix → **task #11** (restore prefix) is a pure
  formatting pass over exactly these 428.
- Tooltips double as **mechanics documentation** — they state damage formulas, CC durations,
  orb/passive flags (`[主動]` active / `[被動]` passive / `法球效應` orb) — feeding §1 directly.

### 3.2 Recommended sequence
1. Add optional `description` (and `flavor`/`lore`) to `ability@1`, `item@1`, `champion@1`
   (+ `properName` on champion). ~1 schema change.
2. Bulk-fill from `OBJECTS.json` (`tooltip`/`ubertip`/`description`) resolved through `STRINGS.json`;
   strip WC3 color codes with `src_text.strip_codes`.
3. This is the highest value-per-effort item in the whole backfill.

---

## 4. EX + TRANSFORM verification

### 4.1 EX skills — CONFIRMED
- `EX_MAP.json`: `unlockTech = R00R`, `unlockLevel = 30`, `championsWithEx = 102`,
  `championsWithoutEx = 9`, 102 hero entries.
- Content: **102 champions have `exAbility`, 11 without** — 9 w3x heroes + 2 GGD-native
  (`thorne`, `sela`). Matches exactly.
- **R00R is present in the source JASS** — `SetPlayerTechResearchedSwap('R00R',1,…)` at lines
  5295 and 8349 of `war3map.j`, confirming EX is gated behind that research. Reverse-engineered
  mapping is **validated**.
- The 9 w3x no-EX heroes: `godie-u00b` 飛鼠先生, `godie-o02s` 涼宮, `godie-e012` 佐佐木小次郎,
  `godie-o02o` 曹操孟德, `godie-h021` 阿強一號, + the 4 empty heroes below.

### 4.2 Transforms — CORRECTED (4 → 17)
Prior state listed only **4** `AEIl` transforms (`A0EW`,`A0ND`,`A0YT`,`A0DB`). The source shows
**17 `AEIl` metamorphosis abilities** total, each with a per-level `hero_duration`:

**10 hero core-slot transforms** (all previously mislabeled "illusions"):

| rawcode | name | lvl-1 dur | slot examples |
|---|---|---:|---|
| A02Q | 22-04 雛見澤症候群L5 | 7s | godie-e001.r |
| A02W | 12-03 破凰之心-徒手空破山 | 12s | godie-e007.e |
| A040 | 58-04 瘋狂皮卡丘 | 6s | godie-o02l.r |
| A09E | 09-03 超級賽亞人 | 8s | godie-o00x.e |
| A0DB | 87-03 天下號令 | 6s | godie-o02n.e |
| A0EW | 26-04 開天闢地‧洨者聖臨 | 7s | godie-h00w.r |
| A0HW | 25-04 ChangeDNA | 8s | godie-u00l.r |
| A0IH | 18-03 妖狐變化 | 8s | godie-n00p.e |
| A0JG | 77-03 GLADIARIA ALAT | 6s | godie-e00w.e |
| A0ND | 40-03 萬解-貓王胖虎 | 12s | godie-n01b.e |

**7 EX-tier / special transforms** (`NN-002` naming = EX slot): `A06K` 魔力印章, `A0OE` 惡夢魔王的碎片,
`A0SZ` 紫色披風, `A0T1` 龍魔人, `A0XP` Exellion Mode, `A0YT` 變態紳士 (臭作), `A10N` 武裝色霸氣.

→ All 17 are **APPROXIMABLE**: a timed `applyBuff` (stat pump for `hero_duration[level]`).
The visual model/ability swap is not simulated; only the stat/behavior boost is.

---

## 5. WHITELIST input (curation, default-off)

The completed whitelist (task #4) should default these OFF.

### 5.1 未開放英雄 (unreleased folder, 13) → champion id
| folder | triggers | in content? |
|---|---:|---|
| 騜 | 15 | **godie-e00j** |
| 志志雄真實 | 0 | **godie-h02y** |
| 十六夜 | 4 | **godie-e00u** (empty hero) |
| 學姊 | 12 | **godie-n01l** |
| 初音未來 | 9 | **godie-o02p** (夢幻之星 - 初音) |
| 火拳愛斯, 林默娘, 彗星小雞, 木偶人, 三本柱, 愛德華, 賣火柴小女孩, 基紐 | 0-9 | **not imported** — no champion doc (no action needed) |

→ **5 unreleased champions exist in content** and should be whitelisted default-off:
`godie-e00j`, `godie-h02y`, `godie-e00u`, `godie-n01l`, `godie-o02p`.

### 5.2 Test / empty-shell heroes (the 16 "no WC3 ability" placeholders = 4 heroes × QWER)
| id | name | note |
|---|---|---|
| godie-e00u | 完全而瀟灑的女僕 - 十六夜Sakuya | unreleased + empty |
| godie-h02n | 腦包英雄 - 打我阿笨蛋 | test/joke, empty, no EX |
| godie-u01f | 萬夫莫敵 - 黑化張飛 | empty, no EX |
| godie-u01q | 測試英雄 - 索隆 | literally "test hero", empty, no EX |

→ These 4 have **no source abilities and no EX** — whitelist default-off (or exclude from roster).

### 5.3 Team roster (for reference / grouping)
Trigger-folder teams: 愛與和平 27, 去死去死 26, 中立隱英及尚未分類 24, 未開放英雄 13.
(`HERO_TRIGGERS.json → teams` is the machine-readable source.)

---

## 6. Prioritized worklist

1. **TEXT backfill (P0, cheapest/highest value)** — add `description`/`flavor`/`lore`/`properName`
   fields to 3 schemas, then bulk-fill 429 ability tooltips + 207 item descriptions + 100 champion
   lore + 109 proper-names from `OBJECTS.json`/`STRINGS.json`.
2. **Restore `NN-XX` ability-name prefix** (task #11) — 428 core slots, pure formatting.
3. **Whitelist default-off** the 5 unreleased + 4 test/empty heroes (§5).
4. **Port ADDRESSABLE placeholder abilities (135)** using tooltip formulas + JASS:
   attribute bonuses & simple nukes first (PORTABLE), then transforms (28, timed `applyBuff`),
   channels (19), passives/auras (54).
5. **Add `active` field to `item@1`** (schema), then port ~15 click-active items; ~3 passive/orb
   items are portable today.
6. **Accept as impossible for now (18 + 16):** 6 summon + 2 illusion + 10 pure-stub abilities, and
   the 4 empty heroes — revisit only if a summon/illusion primitive is added to the sim.
