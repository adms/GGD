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

---
---

# Wave B — WHOLE-BRANCH extension + AP-coefficient review

The first pass (§§0–4 above) covered only the **48-champion open roster**. A whole-branch sweep
for degenerate scaling (`perRank` all in `{0,1,2,3,1.1}` **or** a placeholder tiny coeff `≤0.01`)
found **22 more stub effects across 17 champions** the first pass never touched — including an
**ULTIMATE that dealt 1 damage** (`godie-o02v.r` Starlight Breaker Plus: `perRank [1,1,1]`,
coeff `0.003`). Wave B restores all 22 and reviews the AP coefficients the ×0.003 model produced.

Same source-of-truth priority (**JASS > tooltip > object column**), same rawcode-by-name
resolution, same **mirror rule** (standalone doc **and** champion embed written together — **0
desyncs** verified across all 22). Rawcodes: all 22 resolved (18 exact-name, 4 duplicate-name
disambiguated on cd/mana; `hart.w`→A0UX + dummy A0UY, `uvng.w`→A09H vs A09M, `udea.e`→A0CH,
`o00l.e`/`o02s.r`→A07T vs the mana-0 `-x` clone A0DS).

**Verify:** `pnpm content:build` + `pnpm content:validate` → **green (1441 docs,
`cv_6be57ae78468`)**; `@ggd/shared` full suite (incl. abilityScaling / effects / statPipeline via
statModifier folding) → **green (63 files, 611 tests)**. The two suites the first pass reported red
(`ex-skills`, `loader`) are **green** now (the concurrent augment edit landed).

## B.0 Headline

| Bucket | Count | Fix |
|---|---:|---|
| Damage restored (JASS/tooltip authoritative) | 9 | real per-rank base |
| Damage restored — **mana/%-based STAND-IN** (flagged approx) | 2 | non-degenerate placeholder |
| Barrel Shot — JASS `INT×4` (level-indep) + slow % fix | 2 | light dmg + true 80% slow |
| **Wrong KIND** (nuke/shield ≠ tooltip) | 9 | shield / slow / stun / root |
| **Total abilities** | **22** | (×2 mirror files = 44 writes) |

**Wrong-KIND breakdown:** 2 nuke→pure-slow (`麻痺粉` ×2), 2 nuke→magic-barrier (`破法對咒`
×2), 1 nuke→mana-drain+disarm (`吸星大法`), 1 nuke→stun-only (`獨孤九劍`), 1 shield→root
(`綁架`), plus the 2 Barrel Shots (nuke stub → light dmg + corrected slow). No ability now ships
dealing 1 damage.

## B.1 Damage restored — authoritative (9)
`ratios` = single `ap` coeff **0.6** (see B.4). Kept each ability's existing stun/slow sub-effect.

| id | rawcode | shipped → **fixed** | source |
|---|---|---|---|
| godie-e00v.r 給我蜂蜜 | A0CX | `[1,1,1]` → **`[500,800,1100]`** | JASS/tt `500+力量·L … 1100+力量·3` |
| godie-hapm.r 巨神一擊 | A0U8 | `[3,3,3]` → **`[600,1000,1400]`** | JASS `200+400·L` (tt ✓) |
| godie-hart.w 隕石擊 | A0UX | `[1×5]` → **`[200,400,600,800,1000]`** | JASS `100·L` × **2 hits** (meteor+slash) |
| godie-etyr.r 聖夜降臨 | A0SS | `[1,2,3]` → **`[200,400,600]`** | tt cast-burst; summon unmodeled (§B.5) |
| godie-o01z.e 奈葉 Divine Buster | A0XN | `[1,1,1,1]` → **`[400,600,800,1000]`** | per-level tt |
| godie-o02v.e 白惡魔 Divine Buster | A0XN | `[1,1,1,1]` → **`[400,600,800,1000]`** | per-level tt (twin embed) |
| godie-o01z.r 奈葉 Starlight Breaker | A0XO | `[1,1,1]` → **`[400,700,1000]`** | per-level tt |
| godie-o02v.r 白惡魔 Starlight Breaker | A0XO | `[1,1,1]` (**ULT@1dmg**) → **`[400,700,1000]`** | per-level tt (twin embed) |
| godie-udre.e 阿修羅壹霧銀 | A06P | `[1,1,1,1]` → **`[300,450,600,750]`** | JASS `150·L+150`; **rawcode-twin of u01u.e** |
| godie-uvng.w 邪王炎殺煉獄焦 | A09H | `[1×5]` → **`[250,400,550,700,850]`** | JASS `100+150·L`; **rawcode-twin of u010.w** |
| godie-e00j.q 謝謝指教 | A0Y7 | `[1×5]` → **`[240,360,480,600,600]`** | JASS `30`/50-dist × maxdist `400…1000`/50 (see §B.5) |

(11 rows — `o01z.e`/`o02v.e` and `o01z.r`/`o02v.r` are two-champion twins of the same skill.)

## B.2 Damage restored — mana/%-based STAND-IN (2, flagged §B.5)
No sim primitive scales damage off the **target's** mana pool (ratios are caster-stat only), so
these keep a **documented non-degenerate placeholder** instead of the old `[1,1,1]`. They are
**approximations pending design**, not faithful values.

| id | rawcode | shipped → **fixed** | true formula (unmodelable) |
|---|---|---|---|
| godie-u00k.r 萬惡歸宗 | A0HK | `[1,1,1]` → **`[150,300,450]`** | Σ(nearby mana)×`15/30/45%`; stand-in = 15/30/45% of a nominal 1000 pool |
| godie-udea.e 魔法膨脹 | A0CH | `[1×5]` → **`[200,400,600,800,800]`** | `(target maxMana−mana)×1‥4`; stand-in on a nominal ~200 deficit |

## B.3 Wrong effect KIND (9) — was a damage/shield nuke, tooltip says otherwise
| id | rawcode | was | **fixed to** | justification |
|---|---|---|---|---|
| godie-h02r.w 麻痺粉 | A0NB | `damage[1×4]`+slow | **slow-only** `moveSpeedMult 0.4` (−60%), `dur 4` | tt `[輔助]…減緩速度60%` — no damage |
| godie-hgam.w 麻痺粉 | A0NB | `damage[1×4]`+slow | **slow-only** (same) | same skill, 2nd champion |
| godie-o00l.e 破法對咒 | A07T | `damage[1×4]`+slow | **`shield [650,1300,1950,2600]` dur 6**, `targetsEnemies:false` | tt `[輔助]…承受住…點的法術傷害` = a barrier |
| godie-o02s.r 破法對咒 | A07T | `damage[1×3]`+slow | **`shield [650,1300,1950]` dur 6**, `targetsEnemies:false` | same skill on R (3 ranks) |
| godie-o02w.e 吸星大法 | A0Y0 | `damage[1.1×4]` | **`applyBuff as×(1−1.0)`→clamp 0.2 + move-slow 0.8**, `dur 3` | tt/JASS = drain `200·L` mana + 100% AS / 20% MS slow; mana-drain unmodeled (§B.5) |
| godie-o02w.r 獨孤九劍 | A0Y5 | `damage[1×3]`+stun0.3 | **stun `1.0` only** | tt summons `30/50/70`-AD afterimages + 暈眩1秒; illusions unmodeled (§B.5) |
| godie-orkn.q 綁架 | A09L | `shield[1×5]` | **`applyStatus root` dur 1.0** | tt `[輔助]…綑綁` = a 1s bind, never a shield |
| godie-o01z.q Barrel Shot | A0XG | `damage[3×4]`+slow0.6 | **`damage[80,120,160,200]` + slow `0.2`(−80%)** | JASS deals `INT×4` (level-indep) magic; tt slow 80% — old 40% slow wrong too |
| godie-o02v.q Barrel Shot | A0XG | `damage[3×4]`+slow0.6 | **same** | twin champion |

## B.4 AP-COEFFICIENT REVIEW (user-requested)
**Finding — the shipped coeff is not a considered value.** Every `ap` coeff in `content/` was
machine-generated by the importer as `coeff = min(1.0, max(perRank) × 0.003)`. It is a function of
**base-damage magnitude**, capped at 1.0 — so *any* ability whose top rank ≥ 333 collapses to
`1.0` (= 100% AP scaling) regardless of role. That cap, not a design choice, is the "blanket 1.0"
the task flags: **107 damage effects** currently sit at coeff 1.0.

**Role reality of the flattening (measured):** all **107** cap-1.0 effects belong to **fighters
(79)** and **marksmen (28)** — champions whose `baseStats.ap = 0` and who carry **no ap growth**.
100% AP scaling on a zero-AP class is the least role-appropriate value possible; it only ever bites
if that champion itemises AP, and then it bites *identically* for a bruiser's cleave and a mage's
nuke. (The roster taxonomy is near-binary — 111 of 113 champions are fighter/marksman, 1 mage, 1
bruiser — so there is no data to auto-derive per-role curves from.)

**What Wave B did.** All 17 restored champions are off-AP fighter/marksman, so the role-appropriate
coeff for this whole batch is one **moderate, sub-cap** value rather than the 1.0 cap. I set every
restored damage effect (incl. the two mana stand-ins and the shields) to **`ap 0.6`** — the roster's
**modal** shipped coeff (30 abilities already ship 0.6 = the 200-damage tier) and squarely inside
the existing distribution, so it de-flattens without inventing an out-of-band number. This is a
considered value, not the ×0.003 auto-fill.

**Not changed — flagged for design sign-off (§B.5).** Re-coefficienting the other **107** cap-1.0
effects is a roster-wide balance decision across champions Wave B does not otherwise touch, and the
role data is too coarse to auto-apply safely. Left as-is and listed below rather than guessed.

## B.5 NEEDS DESIGN SIGN-OFF (Wave B)
1. **Roster-wide AP-coeff flattening (107 effects).** ~~The ×0.003-cap put 107 magic-damage effects
   (79 fighter, 28 marksman — all zero-AP classes) at coeff 1.0. **Recommend:** a role policy —
   e.g. off-AP fighter/marksman magic abilities → ~0.4‑0.6, reserve ≥0.8 for genuine AP-scaling
   casters — applied roster-wide once design signs off. Wave B's 22 already follow this at 0.6.~~
   **→ RESOLVED in Wave C (§C).** User-approved damage-type/identity policy applied roster-wide to
   all 272 magnitude-derived effects (the 107 cap-1.0 + the fractional rest), not just the 107.
2. **Rawcode-twin coeff divergence.** ~~`udre.e`/`uvng.w` (Wave B, now 0.6) share rawcodes A06P/A09H
   with first-pass `u01u.e`/`u010.w` (still cap-1.0). Identical WC3 skill, two coeffs. Fold together
   when #1 is decided (both to the same role value).~~ **→ RESOLVED in Wave C (§C.5):** A06P twins
   `u01u.e`/`udre.e` (索隆, physical) now agree at `ad 0.5`; A09H twins `u010.w`/`uvng.w` (飛影,
   magic) now agree at `ap 0.6`.
3. **Un-modelable mechanics shipped as documented stand-ins:**
   - **Target-mana-based damage** — `u00k.r` (Σmana×%), `udea.e` ((maxMana−mana)×N): ratios are
     caster-stat only, so these are flat placeholders (§B.2), not faithful. Also lose `u00k.r`'s
     "夜間+500" (time-of-day unmodeled).
   - **`吸星大法` mana-drain** (`200·L` steal→self) — no mana-burn primitive; the 100% AS / 20% MS
     slow **is** modeled, the drain is not.
   - **Summons** — `etyr.r` 式神, `o02w.r` 獨孤九劍 afterimages: no unit-summon primitive; their
     on-cast **damage/stun is** modeled, the summoned units are not (consistent with §3.4 `etyr.r`).
   - **`謝謝指教` (e00j.q)** is a knockback: `30`/50-dist tick + a `龍氣` wall-burst (`80/160/240/320`).
     Modeled as one instance = full-slide tick total (`30 × maxdist/50` = `240/360/480/600`); the
     wall-burst is the *alternative* branch (comparable magnitude), not double-counted.
4. **`破法對咒` barrier** absorbs **magic** damage only in WC3; the GGD `shield` primitive is
   damage-type-agnostic (absorbs all) — a small modeling widening, surfaced not fixed.

## B.6 Reproducibility
Session scratchpad: `resolve2.py` (name→rawcode + cd/mana disambiguation), `tips.py` (per-level
ubertip dump), `coeff_analysis.py` (coeff×role×damageType join), `patch.py` (applies all 22 to both
mirror files, dry-run default, backups). Pre-edit backups of all 22 ability + 17 champion files under
`scratchpad/t78b_backup/`.

---

# Wave C — AP/stat coefficient re-policy (roster-wide, user-approved)

Wave B (§B.4/§B.5.1) deferred the roster-wide coefficient fix pending sign-off. Wave C **is** that
pass, now approved. The importer keyed every damage effect's stat scaling to base-damage magnitude
(`coeff = min(1.0, max(perRank)×0.003)`), collapsing 107 effects to `ap 1.0` and scattering ~165
more across fractional `ap` — all on stat `ap`, on a roster where **every** imported champion has
`baseStats.ap = 0` and no ap growth (a fighter/marksman only scaled off ap if it *bought* ap, and
then a bruiser's cleave scaled identically to a mage's nuke). Wave C replaces the whole
magnitude-derived population with role/damage-type values.

## C.0 Schema fields used
A damage effect is `{ kind:"damage", damageType:"physical"|"magic"|"true", amount:Scaling }`, and
`Scaling.ratios = [{ stat, coeff }]` (`packages/shared/src/sim/effects/effect.ts`). There is **no
separate `ap`/`ad` field** — the scaling stat is whichever `stat` a ratio names. The scaling stat is
**bound to `damageType`** by the sim's contract, pinned in `abilityScaling.test.ts` **fx-16**: a
ratio must be `ad` **iff** `damageType==="physical"`, else `ap`; coeff ∈ (0, 1]. **fx-15** further
requires every scalable damage effect to carry exactly one ratio (`ap 0` / bare effect is illegal).
Consequences that shaped this pass:
- "Physical fighter → AD scaling" is realizable **only** as `damageType:"physical"` + an `ad` ratio.
  Keeping `damageType:"magic"` while adding an `ad` ratio fails fx-16; setting `ap:0` fails fx-15/16.
  So a physical re-classification **necessarily flips `damageType` to `physical`** (armor-resisted
  rather than MR-resisted). This is the minimal, test-valid way to carry an AD coefficient — not
  scope creep. **112 effects** had `damageType` flipped magic→physical for this reason.
- Magic effects keep `damageType:"magic"` + an `ap` ratio.
- The **per-rank base and `flat` are never touched** — only `ratios` (and, for physical, `damageType`).

## C.1 Policy applied
For every imported damage effect **except** the `NO_NATIVE_RATIO` exemptions (kept ratio-less, faithful
to a source formula with no AP-shaped term — see fx-15 / §B.5.3):

| classification | damageType | ratio stat | coeff Q/W/E | coeff R/EX |
|---|---|---|---|---|
| **Magic** (caster) | `magic` (kept) | `ap` | **0.6** | **0.7** |
| **Physical** (weapon fighter) | `physical` (set) | `ad` | **0.5** | **0.6** |
| **True / flat-utility** | — | — | (none present in roster) | |

The ult/EX band-top bump is the only spread — it honors that an ultimate is a larger build
commitment while staying inside the policy bands (magic ~0.5–0.7, physical ~0.4–0.6). The #78 per-rank
**base** still carries every ability's magnitude; the coeff now carries only "how much your build
matters," uniform by role. That de-couples coeff from raw damage, which was the whole defect.

**Classification is damage-type-driven but identity-informed.** The imported `damageType` is
unreliable (the importer stamped 277/278 effects `magic`), so magic-vs-physical was decided from
**character identity + ability theme** per policy: elemental (fire/ice/lightning/wind), holy/light,
spirit/curse, dark magic, and energy-ki/aura projection → **magic (AP)**; blade/fist/claw/spear/gun/
body weapon combat → **physical (AD)**. Caster-identity fighters get AP despite `role:"fighter"`
(依文潔琳 ice, 高町奈葉/菲特 Nanoha-verse, 莉娜 black-mage, 悟空 ki, 涅吉 magic-teacher…); weapon
fighters get AD (索隆/克勞德/賽菲洛斯 swords, 金鋼狼 claws, 拳四郎 Hokuto fists, 趙子龍/呂布/張飛
spears, 魯夫 rubber body).

## C.2 Counts (deliverable)
- **272 imported damage effects re-coefficiented** — the 107 cap-1.0 **plus** the ~165 fractional
  (the entire magnitude-derived population, per "whole roster on a principled basis").
  **Split: 160 → magic-AP · 112 → physical-AD · 0 → true.** Both mirror copies of each Q/W/E/R were
  updated identically → **0 desyncs** (528 standalone+embedded writes across 379 files).
- **3 damage exemptions untouched** (ratio-less, faithful): `edem.q` 火遁 (`…+2·AGI`), `h01u.e`
  鬼神烈戟 (`…+3·STR`), `o00k.r` 打雷絕招 (flat/level) — no AP-shaped source term (§B.5.3).
  (`o02p.r` is a heal exemption, outside this pass's damage scope.)
- **109 imported champions classified: 63 magic · 46 physical.** The 2 hand-authored skeleton
  champions (`sela` mage → ap, `thorne` bruiser → ad+physical) already model the schema correctly
  and were left untouched — they are the template this policy generalizes.

## C.3 Per-champion classification
**Magic → AP (63 ids):** 龍宮…→ see below. Grouped by character (duplicate godie-ids share a kit):
七夜怪談-貞子 `e00t` · 藤井八雲 `hpal` · 死亡騎士/不良少年 `h02s,h02z` · 皮卡娘 `o00k` · 斑剎 `h001`
· 胖虎 `nman` · 黑崎一護 `h01n,h01o` · 初音 `o02p` · 夜神月 `emns` · 藏馬 `n00p,nsjs` · 約翰走路
`ecen` · 宇智波佐助 `edem` · 哆拉A夢 `n00b` · 志志雄真實 `h02y` · 賈修貝爾 `hblm` · 涼宮八 `o02s`
· 揍敵客桀諾 `efur` · 菲特 `ntin` · 清蒸飛鼠 `u00b` · 大刀(exam) `ekee` · 梅杜莎Rider `hvsh` ·
異形 `usyl` · 木乃香 `etyr` · 夏娜 `e008` · 殺生丸 `osam` · 傑洛士 `o00l` · 白木卡迪那 `e00s` ·
涅吉 `emfr,h022` · 高町奈葉 `o01z,o02v` · 騜 `e00j` · 草泥馬 `h02u,h02v` · 阿強一號 `h021` · 皮卡丘
`o02l,ofar` · 妙蛙種子/花 `hgam,h02r` · 令狐沖 `o02w` · 黑人牙膏 `ogld` · 至尊學長 `udea` · 牧太郎
`obla` · 悟空 `o00x,ogrh` · 魔人普烏 `huth` · 死之王 `u00k` · 飛影 `u010,uvng` · 煌Gundam `hlgr` ·
桔梗 `hvwd` · 臭作 `orkn` · 撒尿牛丸 `uwar` · 巴恩大魔王 `ubal` · 依文潔琳 `n003,n01g` · 莉娜因巴斯
`h020,hjai` · 天地志狼 `e007,ewar`.

**Physical → AD (46 ids):** 金鋼狼 `othr` · 索隆 `u01q,u01u,udre` · 呂布奉先 `h01u`* · 亞瑟王Saber
`e002,e00l` · 黑化Saber `e00q` · 勇者小呆 `n01c,nbbc` · 拳四郎 `u00l,umal` · 熊貓 `h02k` · 金居福
`e015` · 棗真夜 `ewrd` · 十六夜Sakuya `e00u` · 趙子龍 `opgh` · 安云Azumi `e00k,e00z` · 林克 `h00l`
· 曹操 `o02o` · 克勞德 `hart` · 克勞薩I/II `u011,u012` · 佐佐木小次郎 `e012` · 海克力斯Berserker
`hapm` · 風魔小次郎 `naka` · 蒼月潮 `hpb1` · 維尼 `e00v` · 賽菲洛斯 `u00j` · 櫻綻剎那 `e00w,e00x` ·
傑(Gon) `u034,ucrl` · 打我阿笨蛋 `h02n` · 魯夫 `u00n,u00o` · 黑化張飛 `u01f` · 龍宮禮奈 `e001,e00n`
· 瘋狂假面 `nbst` · 鄭先生 `harf` · 麻倉葉 `nplh` · 鬼畜狂刀KYO `u00h` · 鬼王達 `oshd` · 基廉列克
`u00v`.  *`h01u` is physical-classed but its only damage ability `h01u.e` is a `NO_NATIVE_RATIO`
exemption, so it received no coefficient change.

## C.4 Judgment calls (each resolved to the champion's dominant theme, not left at cap)
- **Sword/fist + elemental → MAGIC** (element is the damage): 夏娜 (flame blade), 志志雄 (fire 秘劍),
  飛影 (darkness-flame sword), 一護 (Getsuga energy wave), 令狐沖 (混元掌 qi-palm), 撒尿牛丸 (火雲掌),
  殺生丸 (demonic energy blades).
- **Weapon-based despite spirit/nen/style flavor → PHYSICAL**: 麻倉葉 (spirit-charged katana), 蒼月潮
  (獸矛 spear), 風魔小次郎 (shuriken/blade), 傑 Gon (enhancer fist), 勇者小呆 (sword), 鬼畜狂刀KYO &
  賽菲洛斯 (elemental-named sword schools — kept physical for FF7/sword-saint coherence).
- **Energy/aura martial artists → MAGIC** (悟空 ki, 天地志狼 仙氣, 騜 戰氣) vs **bare-fist martial art
  → PHYSICAL** (拳四郎 — Hokuto destroys by touch, no projection).
- **Gag / abstract**: 約翰走路 (whisky+robot → magic), 大刀 exam-prof (abstract → magic), 哆拉A夢
  (gadgets → magic), 草泥馬/異形 (acid/bio → magic), 初音/胖虎 (sound → magic); 熊貓 (roulette gun),
  維尼/克勞薩 (thrown object), 打我阿笨蛋/鄭先生 (themeless melee) → physical.

## C.5 §B.5 items resolved
- **§B.5.1 (roster-wide flattening) — RESOLVED**, and extended past the 107 to the fractional
  population for one consistent policy.
- **§B.5.2 (rawcode-twin divergence) — RESOLVED**: A06P twins `u01u.e`/`udre.e` (索隆, physical) →
  both `ad 0.5`; A09H twins `u010.w`/`uvng.w` (飛影, magic) → both `ap 0.6`. The uniform per-slot
  policy folds twins together automatically.
- §B.5.3 (un-modelable mechanics) and §B.5.4 (magic-only barrier) are unchanged by Wave C.

## C.6 Verify
`pnpm content:build` + `content:validate` GREEN — **contentVersion `cv_31aca38e2fb6`** (was
`cv_6be57ae78468`). `pnpm --filter @ggd/shared test` GREEN (611/611; `abilityScaling` fx-15..19 and
`sim/effects` included). Owned files only (`content/abilities/**`, `content/champions/**`, this doc).
Scratchpad `reclass.py` = classification map + pure per-slot transform, applied identically to both
mirror files (dry-run default), so standalone↔embedded stay in lockstep.
