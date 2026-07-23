# Fidelity Audit — Task #78 (48-champion roster: abilities + built items)

Reconciles the **shipped `content/`** for the 48 open-roster champions against the **WC3
source of truth**: the importer's parsed object data
(`tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json` — native ability/item fields) **and** the
JASS triggers (`.../raw/war3map.j`). Per [[ggd-source-map-recovery]], **JASS > tooltip > object
column**, and rawcodes resolve by exact `name` match (whitespace-normalized; one skill-name
fallback; duplicates disambiguated on cooldown/mana).

- **Scope:** 48 champions × Q/W/E/R/EX = **240 abilities**; **28 godie shop items** they build
  (`serrated-edge`/`swift-boots` are GGD-native, excluded).
- **Rawcode resolution:** 240/240 resolved (224 exact-name, 15 duplicate-name disambiguated,
  1 override `godie-o00k.q → A0BZ` "十萬伏特" which the source only carries under hero-58's name).
- **Verification:** `pnpm content:build` + `pnpm content:validate` → **green (1441 docs,
  cv_4a02f078d3a2)**; `@ggd/shared` abilityScaling/effects/statPipeline/compat → **green**. The
  two red suites (`ex-skills`, `loader`) are a **concurrent** augment-collection edit (Augments
  = 21 vs 3), pre-existing and unrelated to this task.
- **Discipline:** surgical only. Each fix is justified by a JASS line, a source data column, or a
  per-level tooltip. #82's 3-tier item economy and #11's `NN-XX` naming + the Q/W/E/R mirror rule
  (standalone doc **and** champion embed) were preserved — every fix wrote **both** files
  (0 desyncs verified).

Conversion constant: cast range GGD = WC3 `cast_range × 11/600` (`DIST`); ratio coeff regenerated
as `min(1.0, max(perRank) × 0.003)` per the importer's `_scaled` model.

---

## 0. Headline

| Area | Audited | Faithful as-shipped | **Fixed** | Left for user ruling |
|---|---:|---:|---:|---:|
| Abilities | 240 | ~205 | **19** | ~16 buckets (below) |
| Items | 28 | 28 | 0 | 3 (actives / tier-trim) |

19 abilities fixed: **5 cooldown**, **12 damage**, **1 damage→heal kind swap**, **1 damage→passive kind swap**.

---

## 1. ABILITIES FIXED (19)

### 1.1 Cooldown — stray rank-1 placeholder (5)
Four abilities shipped a phantom `cd rank-1 = 12` that contradicts **both** the source (flat) and
their **own tooltip** ("60秒冷卻時間"); one shipped the wrong flat value. Source `acdn` + tooltip agree.

| id | rawcode | source cd | shipped → **fixed** | justification |
|---|---|---|---|---|
| godie-e002.r | A0CT | 60 flat | `[12,60,60]` → **`[60,60,60]`** | src `[60,60]`; tooltip 60秒 |
| godie-e00r.q | A0O5 | 60 flat | `[12,60,60,60]` → **`[60,60,60,60]`** | src `[60,60,60]`; tooltip 60秒 |
| godie-n01c.q | A0CF | 60 flat | `[12,60,60,60]` → **`[60,60,60,60]`** | src `[60,60,60]`; tooltip 60秒 |
| godie-o00l.r | A0DT | 60 flat | `[12,60,60]` → **`[60,60,60]`** | src `[60,60,60,75]`; tooltip 60秒 |
| godie-osam.r | A0FP | 45 flat | `[60,60,60]` → **`[45,45,45]`** | src `[45,45,45]`; tooltip **45秒** |

### 1.2 Damage — degenerate / placeholder base restored (12)
These shipped either `~1 damage` (`[1,1,1,1]` / `[2,2,2,2]` — the ability did essentially nothing)
or the importer's generic `[80,120,160,…]` placeholder, while the real per-rank damage is
recoverable. **Values from JASS where present** (authoritative), else the per-level tooltip.
`ratios` coeff regenerated to `1.0` (all bases ≥ 350·0.003 cap).

| id | rawcode | shipped → **fixed** | source (JASS/tooltip) |
|---|---|---|---|
| godie-u010.e | A09I | `[1,1,1,1]` → **`[650,900,1150,1400]`** | JASS `400+250·L` |
| godie-u010.w | A09H | `[1×5]` → **`[250,400,550,700,850]`** | JASS `100+150·L` (tt L1-3 ✓) |
| godie-u010.q | A0OG | `[80,120,160,200,240]` → **`[250,350,450,550,650]`** | JASS `100·L+150` |
| godie-u01u.e | A06P | `[1,1,1,1]` → **`[300,450,600,750]`** | JASS `150·L+150` |
| godie-u00l.q | A0AF | `[80,120,160,200,240]` → **`[150,300,450,600,750]`** | JASS `150·L` (tt L1-3 ✓) |
| godie-u00j.w | A0ET | `[80,120,160,200,240]` → **`[150,250,350,450,550]`** | JASS `100·L+50` (tt L1-3 ✓) |
| godie-emfr.e | A052 | `[2,2,2,2]` → **`[400,600,800,1000]`** | src col2 + tooltip "400+智慧*4" |
| godie-u00j.q | A0S4 | `[1,1,1,1]` → **`[350,450,550,650]`** | per-level tooltip |
| godie-u00n.e | A0IV | `[1,1,1,1]` → **`[500,600,800,1000]`** | per-level tooltip |
| godie-ubal.e | A0OY | `[80,120,160,200]` → **`[300,450,600,750]`** | per-level tooltip |
| godie-u00j.e | A0F4 | `[2,2,2,2]` → **`[150,250,350,450]`** | per-level tooltip (per-explosion) |
| godie-ubal.w | A0KC | `[1,1,1,1]` → **`[450,450,450,450]`** | tooltip 450/s DoT (burst approx) |

### 1.3 Wrong effect KIND (2)
| id | rawcode | was | **fixed to** | justification |
|---|---|---|---|---|
| godie-e007.w 仙氣．採藥 | A02K | `damage [80,120,160,200]` targeting enemies | **`heal [250,500,750,1000]`**, `targetsEnemies:false` | tooltip "恢復生命…250/500/750/1000點" (a self-heal + cleanse; cleanse not modeled) |
| godie-emns.w 死神的規則 | A05G | `damage [80,120,160,200,240]` castable nuke | **passive** `ap+35, maxMana+105` (empty effects, `castType:self`, cd/mana 0) | tooltip "[被動]…化為智慧7點" = INT+7; mapped via the STR/AGI/INT→stat model, mirrors the e001.w passive pattern |

---

## 2. ITEMS (28 audited — 0 fixed)

Every **passive** stat family the source lists is already represented in content (task #108
restored the parsed modifiers; #82 rescaled magnitudes into the 3-tier budget). Comparing
stat *types* (not the intentionally-rescaled magnitudes) against each source item's 效能 block +
ability data columns found **no missing passive stat**. All apparent gaps fall into two
already-documented categories, neither of which is a fidelity bug to fix here:

- **Active-only payloads** — `item@1` has no active-cast slot (documented S3 rule,
  [[ggd-w3x-item-rawcodes]]). These carry the correct passive stats and simply cannot express
  their active: `godie-i003` 聖光石 (heal-500 active, **0 passive stats — correct**),
  `godie-i060` 死之王的意志 (death-lightning active; keeps 生命/回復 passives),
  and the block/mana-burn/AoE-nuke actives on i00j/i00f/i02x/i027/i06f etc.
- **Tier-budget rescale trims (#82)** — `godie-i06h` 求生護腕 has source 全能力+5 (all three
  attributes); content keeps the STR (ad+maxHealth) and INT (maxMana) portions but drops the
  AGI (armor/attackspeed) portion to fit the tier-1 budget. Adding it back would re-open the AEP
  budget, so it is **surfaced, not changed**.

---

## 3. NOT AUTO-FIXED — for the user to rule on

These are genuine source/shipped differences that are **ambiguous** or require re-authoring /
a sim primitive we don't have. Deliberately left untouched.

### 3.1 EX cooldown/mana differ from source (intentional?)
EX abilities are regenerated by `tools/w3x-import/gen_ex_content.py` with **curated marquee
values**, so they legitimately diverge from the multi-level source object. Confirm these are
intended, not drift: `godie-e008.ex` (src cd `[40,35,30]`/ship 60), `emns.ex`, `h02k.ex`,
`hvwd.ex`, `osam.ex`; mana likewise on `e00k.ex`, `n01c.ex`, `orkn.ex`, `u00j.ex`, `u01u.ex`,
`udea.ex`, `u00h.q`.

### 3.2 maxRank-extended abilities — rank-shifted mana (phantom rank-1 = 60)
Where content gives an ability **more ranks than the source has levels**, a cheap rank-1
(mana 60) was prepended and the real source values shifted up one rank. Damage is sometimes
aligned and sometimes not (inconsistent), so the intended per-rank cost curve is a design call:
`godie-e007.e`, `e008.q`, `emfr.w`, `hapm.q`, `hapm.w`, `o00x.q`, `o00k.w`, `ubal.r`, `udea.e`,
`u00h.q`. **Recommend:** decide whether the true source rank-1 (weakest) should sit at content
rank-1, and how the top extra rank(s) extrapolate.

### 3.3 Cast range clamped to ~14 GGD units
26 abilities have source `cast_range ≥ 900` (up to 9999/99999 sentinels) that map to a **~14-unit
cap** in content (e.g. `h020.e` 龍破斬 900→exp 16.5, shipped 14.0; `hpb1.w` 9999; `hvwd.ex`
99999). This looks like an **intentional arena-scale clamp**, not drift, but the legit 900-range
skills (16.5 units) are being cut ~15%. Confirm the cap or raise it for real (non-sentinel) ranges.
Full list: e002.e, e007.w/r/ex, emfr.r/ex, emns.ex, h00l.w, h020.e, h02k.ex, h02r.r, hapm.ex,
hpal.e, hpb1.w, hvsh.q, hvwd.e/ex, o00x.r, ogld.q/e, orkn.q, osam.ex, u00h.e, u00j.w/ex, ubal.ex.

### 3.4 Unmappable mechanics shipped as stand-ins (approximation, documented loss)
- **%-of-stat / mana-based damage** (no such sim primitive): `godie-udea.e` (target
  maxMana−mana), `u00k.r` (Σmana×15%), `u00k.e` (8% max-HP). Shipped as flat/`≈1` stand-ins.
- **Transform placeholders** — the `[80,120,160]` "damage" on `AEIl` metamorphosis abilities
  (`ofar.r` 瘋狂皮卡丘 — source col5 `[250,400,550]` is the **maxHealth** buff, not damage;
  `u00l.r` ChangeDNA; `ubal.r` 魔界之王) is a placeholder for a form-swap best modeled as a
  timed `applyBuff`.
- **Passive-as-nuke, un-modelable** — `u00k.w` 靈魂吸取 (stacking all-stats on kill) and
  `emns.q` 死神之眼 (30% miss debuff + self-sacrifice) still ship a `[80,120,160,…]` damage
  placeholder; both need mechanics the sim lacks (stacking-on-kill / miss-chance), unlike
  emns.w which was cleanly a flat passive and **was** fixed.
- **Summons** (impossible, per GAP_REPORT §1.4): `etyr.r` 聖夜降臨, `n00p.r` 億年樹 — left as-is.

### 3.5 Minor tooltip/JASS conflict
- `godie-u00l.q` (北斗懺悔拳): tooltip **L4** shows "力量*4+400" (400) while the JASS ramp gives
  **600** at L4. JASS is authoritative (used `[150,300,450,600,750]`); flagged in case the L4
  tooltip reflects a later map revision.

---

## 4. Method notes / reproducibility
Scratch scripts (in session scratchpad): `t78_audit.py` (cooldown/mana/range diff),
`t78_dmg.py` (damage-vs-source-column classifier), `t78_jass.py` (JASS damage-formula extractor),
`t78_items.py` (item stat-family coverage), `t78_patch.py` (applies the 19 fixes to both mirror
files, with backup). Backups of all 33 touched files under `scratchpad/t78_backup_*`.
