# GGD Ability Backfill — PORTED ABILITIES

Port pass over the placeholder-nuke abilities, now that the unprotected source map
(`src_gogodieEX227s.w3x`) yields readable JASS + full object data + tooltips.

**Scope discipline:** quality over count. Every ported number is traceable to the map —
either a JASS trigger body (`raw/war3map.j`) or w3a object data / ubertip
(`OBJECTS.json`). Nothing guessed. Where a defining mechanic is inexpressible in the
current `EffectDef` vocab, the ability was **skipped and re-classified** (see §3) rather
than shipped badly.

**14 ability instances ported** (10 distinct source abilities) across 14 marquee heroes.
Each edit touched BOTH the standalone `content/abilities/<id>.json` **and** the embedded
copy in `content/champions/<hero>.json → abilities[SLOT]` — the sim registers the embedded
champion copy last (`sim/content/registry.ts:44`), so it is authoritative; the two are kept
byte-identical minus the `schema` key. All 28 docs pass `zAbilityDoc` / `zChampionDoc`
schema parse.

Schema used (no extensions — another agent owns `packages/shared`): `damage{damageType,
amount.perRank[]}`, `applyStatus{statusId,duration,stun}`, `applyBuff{modifiers[],duration}`.
Key constraint discovered: **`damage.amount.perRank` is a per-rank array, but `applyBuff`
modifiers/duration are single fixed values** — so damage nukes port rank-faithfully, while
rank-scaling buffs cannot (drives several §3 skips).

---

## 1. Ported — damage nukes (rank-faithful `perRank`)

| Ability (source) | rawcode | Instances / hero | Provenance (JASS / object data) | EffectDef mapping | Was |
|---|---|---|---|---|---|
| 月牙天衝 Bleach Moon | A0LL | `godie-h01n.e`, `godie-h01o.e` 黑崎一護 | JASS `Trig_Bleach_Moon_Actions` (war3map.j:37505): `BleachMoonDam = 300 + level*150`, line projectile 1000 range | `damage` magic perRank **[450,600,750,900]** | dmg [80,120,160,200] |
| 藤鞭 Vine | A0Y4 | `godie-h02r.e` 妙蛙花, `godie-hgam.e` 妙蛙種子 | JASS `Trig_Vine_Actions` (war3map.j:26677): `Frog_Vine_Damage = 200 + 150*level`, `DAMAGE_TYPE_MAGIC` | `damage` magic perRank **[350,500,650,800]** | dmg [1,1,1,1] |
| 科奇利族的迴旋鏢 Fan Toss | A0BO | `godie-h00l.q` 林克 | JASS `Trig_Initiate_Fan_Toss_2` (war3map.j:45961): `FanTossDamageLink = 50 + 100*level` | `damage` magic perRank **[150,250,350,450,450]** | dmg [80,120,160,200,240] |
| 薩喀爾 Zaker | A08Z | `godie-h021.q` 阿強一號, `godie-hblm.q` 賈修 | Stock base `ACfl`, no custom handler; object DataA + ubertip 175/275/375, chains 3/4/5 | `damage` magic perRank **[175,275,375]** | dmg [0,275,375] |
| 閃光龍牙 Snow Dragon Fang | A0I1 | `godie-opgh.e` 趙子龍 | JASS (war3map.j:42704): `UnitDamageTarget( level*300 + STR*3, MAGIC )` | `damage` magic perRank **[300,600,900,1200]** | dmg [80,120,160,200] |
| 畫龍點睛 Cloud-E | A000 | `godie-hart.e` 克勞德 | Object learn_ubertip: base 450, +150/level; armor −3, −3/level, 5s | `damage` magic perRank **[450,600,750,900]** | dmg [80,120,160,200] |

## 2. Ported — nuke + control / self-steroid

| Ability (source) | rawcode | Instances / hero | Provenance | EffectDef mapping | Was |
|---|---|---|---|---|---|
| 火球術 Fireball | A0AY | `godie-h020.q`, `godie-hjai.q` 莉娜 | Stock `Awfb`; object DataA 170/220/270/320, `duration` 1.5 stun (ubertip 暈眩1.5秒) | `damage` magic perRank [170,220,270,320] **+ `applyStatus` burnstun 1.5s stun** (added) | dmg-only, no stun |
| 雛見澤症候群L5 (變身) | A02Q | `godie-e001.r`, `godie-e00n.r` 龍宮禮奈 | Base `AEIl` metamorphosis; ubertip: +55 attack, +ms, −150/−250/−350 maxHP, 7/14/21s | `castType:self`, **`applyBuff {ad flat +55}` 7s** | **mis-mapped** as targeted dmg [80,120,160] |
| 開天闢地‧洨者聖臨 (變身) | A0EW | `godie-harf.r` 鄭先生 | Base `AEIl`; ubertip: +25% base AS, +5 armor, 7/10.5/14s | `castType:self`, **`applyBuff {as pctAdd +0.25, armor flat +5}` 7s** | **mis-mapped** as targeted dmg [80,120,160] |

### What was approximated (per ability)
- **月牙天衝 / 藤鞭 / 迴旋鏢 / 薩喀爾 / 閃光龍牙 / 畫龍點睛**: delivery kept as `targeted`
  (single-target) — the exact damage magnitudes are ported, but line/AoE/chain geometry was
  **not** changed, to avoid touching target-resolution behavior I cannot runtime-test.
- **月牙天衝**: bankai black-moon +250 bonus not modeled (requires a stance/state flag).
- **藤鞭**: the 1-s delayed pull (displacement) not modeled — no displacement EffectDef.
- **迴旋鏢**: L5 is a different EX "double-fan" trigger; its damage was approximated to the
  L4 value (450) rather than the linear 50+100·L extrapolation.
- **閃光龍牙**: the `STR*3` term dropped — the sim has no primary-attribute (STR/AGI/INT) stat.
- **畫龍點睛**: the 3-per-level armor shred omitted — it would need an enemy-target `applyBuff`
  (no existing content precedent; base −3 flagged as a low-risk follow-up).
- **雛見澤L5 / 開天闢地**: `applyBuff` cannot rank-scale, so the per-rank **duration**
  (7/14/21 · 7/10.5/14) collapses to the base rank-1 value (7s); 雛見澤's maxHP downside and
  ms bonus are omitted (magnitude scales / no stated number). Stat magnitudes are exact.

---

## 3. NOT ported — re-classified (exact trigger recorded for a later pass)

| Ability (source) | rawcode | Hero / slot | Blocker | Trigger / data |
|---|---|---|---|---|
| 界王拳 | A082 | `godie-o00x.q`, `godie-ogrh.q` 悟空 | **Rank-scaling self AD buff** (+55/90/125/160, 10s). `applyBuff` has no per-rank magnitude. Currently mis-mapped as damage. | Stock `ANbr`; object DataA field "1" = 55/90/125/160/200 |
| 龍氣爆發 | A04X | `godie-e007.r`, `godie-ewar.r` 天地志狼 | **Number ambiguity + un-modelable charge**: JASS `DraganDamage = 350+300·level` (650/950/1250) vs ubertip 550/850/1150; +AGI*5/s charge (≤3s) has no channel-charge primitive | JASS `...Dragon...` war3map.j:29400 |
| 爆碎丸 | A0F5 | `godie-osam.e` 殺生丸 | **No proc-chance hook primitive** — 15% on-hit for +90/140/190/240 & 0.5s stun | Stock `ANb2` bash; object DataC 90/140/190/240 |
| 吸星大法 | A0Y0 | `godie-o02w.e` 令狐沖 | **No mana-burn primitive** — drains 200/400/600/800 mana + AS/MS lock 2-5s | JASS handler war3map.j (`GetSpellAbilityId()=='A0Y0'`) |
| 十萬伏特 | A0BZ | `godie-o00k/o02l/ofar.q` 皮卡丘×3 | **Already faithful** — damage [175,275,375] is correct; only AoE geometry (6 targets, r350) missing. Left as-is to avoid target-resolution risk. | Stock `ANfl`; object DataA/area |

### Follow-ups this pass surfaced (schema / sim primitives needed — recorded, not built)
1. **Rank-scaled `applyBuff`** (per-rank magnitude + duration arrays) → unlocks 界王拳 and the
   full-fidelity transform stat-pumps (28 `AEIl` transforms in ABILITY_GAP.json).
2. **Mana-burn EffectDef** → 吸星大法 and other drain skills.
3. **Proc-chance on `HookDef`** (a `chance` field) → 爆碎丸 and every %-chance on-hit passive
   (54 passive/aura placeholders).
4. **Displacement EffectDef** (pull / knockback) → 藤鞭 pull, and grab/hook ults.
5. **Channel-charge / line / chain delivery** → 龍氣爆發 charge, and to upgrade the §1 nukes
   from single-target to their true line/AoE/chain geometry.
6. **Enemy-target `applyBuff` precedent** (mechanically supported by `effectRunner` already —
   just no content uses it yet) → armor/stat shreds like 畫龍點睛.

---

## 4. Remaining worklist (unchanged from ABILITY_GAP.json)

Of the 135 ADDRESSABLE placeholders, this pass took the highest-confidence, marquee actives
whose numbers are exact. Still open, in rough priority order:

- **~26 more clean damage nukes/channels** whose ubertip states an exact per-level number
  (same pattern as §1) — mechanical, just transcription: read rawcode from ABILITY_GAP.json,
  strip ubertip via the `extract.py` pattern, set `damage.amount.perRank`.
- **28 `AEIl` transforms** — blocked on follow-up #1 (rank-scaled buff) for full fidelity;
  a fixed-magnitude stand-in is possible now for the ~4 whose tooltip states a flat number.
- **54 passive/aura placeholders** — blocked on follow-up #3 (proc chance) and on champion
  `passive.hooks`/`modifiers` authoring; several are pure stat auras portable today.
- **19 channels** — need follow-up #5 for tick fidelity; burst stand-ins possible now.
- **18 STILL-IMPOSSIBLE** (6 summon + 2 illusion + 10 pure-stub) — unchanged; need summon/
  clone sim primitives.

Files edited this pass (all under owned paths — `content/abilities/**`, `content/champions/**`):
14 ability docs + 14 champion docs. Validated by direct `zAbilityDoc`/`zChampionDoc` parse
(did NOT run `content:build` / `buildIndexes` / `contentValidate` / `make test` — the main
session reconciles indexes).
