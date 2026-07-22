# THE RECONCILIATION LEDGER — task #78

**One row for every shipped ability and every shipped item, reconciled against (a) the WC3 native
object data and (b) the map's own JASS.** This is the artefact that makes the 1:1 gap *finite and
reviewable*: 766 rows, every one carrying its rawcode, its real per-level numbers, what the script
actually does, what GGD ships today, a verdict, and a concrete delta.

> **Phase 2 (audit) is §1–§9 below and is a SNAPSHOT — its verdict counts describe content as it
> stood when the audit ran. [§10](#10-phase-3--deltas-closed) is the phase-3 repair log: what has
> since been fixed, what the fix was grounded in, and every row left `BLOCKED` with its reason.**

| ledger | rows | file |
|---|---|---|
| Abilities | **554** | [`abilities.md`](abilities.md) |
| Items | **212** | [`items.md`](items.md) |

Nothing here is guessed. Every number in the *native* column is read out of a file in this repo. Where
the source genuinely has no arena equivalent it is **flagged in [§6](#6-unmappable-register--flagged-not-invented), never invented**.

---

## 1. Where the numbers come from

| artefact | path | what it gives |
|---|---|---|
| map object data | `tools/w3x-import/out/GoDieEX22s/raw/war3map.w3a` (1 536 objects) | the map's **overrides** only |
| **Blizzard defaults** | `War3Patch.mpq` → `Units\AbilityData.slk` (799 aliases) | every per-level field the map did *not* override — **327/327 bases resolve, 0 unresolved** |
| **field labels** | `War3Patch.mpq` → `Units\AbilityMetaData.slk` + `UI\WorldEditStrings.txt` | the real World-Editor label for every data column (致命一擊機率, 傷害乘數, 部隊的另一種型態 …) |
| hero → ability map | `war3map.w3u` `uhab` (587 units) | Q/W/E/R slot order |
| EX map | `tools/w3x-import/out/GoDieEX22s/EX_MAP.json` | the `.ex` slot |
| items | `war3map.w3t` (241 objects) `iabi` | item → ability-instance list |
| **unprotected JASS** | `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j` (56 766 lines, 4 719 named functions) | the actual behaviour |

The two artefacts nobody was using are `AbilityData.slk` and the **unprotected** `war3map.j`. Together
they turn "approximate" into "transcribe": a ~40-line SLK reader on top of the existing
`w3xlib/mpq.W3XArchive` resolves **100 %** of the ability bases, including every level the map left
at the Blizzard default.

**How to read the native column.** `RAWCODE ◄ BASE → engine CODE 「Blizzard comment」 Nlv`, then the
merged per-level table, `lv1/lv2/lv3/…` (a repeated tail is collapsed). Unmarked values are the map's
own `war3map.w3a` override. Values marked `*(slk)*` are the **Blizzard SLK default** — a number the
importer has never once opened. 480 of the 530 mapped abilities depend on at least one of those.

**How to read the JASS column.**

| class | n | meaning |
|---|---|---|
| **A** | 254 | a named `GetSpellAbilityId()=='XXXX'` trigger. The summary is *auto-extracted* — treat it as an index into the named trigger, not as a transcript. Rows marked ‼️ were read by hand. |
| **B** | 44 | the ability is a `GetUnitAbilityLevel()` gate inside a global damage/attack trigger (a passive proc). |
| **C** | 229 | never scripted — **the WC3 object data IS the whole ability**, so a 1:1 port needs only data, no code. |
| **D** | 3 | referenced somewhere that needs a manual read. |
| **E** | 24 | no w3x origin (`sela`/`thorne` are native GGD; 4 heroes have an empty `uhab`). |

---

## 2. Coverage

**Mapping is complete.** 530 / 554 ability docs (95.7 %) resolve to a w3a rawcode; **530/530 have a
w3a entry and 530/530 resolve in `AbilityData.slk`**. 208 / 212 item docs resolve to `war3map.w3t`.
The 24 + 4 that do not are the two native GGD champions and four heroes whose `uhab` is empty — they
are listed, not hidden.

### Abilities — 554 rows

| verdict | n | % |
|---|---:|---:|
| `match` | **38** | 6.9 % |
| `partial` | **223** | 40.3 % |
| `wrong` | **176** | 31.8 % |
| `missing` | **109** | 19.7 % |
| n/a (native GGD content) | 8 | 1.4 % |

### The 13 seeded demo champions — 65 rows (the only champions a player can pick today)

| champion | match | partial | wrong | missing |
|---|---:|---:|---:|---:|
| `godie-e001` 蟬在叫人壞掉 - 龍宮禮奈 | 1 | 1 | 2 | 1 |
| `godie-e008` 火霧戰士 - 夏娜 | 0 | 3 | 2 | 0 |
| `godie-edem` 寫輪眼復仇者 - 宇智波佐助 | 0 | 2 | 2 | 1 |
| `godie-etyr` 治癒系公主 - 木乃香 | 0 | 1 | 3 | 1 |
| `godie-h01u` 亂世的王者 - 呂布奉先 | 1 | 1 | 3 | 0 |
| `godie-h020` 黑魔導士 - 莉娜因巴斯 | 1 | 3 | 0 | 1 |
| `godie-hart` 最終幻想 - 克勞德 | 0 | 4 | 1 | 0 |
| `godie-hpb1` 獸矛傳承使 - 蒼月潮 | 0 | 2 | 1 | 2 |
| `godie-n003` 黑暗福音 - 依文潔琳 | 2 | 1 | 1 | 1 |
| `godie-o00k` 傲嬌電氣老鼠 - 皮卡娘 | 0 | 4 | 1 | 0 |
| `godie-o02p` 夢幻之星 - 初音 | 1 | 1 | 3 | 0 |
| `godie-ofar` 神奇寶貝兒 - 皮卡丘 | 0 | 2 | 2 | 1 |
| `godie-e00q` 英靈-亞瑟王 - 黑化Saber | 0 | 1 | 3 | 1 |
| **total** | **6** | **26** | **24** | **9** |

### Items — 212 rows

| verdict | n |
|---|---:|
| `match` | **11** |
| `partial` | **121** |
| `missing` | **76** |
| n/a (native GGD content) | 4 |

**Note on the "live universe" size.** The phase-1 brief put the post-#70 live set at 43 items
(29 legendary-weapons + 10 quest-rewards + 4 native). The actual shipped whitelist is **102**:
`starterShopItems` (92, including all 4 native GGD items) + `starterDraftItems` (10), read straight out
of `apps/platform/internal/curation/starter.go`. The 29 `content/loot-tables/legendary-weapons.json`
entries are a *subset* of the 92 shop entries, not a separate set. `items.md` Part 1 uses the 102.

278 item-ability instances across the 208 mapped items: **170 STAT** (expressible as `modifiers[]`)
and **108 BEHAVIOUR** (需要 `passive: HookDef[]` 或 active). 74 items carry behaviour that no field
on the doc represents; **15 have a genuinely scripted active** and `item@1` has no `active` field at
all (`packages/shared/src/content/schema/item.ts:7-33`).

### Verdict definitions

* **`match`** — GGD reproduces the native mechanic *and* the numbers are the native numbers.
* **`partial`** — right family, but numbers are fabricated, a sub-effect is dropped, or the JASS script
  on top is not ported.
* **`wrong`** — GGD implements a *different mechanic*: a permanent passive shipped as a timed
  self-buff, a non-damaging ability shipped as a damage nuke, an area effect resolved single-target.
* **`missing`** — no `EffectDef` kind can express the native mechanic; the doc is a placeholder.

---

## 3. Top deltas — what a player would notice first

1. **82 of the 102 EX ultimates are the identical document.** `self · applyBuff[ad pctAdd 0.35] 6 s ·
   cd 60 · mana 120`. 天照, 固有結界-黑洞, 打雷絕招, 魔力印章, 獸矛持有者 … all the same button. The other
   20 split between `damage flat 300` (15), `ad pctAdd 0.6` (2) and 3 one-offs. Every one of them has a
   real named JASS trigger and real w3a numbers sitting unread.
2. **114 genuinely permanent native passives ship as 6-second activated self-buffs — 113 of the 114
   are `wrong`, and 179 docs in total have that exact `self` + single `applyBuff` shape.** Bash (`AHbh`, 20 abilities) becomes +0.25 attack speed for 6 s. Critical
   Strike (`AOcr`, 13) becomes a flat +25 % crit for 6 s *while its real `Ocr1` chance and `Ocr2`
   multiplier are right there in the w3a and even get read* — the archetype builder throws them away
   and hard-codes `flat = 0.25`. 龍宮禮奈's W is 18/16/14/12 % for ×1.25/2/2.75/3.5 in the source.
   Evasion (`AEev`, 12) becomes +25 armor. Elune's Grace / `AIdd` damage reduction (17) and Pulverize
   (`Awar`, 7) become placeholders. **The engine already has the right primitive**: `HookDef` with
   `onBasicAttack`/`onDamageDealt`/`onDamageTaken` + `internalCooldown`
   (`packages/shared/src/sim/stats/modifiers.ts:26-43`), used today by 14 items and 2 champions.
3. **37 metamorphosis ultimates do nothing.** `AEIl`/`AEme` swaps the hero for an alternate unit. The
   alternate unit id (`部隊的另一種型態`, e.g. `Eilm`), the HP delta and the hero duration are all in the
   w3a. 龍宮禮奈's R even has a **negative** −150/−250/−350 HP bonus (the alternate form is *squishier*)
   — GGD ships +55 flat AD for 7 s.
4. **The `Aamk` leak — 8 stat buttons became damage nukes.** `w3xlib/drafts.py:588` filters the learn
   list on the literal rawcode `'Aamk'`, but 8 champion abilities are *custom objects whose base is
   `Aamk`*. They survive the filter and 6 of them (`godie-e00q.q` 力量強化, `godie-e00q.r` 魔力增幅,
   `godie-edem.r` 哥哥, `godie-emns.w`, `godie-u034.e`, `godie-ucrl.e`) shipped as
   `damage perRank [80,120,160,200,240]`. **Filter on `base`, not `id`.** Two of the thirteen pickable
   champions are affected.
5. **74 docs still carry literal placeholder numbers** — `perRank [80,120,160,200,240]` (60 docs) or
   `flat: 300` (14 EX docs where the doc has no other source). 71 carry the fabricated `600 → 11.0`
   range and 43 the fabricated `mana = 60`. Separately, **508 of the 530 mapped rows have at least one
   per-level number the map explicitly authored in the w3a that never reached the doc**, and 480 depend
   on at least one Blizzard SLK default that has never been opened.
6. **Area effects resolved single-target.** `godie-o00k.q` 十萬伏特 is `A0BZ`◄`ANfl` Forked Lightning:
   **175/275/375 damage to 6 targets** (`每個目標傷害` / `目標擊中次數`) in a 350u area. GGD casts it at
   one unit — five sixths of the output is gone. Same shape on 呂布's 鬼神烈戟 (`範圍` 500u), 木乃香's
   聖夜降臨 (450/550/650u).
7. **蒼月潮's Q/W/E is a 3-stage combo and GGD has no combo.** `Trig_order123` sets `udg_MoonCombo = 1`
   for exactly 1.00 s; W (`MoonKnock`, war3map.j:34342) *refuses to fire* unless `MoonCombo == 1` and
   sets it to 2; E (`Jump_Start`, :34189) refuses unless `MoonCombo == 2`. GGD ships three unrelated
   placeholder nukes.
8. **雷神之鎚 `godie-i01i` ships as pure text.** No modifiers, no passive, no active. The source is
   `Trig_LigtingHamm`: **7** `o02M` dummies at random points in an 800×800 rect, each ordered
   `"thunderclap"` — and that dummy's `A0XV`◄`AHtc` carries **AOE傷害 300, 移動速度降低 50 %, Area 350,
   Dur 3**, i.e. exactly the tooltip's 「7 道 / 300 傷害 / 移速 -50% / 3秒」. Both halves are readable;
   neither is shipped.
9. **100 item stat values are silently dropped, 31 more never read at all.** `w3xlib/stats.py:36-38`
   keys data columns on `code[3].isdigit() and not code.startswith("a")`, which excludes the entire
   `I…` item family (`Istr` `Iagi` `Iint` `Iatt` `Ilif` `Iman` `Idef` `Ivam` …) *and* every `a`-prefixed
   data field (`ata0`-`ata4`, `aut1`, `auu1`) *and* letter-suffixed fields like `Emeu` — which is why
   all 37 metamorphosis abilities lose their transform target. Keying on the real 4-char code + the
   real `data_col` fixes all three at once (the parser already records `data_col`,
   `w3xlib/objdata.py:72`).
10. **初音's EX heals; GGD's EX damages.** `Trig_MikuEX_Actions` is
    `SetUnitLifePercentBJ(target,100)` + `SetUnitManaPercentBJ(target,100)` — a full HP+mana restore on
    one ally. `godie-o02p.ex` ships `targeted · damage flat 300 + 1×ap`.

---

## 4. What the 176 `wrong` verdicts are made of

| native category | n | what GGD ships instead |
|---|---:|---|
| ON-ATTACK PROC (passive) | 56 | timed `self`+`applyBuff` |
| DAMAGE REDUCTION (passive) | 21 | timed `self`+`applyBuff` / placeholder |
| ground AoE | 19 | a self-buff or a single-target nuke |
| AURA (passive) | 15 | timed `self`+`applyBuff` |
| self buff / toggle | 13 | a damage nuke |
| EVASION (passive) | 13 | +25 armor for 6 s |
| targeted-nuke | 10 | heal / buff |
| ATTRIBUTE BONUS (`Aamk` leak) | 8 | a damage nuke |
| heal/restore | 7 | a damage nuke |
| activated shout / AoE-speed item / other | 14 | — |

An ability whose base is a Blizzard passive but which the **map** gave a real cooldown or mana cost is
counted as ACTIVATED, not passive — the ledger says so explicitly in its category. That reclassification
moved 18 rows out of the passive buckets (呂布's 鬼神烈戟 `Aroa` with Cool 60 / Cost 250-550 is the
archetype).

## 5. What the 109 `missing` verdicts are made of

| native category | n |
|---|---:|
| METAMORPHOSIS (transform) | 37 |
| CHANNEL `ANcl` (empty shell — 100 % of behaviour is JASS) | 30 |
| SUMMON | 19 |
| no w3x origin (hero `uhab` empty) | 16 |
| spell book | 3 |
| ILLUSION / SILENCE / transmute / place-mine | 4 |

---

## 6. Unmappable register — FLAGGED, not invented

Everything below depends on WC3 machinery the arena has no equivalent for. **Each carries a proposed
arena-appropriate substitute that needs the user's approval before anyone writes it.** The map is
being reinterpreted as an arena, so 1:1 is the target but not always the right answer.

### U1 · Metamorphosis / transform — 37 abilities
*WC3*: `AEme`/`AEIl` replaces the hero **unit type** with another (`部隊的另一種型態` e.g. `Eilm`,
`Edmm`), which carries its own model, stats and ability list, for `英雄持續` seconds, plus a max-HP
delta (`其他形態生命點數加成`, −350 … +550 depending on the ability).
*Why it does not map*: `EffectDef` (`sim/effects/effect.ts:24-45`) has no unit-swap; GGD entities are
one champion doc for the whole match.
**Proposed substitute (needs approval)**: a `transform` EffectDef that (i) emits a `modelSwap` sim
event to the client for the duration, (ii) attaches a timed `ModifierSource` built from the real w3a
numbers (`maxHealth flat <其他形態生命點數加成>` + whatever the alternate unit's `w3u` delta says), and
(iii) uses the existing `grantedAbilities` field on `ModifierSource` for the alternate form's kit.
No new dispatch path — it is a `ModifierSource` with an expiry, which `attachSource`/`detachSource`
already handle. *皮卡丘's R additionally needs U6.*

### U2 · Summons — 19 abilities (+ several item actives)
*WC3*: `CreateNUnitsAtLoc` spawns a controllable unit that fights on its own.
*Why it does not map*: the arena has no minion entity, no pet AI, no ownership model for a second
unit, and the sim's determinism gate would need the pet inside the same tick order.
**Proposed substitutes (pick one, needs approval)**: **(a) Guardian** — spawn a real entity re-using
the champion pipeline with a Tier-0 brain, timed life from `UnitApplyTimedLifeBJ` (136 call sites, so
the number always exists); highest fidelity, most work. **(b) Turret-as-AoE** — reinterpret the summon
as a stationary hazard: a scheduled repeating AoE at the spawn point using the *summoned unit's own*
attack damage from `war3map.w3u`, plus a `spawnVfx` of its model. Zero new entity code, keeps
determinism trivially, and reads correctly for the many map summons that are really just "damage
happens here for N seconds". **(c) Drop the summon and keep only its damage output** as a single
burst — cheapest, lowest fidelity.

### U3 · WC3 hero attributes STR / AGI / INT — 130 `GetHeroStatBJ` call sites
*WC3*: 130 JASS formulas scale off primary attributes, e.g. 蒼月潮's W is `STR × abilityLevel + 225`
and E is `STR × 2 + level × 100`.
*Why it does not map*: `Stat` (`sim/stats/statTypes.ts:3-19`) has **no** str/agi/int — the importer
already dissolved them into `ad`/`maxHealth`/`armor`/`as`/`ap`/`maxMana`.
**Proposed substitute (needs approval)**: reuse the importer's own promotion ratios as the inverse
map, so `STR ≈ maxHealth / 22`, `AGI ≈ armor / 0.3`, `INT ≈ ap / 5` (`w3xlib/drafts.py:709-719`
documents exactly these). That keeps every JASS formula transcribable with no schema change. The
alternative — adding three real stats to `Stat` — touches the stat pipeline and every champion doc,
and should only happen if you want attributes to be a *visible* system.

### U4 · Trees / destructibles — 45 `KillDestructable` + `EnumDestructables` call sites
*WC3*: several abilities (e.g. 蒼月潮's W) clear the trees in the blast radius.
*Why it does not map*: the arena has no destructible doodads.
**Proposed substitute (needs approval)**: drop the destructible clause entirely and keep the unit
damage — or, if the arena ever gets breakable props, route it through the same area query. **No
number is invented either way**; the clause simply has no target.

### U5 · Building / structure / neutral-hostile branches — 123 `STRUCTURE` + 72 `PLAYER_NEUTRAL_AGGRESSIVE` tests
*WC3*: triggers routinely branch on "is a structure" (towers), "is neutral hostile" (creeps), and
`每秒對建築物的傷害` fields exist on many abilities (雷神之鎚's `AOeq` carries 160).
*Why it does not map*: the arena has no towers and no creeps.
**Proposed substitute (needs approval)**: collapse each branch to its non-structure, non-neutral leg
(that is the champion-vs-champion case, which is the only case the arena has) and record the dropped
tower/creep numbers in this ledger rather than re-targeting them at champions. Re-targeting them
would silently double some abilities' output.

### U6 · Stacking on-damage-taken rage with a colour ramp — 皮卡丘 R, and the `SetUnitVertexColorBJ` family (57 sites)
*WC3*: `WildPikaAttacked` increments a hidden ability's level on **every attack received**, capping at
level 50, and tints the model progressively red.
*Why it does not map*: GGD has `stacks` on `ModifierSource` but no stack-capped `onDamageTaken` hook
preset and no per-entity runtime tint channel for gameplay (task #49's tint is authored, static).
**Proposed substitute (needs approval)**: a `HookDef{on:"onDamageTaken"}` whose effect adds one stack
of a `ModifierSource` capped at 50, plus a cosmetic `spawnVfx`/tint sim event that the client ramps.
Deterministic, no new dispatch path.

### U7 · `udg_EX_Mode[player]` — 61 call sites
*WC3*: a per-player global flag that **changes what an ability does**. 初音's R chain-*heals* allies
normally and chain-*damages* in EX mode.
*Why it does not map*: GGD has no per-player mode flag in the sim; `.ex` is an ability slot, not a state.
**Proposed substitute (needs approval)**: model it as a `ModifierSource` on the champion whose presence
the ability's effects can branch on — or, simpler and probably better for an arena, **pick one leg per
ability and drop the other**, documenting which. This one genuinely changes design, so it should be a
user decision, not an implementer's.

### U8 · WC3 buff objects — `war3map.w3h`, 228 objects, entirely unread
*WC3*: every `abuf` id points into `war3map.w3h`, which carries the status effect's name (`fnam` 134),
tooltip (`ftip` 181), icon (`fart` 106), **target art** (`ftat` 163) and attachment points. This is the
missing status-effect naming + art layer.
*Why it is listed here*: it is not unmappable at all — `w3xlib/extract.py:30-37` already walks the file
for TRIGSTRs, `w3xlib/stats.py` just never builds records from it. It is the actual root fix for #79's
"92 % share one fire placeholder" and it overlaps #50 and #72.
**Proposal**: build `w3h` records the same way `w3u`/`w3t`/`w3a` are built, and wire
`abuf`/`aart`/`amat`/`atat`/`acat`/`aeat` into the VFX layer. No approval needed beyond scheduling.

### U9 · Illusions (1), spell books (3), transmute-to-gold (1), place-mine (1), silence (1)
Flagged individually in `abilities.md`. Silence has no status in GGD; illusions have no entity model;
transmute-to-gold has no in-match gold sink at that granularity. **No substitute proposed — these are
few enough to be individual design calls.**

### U10 · Item actives — 15 items, and `item@1` has no field for them
`godie-i006`/`i03b`/`i03c` 雅典娜的驚嘆號 (`AtheaAttatk`), `i01b` 林之書, `i01d` 死之王的長槍 (`Hell`),
`i01i` 雷神之鎚 (`LigtingHamm`), `i01v` 螺旋劍, `i02t` 盾甲天書, `i030` 黑色魔書 (`GravityBall`),
`i033`/`i05l`/`i05m`/`i05n` 護腕 (`NoviceChange`, a 4-way item swap cycle), `i04v` 正義之杖, `i06l` 生肉.
**Proposed substitute (needs approval)**: add `active?: { cooldown, manaCost, effects: EffectDef[] }`
to `item@1` and drive it through the existing `effectRunner`. The `Cool`/`Cost`/`Rng`/`Area` for each
one is already in the w3a and shown in the ledger. 護腕's `NoviceChange` swap cycle is the exception —
it is a crafting-adjacent mechanic and #70's no-crafting decision probably means it should just be
four independent items.

---

## 7. The one schema gap that blocks the biggest win

`ability@1` (`packages/shared/src/content/schema/ability.ts:9-44`) has **no `passive` / `hooks`
field**, and `champion@1` has exactly **one** `passive` block (`schema/champion.ts:72-79`), used by 2
of 113 champions. Several champions have two or three native passives across Q/W/E/R (呂布 has Q
天下無雙 on-attack proc *and* EX 戰無不勝 damage reduction). Porting the 90 native passives onto hooks
therefore needs either `ability@1.passive: HookDef[]` + `ability@1.modifiers: StatModifier[]`, or
`champion@1.passive` widened to an array. **That is the cheapest single change that unlocks the
largest verdict bucket** (114 abilities move `wrong` → `match`).

## 8. Suggested execution order

1. **Raw-mods passthrough for w3a/w3t + an SLK-default merge layer** (mirrors #56's plan for w3u), and
   key data columns on the full 4-char code + the recorded `data_col` instead of `code[3]`. This alone
   fixes the fabricated ranges/radii/cooldowns, the 100 dropped item stat values, the 31 stock-only
   ones, and hands every later step its real numbers.
2. **Fix the `Aamk` filter to match on `base`** (`drafts.py:588`) — 8 abilities, 2 of them on pickable
   champions, one line.
3. **Add `passive`/`modifiers` to `ability@1`** (§7) and port the 114 permanent native passives onto
   `HookDef` with their real `Ocr1`/`Ocr2`/`Hbh1`/`Eev1`/`Def1` numbers.
4. **Re-derive the item universe** from `iabi` → base → engine code, splitting into `modifiers[]` (170
   instances) and `passive: HookDef[]` (108 instances). Every live item already has modifiers, so this
   is additive.
5. **A deterministic scheduled-effect primitive** (enqueue `EffectDef[]` at `world.tick + n`) inside
   `effectRunner`/`CastResolveSystem`. 120 triggers use `TriggerSleepAction`; this one primitive
   unlocks the multi-stage and wave-based abilities without a new code path. `world.rng`
   (`SimWorld.ts:168`, hashed at `:299`) covers the 25 randomised triggers — **never `Math.random`**.
6. **Transcribe the 254 named JASS triggers**, starting with the 46 carrying explicit
   `UnitDamageTarget` formulas (e.g. 妙蛙種子's Vine, `war3map.j:26676`: `200 + 150 × abilityLevel`,
   1.00 s delay, 480 radius, damage + pull).
7. **Parse `war3map.w3h`** (U8) and wire the art fields — the real fix for #79.

## 9. Decisions this pass respected

* **No crafting** (#70). The 273 `UnitHasItem` / 145 `UnitAddItem` / 211 `RemoveItem` references are
  reported as deliberately-dead machinery, which is why 198 of 208 w3x items show `—` in the JASS
  column. That is correct, not a gap. Nothing here reintroduces components, recipe books or upgrade
  chains.
* **Ranges and AoE are not touched** (#60). They were *measured* only, and the measurement supports the
  audit: the fabricated 600.0/200.0 defaults are what the existing clamps have been normalising, so
  replacing them with real SLK values shifts numbers **inside** the existing 14.12-max envelope rather
  than creating snipe outliers.
* **Ground-AoE snapshot timing** (#69) untouched.
* **Determinism** — every proposal above lands inside `abilitySystem.ts` / `effectRunner.ts` /
  `CastResolveSystem` / `ProjectileSystem` / `statPipeline`, uses `world.rng`, and adds no wall-clock
  and no trig in `sim/**`.
* **Read-only pass.** Nothing outside `docs/content/reconciliation/` was written; `tools/w3x-import`,
  `content/items/**`, `content/loot-tables/**`, `apps/platform/internal/curation/**` and
  `apps/client/src/ui/codex/**` were read, never modified.

---

# 10. Phase 3 — deltas closed

Scope of this pass: **the 13 seeded demo champions** (the only pickable roster), highest-impact
first. 30 ability docs were rewritten from source; the demo roster moves

| | match | partial | wrong | missing |
|---|---:|---:|---:|---:|
| after phase 2 (audit) | 6 | 26 | 24 | 9 |
| **after phase 3** | **19** | **24** | **13** | **9** |

Every number written in this pass is transcribed from `war3map.w3a`, `war3map.w3q`,
Blizzard's `UpgradeData.slk`, or an exact formula in the unprotected `war3map.j`. **Where a JASS
formula contains a hero-attribute term (`GetHeroStatBJ`), the term was DROPPED, not approximated** —
porting it needs the STR/AGI/INT inverse map, which is [§6 U3](#u3--wc3-hero-attributes-str--agi--int--130-getherostatbj-call-sites) and a user decision. The two `Aamk`
attribute BUTTONS are different: they are pure attribute grants, and they use the promotion ratios
the importer **already applied to the whole item catalogue** (`w3xlib/drafts.py:709-719`), so they
introduce no new model.

## 10.1 Engine primitives added

The audit's §7 conclusion — "`ability@1` has no `passive` field, and that is the cheapest single
change that unlocks the largest verdict bucket" — is now implemented, plus the four smaller
primitives the demo roster needed. All of them live inside the existing dispatch paths; the purity
gate, the same-seed replay tests and every stat/damage path are unchanged.

| primitive | where | why the source needed it |
|---|---|---|
| `ability@1.passive: { name?, ranks: [{ modifiers?, hooks? }] }` | `content/schema/ability.ts`, `sim/content/defs.ts`, new `sim/abilities/abilityPassives.ts` | The native `Cool = 0` family (`AOcr`, `AHbh`, `AEev`, `AOae`/`AHab`, `Aamk`) is PERMANENT and authored per ability LEVEL. Attached/re-attached through the existing `attachSource`/`detachSource` on spawn, rank-up and `learnEx`. |
| `CastResult "passive"` | `sim/abilities/abilitySystem.ts` | A passive-only ability (passive + empty `effects`) is now rejected **before any cost is paid**, instead of charging an invented cooldown and mana for a button WC3 will not let you press. |
| `HookDef.chance` (0..1, seeded `world.rng`) | `sim/stats/modifiers.ts`, `sim/effects/hooks.ts` | The WC3 proc-chance column (`Hbh1` 狂怒擊機率, `Ocr1` 致命一擊機率, `War1` 動地跺機率). Rolled AFTER the internal-cooldown gate; a failed roll does not consume the ICD. |
| `HookDef.target: "self" \| "event"` | same | "On kill, YOU gain X" (呂布's `A0AU` 飛將神弓). With the default the buff landed on the corpse. |
| `applyBuff.perRank: [{ modifiers, duration }]` | `sim/effects/effect.ts`, `effectRunner.ts` | WC3 authors every buff column per level (`Oae1/Oae2`, `adur`). One flat `modifiers`+`duration` pair could only carry one rank, which is why 鬼隱之擊 shipped +100 % ms / 6 s at *all five* ranks. |
| `EffectDef { kind: "restore", healthPct?, manaPct? }` | same | `SetUnitLifePercentBJ` / `SetUnitManaPercentBJ`. `heal`'s `Scaling.ratios` read the CASTER's stats, so "restore this ally to full" had nowhere to go. |
| ally-target exclusivity | `sim/abilities/abilitySystem.ts` | `targetsEnemies: false` only *skipped* the same-team check, so all 6 ported 「目標 friend」 spells could be aimed at the enemy team and would heal them. |

Behavioural coverage: `packages/shared/src/sim/abilities/nativeFidelity.test.ts` (17 tests) drives
the real sim against the real docs and asserts *outcomes* — a crit that lands at exactly ×1.25, a
proc that fires on some but not all swings, the AoE's actual hit set, an ally actually restored to
full. A data-shape test would have passed for every ability repaired here.

## 10.2 Rows closed

`(w3a)` = the map's own object data · `(JASS)` = an exact formula in `war3map.j` · `(w3q)` = custom upgrade

| ability | was → now | what it is now, and from where |
|---|---|---|
| `godie-e001.w` 染血的柴刀 | wrong → **match** | permanent crit passive, 致命一擊機率 18/16/14/12 % × 傷害乘數 1.25/2/2.75/3.5 `(w3a AOcr Ocr1/Ocr2)`. Was +25 % crit for 6 s, cd 12, mana 60 — all four numbers invented. |
| `godie-h01u.q` 天下無雙 | wrong → **match** | `A0MX` is INERT in the w3a (`Ocr1 = Ocr2 = 0`); `Trig_skill1_Actions` (`war3map.j:50368`) sets `A0N5`/`A0N4` to rank+1 → permanent **+25/50/75/100 AD and −3/−6/−9/−12 armor** `(JASS + w3a AItg/AId1)`. Plus `Trig_FlyHeroAch` → `onKill` +10 AD for 15 s (`A0AU`). |
| `godie-etyr.ex` 魔力激發 | wrong → **match** | `AHab` Brilliance Aura, 範圍 50 (self-only), 增加法力回復 **0.07** `(w3a)`. Was +35 % AD for 6 s, cd 60, mana 120. |
| `godie-ofar.w` 鋼鐵尾巴 | wrong → **match** | `AHbh` Bash as an on-attack proc: 狂怒擊機率 **10 %**, 傷害加成 **75/150/225/300** `(w3a Hbh1/Hbh3)`. Was +0.25 attack speed for 3 s. |
| `godie-edem.r` 哥哥 | wrong → **match** | the **`Aamk` leak**: 靈敏度加成 **12/24/36** `(w3a Iagi)` → armor +3.6/7.2/10.8, as +24/48/72 %. Was `damage perRank [80,120,160]`. |
| `godie-e00q.q` 力量強化 | wrong → **match** | the **`Aamk` leak**: 力量加成 **4/8/12/16/20** `(w3a Istr)` → ad +N, maxHealth +22N. Was a damage nuke. |
| `godie-e00q.r` 魔力增幅 | wrong → **match** | every attribute column is 0 at its 3 learnable levels; `Trig_ManaIcrease_Actions` researches `Rhpt` "69-04-x 法力加成" → **maxMana +500/1000/1500, manaRegen +0.2/0.4/0.6, healthRegen +8/16/24** `(JASS + w3q + Blizzard UpgradeData.slk effect slots rmnx/rmnr/rhpr)`. Was a damage nuke. |
| `godie-o02p.ex` 把你給MikuMiku掉 | wrong → **match** | `Trig_MikuEX_Actions` is `SetUnitLifePercentBJ(target,100)` + `SetUnitManaPercentBJ(target,100)` — a **full HP + mana restore on one ALLY**, and enemies are no longer legal targets. Was `damage flat 300 + 1×ap`. |
| `godie-edem.q` 火遁-豪火龍之術 | partial → **match** | **it dealt literally ZERO** (`perRank [0,0,0,0,0]`). `Trig_ChoChuFireDro_Func015A`: `skillLevel*100 + 150` magic to everything within **330 u** of the point `(JASS)` → 250/350/450/550/650, ground AoE r 6.05. |
| `godie-o00k.q` / `godie-ofar.q` 十萬伏特 | partial → **match** ×2 | `ANfl` Forked Lightning resolved as an **area**: 範圍 350 u, 每個目標傷害 175/275/375, 目標擊中次數 6 `(w3a)`. It was cast single-target — five sixths of the output vanished. (The 6-target cap is non-binding: a duel zone holds 3 enemies.) |
| `godie-o00k.e` 神鳴 | partial → **match** | `AUcs` Carrion Swarm: 範圍 **500 u**, 射程 350 u `(w3a)` — was single-target. |
| `godie-o02p.q` 甩蔥歌 | partial → **match** | `AOcl` Chain Lightning: 範圍 **400 u**, 射程 550 u, 每個目標傷害 200/275/350/425 `(w3a)` — was single-target. |
| `godie-e008.w` 火羽 | wrong → partial | `AIsa` "ItemSpeedAoe" **deals no damage**: 增加移動速度 **1.5** for **6/12/18 s** `(w3a)`. Was a damage nuke with the `[80,120,160]` placeholder. |
| `godie-etyr.w` 魔力應援 | wrong → partial | `AOae` Endurance Aura, permanent: 增加攻擊速度 **35/50/65/80 %**, 增加移動速度 **5/10/15/20 %** `(w3a Oae1/Oae2)`. Was +0.3 attack speed for 10 s on a 12 s cooldown for 60 mana. |
| `godie-o02p.r` 世界第一的公主殿下 | wrong → partial | `Trig_MikuNo1` runs `MikuNo1Effect` for `2 + 2×level` s, which orders `healingwave` (`A11E`, 回復 **200/275/350/425**) on every ally — **it heals**. Was a ground damage nuke. |
| `godie-h01u.e` 鬼神烈戟 | partial → partial | now an area around the caster: `Trig_skill3_Func006A` deals `150 + 200×level` magic to every enemy within **530 u** `(JASS)` → 350/550/750/950, r 9.72, plus the Roar 增加防禦 **−3/−6/−9/−12 for 3 s** `(w3a)`. Was single-target `[80,120,160,200]`. |
| `godie-hart.e` 畫龍點睛 | partial → partial | `ANab` Acid Bomb resolved as an area: 範圍 **350 u** + 護甲懲罰 **3/6/9/12 for 5 s** `(w3a)`. |
| `godie-o00k.r` 打雷絕招 | partial → partial | shipped `damage 1.0`. `Trig_PIKACHU_Actions` gives every unit within `100 + 200×level` a `A04H` chain lightning at the same level → **150/200/250** `(JASS + w3a Ocl1)`, 0.5 s stun. |
| `godie-e008.e` 赤焰爆發 | partial → partial | 造成傷害 **400/550/700/850** (shipped a flat 90) and 射程 700 u `(w3a AUim)`. |
| `godie-e008.q` · `godie-o00k.w` · `godie-ofar.ex` · `godie-h020.ex` | costs corrected | 魔耗 75/125/175 · 50/100/150 · 300 · 360 — every one of these had an invented rank-1 value `(w3a amcs)`. |
| `godie-edem.w` · `godie-h020.w` · `godie-h020.e` | radii/ranges corrected | 範圍 425 u · 射程 800 u + 範圍 300 u · 範圍 450 u `(w3a aare/aran)`. |
| `godie-e001.q` 鬼隱之擊 | partial → partial | per-rank 增加移動速度 **0.5/0.5/0.5/1.5/3** for **12/12/12/45/45 s** `(w3a)`. Shipped +100 % for 6 s at every rank — both invented. |
| `godie-hpb1.r` 神聖結界 | partial → partial | 持續 **8/12/16 s** `(w3a adur)`, replacing an invented flat 10 s. |

## 10.3 Still BLOCKED — and exactly why

Nothing below was forced. Each needs either a primitive that is a genuine new combat mechanic, or a
decision only the user can make.

| rows | blocked on |
|---|---|
| `godie-h01u.ex` 戰無不勝 and the **21-strong DAMAGE REDUCTION bucket** | `Ansk` Hardened Skin is 降低傷害機率 **50 %** × 忽視的傷害 **100**, 最小傷害 1 `(w3a Ssk1/2/3)`. GGD mitigation is `100/(100+resist)` only; expressing this needs a **chance-gated flat damage-block layer inside `mitigate()`** — a new mitigation mechanic on every damage packet. Modelling it as an expected-value flat reduction would be a rescale, which [the faithful-import rule](#9-decisions-this-pass-respected) forbids. **Left as-is rather than half-ported.** |
| `godie-e001.ex` 月光下的決鬥者, `godie-hpb1.ex` 獸矛持有者, `godie-o00k.ex` 雷電萌神 — and the same shape across the wider EX set | **The map authored the proc chance as `0` at the ability's only level** while its own tooltip claims a non-zero one: `A0SU` `Hbh1 lv1 = 0.0` (but `Hbh3 lv1 = 158`, `adur = 0.3`), `A0ZA` `Eev1 = 0.0`, `A10X` `War1 = 0.0`. Ported faithfully they are inert buttons; ported from the tooltip they are invented numbers. **One user decision covers all three (and the wider set): honour the data (inert) or honour the tooltip?** |
| `godie-e001.r`, `godie-h020.ex`, `godie-n003.ex`, `godie-ofar.r` (+33 more) | **U1 metamorphosis** — needs the `transform` EffectDef proposal approved. The numbers (`部隊的另一種型態`, 其他形態生命點數加成, 英雄持續) are all in the w3a and quoted per row. |
| `godie-e00q.w` 黑泥召喚, `godie-etyr.r` 聖夜降臨 (+17 more) | **U2 summons** — needs one of Guardian / Turret-as-AoE / damage-only picked. |
| the attribute term of `godie-edem.q`, `godie-h01u.e`, `godie-h020.e`, `godie-n003.r`, `godie-hpb1.w/e` | **U3 STR/AGI/INT in JASS formulas.** The non-attribute terms are shipped exactly; the attribute term is dropped, never guessed. |
| `godie-hpb1.q/w/e` 臨兵鬥 → 者皆陣 → 列在前 | a **3-stage combo** (`udg_MoonCombo`, 1.00 s windows) needs a cross-ability state primitive AND U3. |
| `godie-o02p.r` (EX-mode leg), and 60 more `udg_EX_Mode` sites | **U7** — the default (heal) leg is now shipped; which leg to keep is a design decision. |
| `godie-etyr.w` ally radius, `godie-e008.w` ally radius | no **aura / ally-AoE** primitive: ground AoE resolves against enemies by construction. The caster's own leg is exact; the ally leg is dropped and recorded. |
| `godie-hpb1.r` mana shield | `ANms` 每點生命的法力 −100 / 吸收的傷害 50 % has no GGD equivalent; the doc keeps a stand-in armour buff with the **correct duration**. |
| `godie-e008.ex` 天破壤碎, `godie-ofar.ex` 打雷絕招, `godie-edem.ex` 天照, `godie-e00q.ex` 固有結界-黑洞 | the payload lives on a **spawned dummy unit's** ability (`inferno`, `chainlightning`, `soulburn`…). Resolving dummy → ability → numbers is mechanical and is the natural next batch, but it is a *pipeline* job, not a per-row edit. Their costs/cooldowns are now exact. |
| **all item rows** | `content/items/**`, `content/loot-tables/**` and `apps/platform/internal/curation/**` are owned by task #70/#82 and were being rewritten during this pass; `tools/w3x-import` is read-only here (#56). The `stats.py:36-38` data-column bug (§3.9) is therefore untouched. |

## 10.4 Gates

`pnpm content:build` + `content:validate` clean. Sim purity gate, all same-seed replay/determinism
suites (`SimWorld`, `chaseRange`, `combatJuice`, `combatEnv`, `flowers`, `groundAoeResolve`) and
`compat`/`schema` green. `tsc --noEmit` clean for `@ggd/shared` and `@ggd/game-server`.

**Residual failures, precisely attributed — none from this pass:** `abilityScaling fx-18` and the six
`game-server` curation/loot/build-path failures all read **item costs** (`content/items/godie-i010.json`
was rewritten mid-pass, `ap 21.1`, `cost 300`) — task #82's live item-economy re-pricing.
`audioAssets` "champ-select countdown maxConcurrent ≤ 2" reads `content/config/audio-map.json`,
also rewritten mid-pass — the audio tasks. No ability, champion, sim or schema file is involved in
any of them.
