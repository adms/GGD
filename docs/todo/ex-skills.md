# EX 技能 — per-hero ultimate (WC3 level-30 gate) — TODO

The FAITHFUL「EX 技能」mechanic ported from《去死團的逆襲 EX 2.2s》(`GoDieEX22s.w3x`).

**What it really is** (reverse-engineered from `raw/scripts__war3map.j`): each hero's EX
ability is already on the hero unit, but GATED behind the ability **Requirements** field
(`areq`) referencing the research **`R00R`**. When a hero reaches **LEVEL 30** the trigger
`Nz`/`Bz` fires — `GetUnitLevel(...)>=30 and QR[pid]==false` → `SetPlayerTechResearchedSwap('R00R',1,player)`
— satisfying the requirement so the R00R-gated ability becomes castable. It is a **per-hero**
ability and **NOT every hero has one** (88 of our 91 imported champions do; 3 do not).

**Port shape:**
- `tools/w3x-import/extract_ex.py` → `out/GoDieEX22s/EX_MAP.json` — authoritative
  hero→EX map (parse w3a `areq`→R00R, cross-referenced with each hero unit's `uabi`/`uhab`).
- Each EX ability → a standalone `ability@1` doc `content/abilities/godie-<raw>.ex.json`,
  **slot "EX"**, **maxRank 1** (EX is UNLOCKED, never leveled). Real Chinese map name;
  cooldown/mana/range/radius cleaned from w3a; ONE primary EffectDef by heuristic (offensive
  → magic nuke, self/passive → timed stat buff, control → +status). Numbers approximated to
  arena balance — see the deviations note below. Curated marquee skills carry hand-read values.
- `champion.exAbility` (schema additive) references the EX ability; set on the 88 heroes,
  absent on the 3 without. `champion.skillOrder`/`autoLearn` stay Q/W/E/R (EX is not ranked).
- Sim: `AbilitiesComp.exSlot` (rank 0 locked → 1 unlocked), `learnEx(world,id)` emits
  `exUnlock`; castable through the normal cast path (respects `castTimeSec`).
- Unlock point: `config.arena-rules@1.exUnlockRound` (additive), default **round 5** — a late
  arena spike after the R unlock at round 3 (WC3's level-30 mapped to a late round; our level
  cap is 18). MatchController unlocks EX for active EX-heroes at that round.
- Client: 5th "EX" ability button (distinct gold styling), shown only when unlocked; `F` key +
  gamepad/touch bindings; a「EX 技能解鎖！」toast on the exRank 0→1 transition.

**Removed:** the 15 pseudo-EX `content/augments/ex-*.json` draft cards (the map has NO generic
EX augment draft). The skeleton 3 (bloodlust/chill-touch/aegis-surge) stay. Augment-offer rounds
are cancelled in `arena-rules.json` (weapon rounds stay); the augment draft system + skeleton
pool remain intact for the DEFAULT (legacy) rules and unit tests.

**Deviations (approximated / skipped):** effect NUMBERS are approximated to arena balance the
same way the base Q/W/E/R port is (many WC3 data columns carry tooltip-placeholder values like
99999 / level-1 sentinels). Pure-active map nukes (流星雨/黑龍波/絕空斬…) are ported as a
single magic-nuke or self-buff EffectDef rather than their full multi-hit JASS scripts; passive
map EX (被動 2×傷害 / 反彈 / 再生…) become a timed self stat-buff. See EX_SKILLS.md for the
marquee originals; the curated table in `gen_ex_content.py` carries hand-read values for those.

Evidence: `tools/w3x-import/out/GoDieEX22s/EX_SKILLS.md` + `EX_MAP.json`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ex-02 | EX_MAP.json is a non-empty PROPER subset (R00R / level 30); partitions the roster into with/without EX | ex-map-subset | integration | done |
| ex-03 | pseudo-EX `ex-*` augment cards removed; skeleton 3 kept; content tree stays closed | ex-augments-removed | unit | done |
| ex-04 | `champion.exAbility` set exactly on the EX heroes, unset on the EX-less ones (additive schema) | ex-champion-ability-set | integration | done |
| ex-05 | every EX ability = valid single-rank slot-"EX" `ability@1` with a real effect; champion points back | ex-ability-doc-valid | unit | done |
| ex-06 | sim EX slot is LOCKED before unlock and rejects casts (not-learned) | ex-slot-locked | unit | done |
| ex-07 | `learnEx` unlocks the slot (rank 0→1), emits `exUnlock`, is idempotent; EX then casts through the normal path | ex-unlock-cast | unit | done |
| ex-08 | an EX with `castTimeSec` animation-locks (ab.cast set) and resolves its effects after the wind-up | ex-cast-time | unit | done |
| ex-09 | heroes WITHOUT an EX skill never grow a slot; learnEx no-ops; EX cast rejected | ex-no-slot | unit | done |
| ex-10 | MatchController unlocks EX at `exUnlockRound` (5), not before; EX-less heroes never unlock | ex-unlock-round | integration | done |
| ex-11 | client ability bar shows the EX 5th slot only when unlocked (locked/hidden before) | ex-hud-button | unit | done |
| ex-12 | client input maps a dedicated key + gamepad/touch button to the EX cast slot | ex-input-bind | unit | done |

The w3a R00R Requirements parse is covered by the w3x-import fixture suite (`w3x-r00r-parse`,
[w3x-import.md](w3x-import.md)).
