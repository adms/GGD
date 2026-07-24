# Task #89 — 中立守護塔 (Neutral Guardian Tower) — FINAL BUILDABLE SPEC

**Status:** design complete, buildable. **No source, content or asset file was touched by this
task.** Three workflows (#78 abilities/items, #82 economy, #84 revive circle) are mutating the sim
concurrently; every seam named below is described so it can be written *after* they land.

This document supersedes the pre-critique design. Four adversarial reviews (degenerate-strategy,
snowball, feel/legibility, engineering) were run against it; **§11 dispositions every finding** —
fixed, accepted as a stated trade-off, or rejected with an argument. Nothing was dropped silently,
including the three critiques that arrived truncated.

---

## 0. The feature, and the twelve decisions

The user's words:

> 戰鬥場地中間有類似守護塔的角色，所有人都可以去攻擊，類似 Lol 競技場的大朵花，打死最後一下的人
> 可以獲得 buff 及滿 HP&MP 及額外金幣，來符合有些英雄適合打塔(對建築傷害加成)的定位，彌補競技場
> 沒有塔的劣勢，與 Lol 的差別是這個守護塔會範圍傷害打周圍玩家角色

| # | decision | why, in one line |
|---|---|---|
| 1 | **Siege niche = one scalar `vsStructure`**, resolved pre-mitigation beside `combatEnv.damageDealt` | an attack-type × armour-type table restores the niche for **zero** shipped champions (§1.3) |
| 2 | `vsStructure` from a **champion** applies to **basic attacks only** | WC3 攻城/Demolish is an *attack* modifier; this alone kills the one-shot exploits (§1.4, §11 D1/D2) |
| 3 | **One tower per ACTIVE duel zone, at `zone.center`** | a shared tower at x=0 is 16u outside both `boundaryRadius 24` discs — unreachable and unhittable (§2) |
| 4 | **`maxHitPctMaxHp = 0.15`** — no single packet removes more than 15% of the tower | converts a burst check into a DPS check, which is the only shape in which 對建築傷害加成 can matter (§5) |
| 5 | **No time gate.** Present and attackable from combat entry; **wakes on first damage**, sleeps after 6s untouched | the measured median duel is **18.73 s** — a 20 s wake deleted the feature in >50% of rounds (§11 B2) |
| 6 | All scheduling on **absolute `world.tick`**, never `combatTicks` | `combatTicks` only advances inside `flowerSystem`; a flowerless config froze the clock forever (§11 B3) |
| 7 | Punish = **telegraphed volley on the top-3 damagers wherever they stand**, not a proximity ring | a proximity ring taxes melee and exempts the 14u sniper — the exact inversion of the feature's purpose (§6, §11 D3) |
| 8 | HP `1450 × (1 + 0.28·(round−1))` | holds the 3-man take at **~10–11.5 s flat across the whole round ladder** (§5) |
| 9 | Mitigation **armor 0 / MR 17.65** | the map's own `A0C1 塔之法扣`: 承受傷害 1.0 / 魔法傷害降低 0.85 → `100/(100+17.65) = 0.850` (§5, source-verified) |
| 10 | Reward = **full HP+MP · 150 g · 鎮守之力 25 s** | 150 g = `GOLD_REWARDS.kill`: *slaying the guardian is worth exactly one champion kill* (§8) |
| 11 | 鎮守之力 = **the tower's own volley, inherited** — a flat 25%-strength pulse aura, **not** +ad/ap/as | flat damage cannot Lanchester-rout a fight and cannot snowball with gold (§8, §11 Snowball-1) |
| 12 | Winner = **last hitter only**; void if he is dead at payout | 打死最後一下的人 — and there is no such person if he is a corpse (§7) |

---

## 1. LEAD FINDING — 對建築傷害加成 is prose, and the map's own numbers contradict it as often as they support it

This section is the reason the feature exists. It has been **re-verified directly against
`tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json`** and the pre-critique design was **wrong in two
load-bearing places**. Both corrections make the honest case harder, and both are recorded here
because the user needs to know the difference between *restoring* something and *inventing* it.

### 1.1 What actually survived the port

- `packages/shared/src/sim/combat/damage.ts` — `mitigate()` is the entire model: `physical → Armor`,
  `magic → MagicResist`, `true → flat`, `100/(100+resist)`. **No attack type, no armour type, no
  target category, no structure flag anywhere under `sim/`.**
- `ChampionDef.attackType` (`sim/content/defs.ts:84`) is `"melee" | "ranged"` — a *range class* read
  by `BasicAttackSystem` for wind-up and projectile launch. It is **not** WC3 攻擊類型. The importer
  derives it from range alone (`tools/w3x-import/w3xlib/drafts.py:587`).
- The importer's unit-field whitelist (`w3xlib/stats.py:60-97`) takes `ua1r/ua1c/ua1b/ua1d/ua1s/udef`
  and **drops `ua1t` (attack type) and `udty` (defense type)** — task #56's territory.
- **17 champion documents (16 distinct heroes) carry a 破塔/攻城 classification in the map author's
  own `推薦玩家` line, out of 87 classified documents — 19.5%.** Verified by grep over
  `content/champions/*.json`:

  | 定位 | champions |
  |---|---|
  | 破塔PK | `godie-e002` 亞瑟王 Saber · `godie-e00q` 黑化Saber |
  | 破塔殺人 | `godie-hpal` 藤井八雲 · `godie-nbst` 瘋狂假面 · `godie-ubal` 巴恩大魔王 · `godie-uwar` 撒尿牛丸 |
  | 團戰破塔 | `godie-n01c` + `godie-nbbc` 勇者小呆 · `godie-nman` 憤怒的胖虎 · `godie-u00j` 賽菲洛斯 |
  | 追擊破塔 | `godie-nsjs` 妖狐藏馬 · `godie-ogrh` 悟空 |
  | 攻城巨砲 | `godie-hlgr` 鋼彈煌 |
  | 招喚破塔 | `godie-h001` 斑剎 |
  | PK破塔 | `godie-h01u` 呂布奉先 |
  | KUSO破塔 | `godie-e00r` 初號機 |
  | 破塔堵人 | `godie-huth` 魔人普烏 |

  **15 of the 17 are `range 1.6` melee** (`godie-nsjs` 6.0 and `godie-uwar` 8.2 are the exceptions).
  This number drives §6's volley design.

### 1.2 CORRECTION 1 — `A0R5 破塔加成` does have carriers, and none of them is a champion

The pre-critique design said `A0R5` was *"trigger-granted, no `uhab` carrier"*. It is not. Raw
object file:

```
A0R5  base ANde (Demolish)  name "00-00 破塔加成"
      learn_ubertip: 「狂戰士的斧頭對於建築物擁有兩倍的破壞力。」
      data { "3": 1.0, "4": 1.0 }      ← Nde3 部隊 and Nde4 英雄 overridden to 1.0
                                         Nde2 建築 left at the ANde stock 2.0
      targets_allowed: ground,structure,air,enemies
```

It appears in the `abilities` array of exactly **three non-hero units** — `u002 兄貴戰士`,
`u003 戀愛戰士`, `u02U 援軍戰士` (the map's summoned/reinforcement footmen). The substance of the
old claim survives — **no champion carries it** — but the correct statement is stronger and worse:
the map's only authored anti-building **bonus** was never a hero ability at all.

The tooltip is nevertheless the cleanest statement of intent in the whole object file, and its
magnitude — **2.0×** — is the number §1.4 uses.

Two nerf siblings confirm the family's semantics:

| rawcode | base | 建築 factor | tooltip |
|---|---|---|---|
| `A0AT 00-爆破` | `ANde` | **0.5** | 「對物質界的建築物只能造成50%的傷害。」 |
| `A05R 00-爆破` | `ANd1` | 1.0 (英雄 **1.5**) | the map's own tower ability — see §6 |

### 1.3 CORRECTION 2 — the per-ability 建築 columns do NOT encode the 破塔 identity

**47 rows** of #78's ability ledger (`docs/content/reconciliation/abilities.md`) carry a building
column (`建築物損壞因子` ×46, `建築削減` ×36, `每秒對建築物的傷害` ×4 across those rows). Cross-referenced
against the 破塔/攻城 tag list, **only 6 of the 47 belong to a tagged hero, and 4 of those 6 are
nerfs**:

| ability | column | value | 定位 | reads as |
|---|---|---|---|---|
| `godie-e002.r` 20-04 Avalon | 建築削減 | **1.1** | 破塔PK | bonus |
| `godie-e00q.ex` 69-002 固有結界-黑洞 | 建築削減 | **1.1** | 破塔PK | bonus |
| `godie-uwar.r` 43-03 少林絕學-火雲掌 | 每秒對建築物的傷害 | **150/250/350/450** | 破塔殺人 | bonus (a DoT that only exists if a structure exists) |
| `godie-hlgr.r` 03-04 全彈發射 | 建築物損壞因子 | 0.5 | 攻城巨砲 | **nerf** |
| `godie-hpal.q` 35-01 土爪 | 建築物損壞因子 | 0.5 | 破塔殺人 | **nerf** |
| `godie-huth.r` 28-04 破滅能量彈 | 每秒對建築物的傷害 | 0 | 破塔堵人 | **nerf** |
| `godie-ubal.ex` 37-002 真‧黑核晶 | 建築削減 | 0 | 破塔殺人 | **nerf** |

Meanwhile the biggest *anti*-tower numbers sit on untagged heroes: `godie-hjai.e`/`godie-h020.e`
04-03 龍破斬 建築物損壞因子 **0**, `godie-oshd.r` 0.8, `godie-ogld.q` 0.5/0.5/0.5/0.35,
`godie-emfr.e` 0.2, and eleven more at 0.

> **The 破塔 identity lives ONLY in the 推薦玩家 prose. The map's numeric data does not encode it.**
> Restoring the niche is therefore **a design act, not a transcription**, and this document says so
> up front. What the map *does* hand us is the magnitude (2.0×, `A0R5`), the vocabulary
> (per-ability building factors, both bonus and nerf), and 47 rows of real values to transcribe.

### 1.4 The mechanism — `vsStructure`, one scalar, two carriers

```
StructureComp                        // the guardian is the only carrier in the game
DamagePacket                         // UNCHANGED — no new field, no new queue site
mitigate()                           // falls back to StructureComp.{armor,magicResist}
                                     //   when the target has no StatsComp  (3 lines)

combatResolveSystem, immediately after `pkt.amount *= world.combatEnv.damageDealt`:
    if (world.structure.has(pkt.target)) pkt.amount *= vsStructureOf(world, pkt);
```

`vsStructureOf(world, pkt)` is the product of exactly three terms, each defaulting to `1.0`:

1. **The source ability/item's own factor**, resolved from `pkt.origin`
   (`"ability:godie-uwar.r"` / `"item:godie-i030"` / `"basic"`) against the content registry.
   New optional field `vsStructure?: number` on `AbilityDef` and `ItemDef`.
   **This is the seam #78 authors into and it needs zero further sim changes** — the packet-queue
   sites (`effectRunner`, `BasicAttackSystem.resolveAttack`, `ProjectileSystem` impact) are untouched.
2. **The champion's own factor — `ChampionDef.vsStructure` — applied ONLY when `pkt.origin === "basic"`.**
   This is the faithful reading (Demolish multiplies the carrier's *attack*, not its spells) and it
   is simultaneously the single most important balance decision in the document: see §11 D1/D2.
3. **The aggregate of `ModifierSource.vsStructure`** on the damage source, scanned exactly like
   `hasDamageReductionBuff` already scans `sc.sources` (`damage.ts:139-149`), so champion passives,
   items, augments and timed buffs all reach it through the one existing unifier — and expiry is
   free.

Applied **pre-mitigation**, the same position as `combatEnv.damageDealt`, which is where WC3's damage
factor sits.

### 1.5 Who gets which factor — three tiers, invention flagged

| tier | content | invention? |
|---|---|---|
| **T1 — transcription** | all 47 ledger rows with a building column, verbatim: `godie-hjai.e`/`godie-h020.e` → **0** · `godie-hlgr.r` / `godie-hpal.q` → 0.5 · `godie-oshd.r` → 0.8 · `godie-e002.r` / `godie-e00q.ex` → 1.1 · `godie-emfr.e` → 0.2 · `godie-ogld.q` → 0.5/0.5/0.5/0.35 · … | **none.** #78 owns the authoring; #89 owns the field. |
| **T2 — structure-only DoTs** | `godie-uwar.r` 每秒對建築物的傷害 150/250/350/450 · `godie-i01i` 雷神之鎚 / `godie-i030` 黑色魔書 160/s. These abilities have a clause that *cannot exist* without a structure; #78 currently rates them **MISSING** | **none.** Numbers are in the ledger. |
| **T3 — the 破塔 bonus** | attach **`vsStructure: 2.0`** (the `A0R5` magnitude, and its tooltip's literal words) to the **16 heroes the author's own 推薦玩家 line labels 破塔/攻城** | **YES, and it is 100% invention.** §1.2/§1.3 prove the map never attached it to a hero. It is one field on 17 documents, one number, fully auditable, and reversible by deleting a field. |

`godie-harf.r`'s 「攻擊類型轉為攻城」 — a #78 **MISSING** row — becomes
`applyBuff` + `ModifierSource.vsStructure 2.0` for 7/10.5/14 s. The 2.0 is the `A0R5` magnitude
again; the pre-critique design's "2.5" came from a misread of `A05R` (whose 建築 column is 1.0) and
is withdrawn.

### 1.6 The cross-task collision that must be resolved BEFORE anything is written

`docs/content/reconciliation/README.md:258-265`, #78's in-flight ledger, §6 **U5**:

> "Building / structure / neutral-hostile branches — 123 `STRUCTURE` + 72 `PLAYER_NEUTRAL_AGGRESSIVE`
> tests … *Why it does not map*: **the arena has no towers and no creeps.** **Proposed substitute
> (needs approval)**: collapse each branch to its non-structure … leg and record the dropped
> tower/creep numbers in this ledger."

**#89 is the direct answer to U5. If U5 lands first, #89 has nothing left to attach.** U5's proposal
must be **withdrawn for the STRUCTURE leg**; the `PLAYER_NEUTRAL_AGGRESSIVE`/creep leg stands
unchanged (there are still no creeps). This is a hard, bidirectional dependency and it is item 1 of
the build order (§13).

---

## 2. "Centre" — verified against the code

**Verified facts** (all five `content/arenas/arena.*.json`, identical geometry):

| | value |
|---|---|
| zone-0 centre | `(−40, 0)` |
| zone-1 centre | `(+40, 0)` |
| `boundaryRadius` | 24 (both) |
| spawns | `(±16, {−4, 0, +4})` from centre → **16.00–16.49 u** from `zone.center`, all six |

A single shared tower "between the zones" would sit at `(0, 0)`, which is **40 u from each zone
centre — 16 u outside both discs**. `clampToBoundary` (`sim/collision/resolve.ts`, called every tick
at the end of `movementSystem`) keeps every champion inside its own zone; `queryOverlap`
(`sim/collision/queries.ts:33`) filters candidates by `t.zone`; `MatchController.teamAliveCount` and
`teamHpPct` are both zone-scoped. **A shared tower is unreachable, unhittable and untargetable. It
is not a design option.**

> **Decision: one guardian per ACTIVE duel zone, spawned exactly at `zone.center`.**
> With 3 alive teams there is one pairing (zone 0 only) and therefore **one** guardian; with 4 alive
> teams there are two pairings and **two** guardians. Armed from `MatchController.enterCombat`
> against `this.pairings.map(p => p.zone)` — the same list `beginCombatFlowers` already receives.
> A bye team fights nobody and gets no guardian.

Consequence, stated: **six players contest each guardian, not twelve.** The two duels never interact.

**Existing centre geometry** (this matters for §4):

| arena | circle obstacle at `zone.center`? |
|---|---|
| `arena.castle` | **yes, radius 2.5** |
| `arena.skeleton` | **yes, radius 2.5** |
| `arena.colosseum` | no (nearest circles r 1.4 at ±7 on the x-axis) |
| `arena.dota` | no (nearest r 0.98 at 7.07 u) |
| `arena.godie` | no (nearest r 0.47 at 4.06 u) |

`sim/collision/avoid.ts`'s own module comment names this pillar: *"the zone-centre pillar sits
exactly between the two middle spawn slots"*. The guardian **is** that pillar for the two arenas
that have one, and §4 synthesises it for the three that do not.

---

## 3. Entity model and where it lives in the sim

### 3.1 The component

```ts
/** packages/shared/src/sim/components.ts */
export interface StructureComp {
  /** duel zone; a guardian only ever affects its own zone */
  zone: number;
  /** flat armour / MR, consumed by mitigate() because a structure has no StatsComp */
  armor: number;
  magicResist: number;
  /** hard cap on a single packet, as a fraction of maxHp (see §5) */
  maxHitPctMaxHp: number;

  // ---- all timing is ABSOLUTE world.tick, never world.combatTicks ----
  /** last tick it took damage (-1 = never touched this round) */
  lastDamagedTick: number;
  /** tick it woke; -1 while dormant */
  wakeTick: number;
  /** tick the next volley MARKS (impact is windupTicks later) */
  nextVolleyTick: number;
  /** volleys fired since this wake — drives the ramp; reset on sleep */
  volleysFired: number;

  /** damage dealt to this structure since wake, per champion — the threat table */
  threat: Map<EntityId, number>;
  /** in-flight telegraphs; resolved when world.tick >= impactTick */
  marks: { target: EntityId; x: number; z: number; impactTick: number }[];
}
```

Store: `readonly structure = new Map<EntityId, StructureComp>()` on `SimWorld`, plus one line in
`destroy()`.

### 3.2 The neutrality contract (copied deliberately from the flower)

A guardian carries **transform + health + `StructureComp`, and nothing else**. No `TeamComp`, no
seat, no `Navigation`, no `StatsComp`, no `ChampionComp`, no `matchStats` entry. Therefore
`teamAliveCount`, `teamHpPct`, duel resolution, team lives, placement, the scoreboard and AI team
perception are blind to it **by construction**, exactly as `FlowerComp` documents.

It differs from the flower in exactly two ways, and both are load-bearing:

1. **It has flat `armor`/`magicResist` in its own component**, because `mitigate()` reads
   `world.stats` and a structure has none. A flower currently takes unmitigated damage; a guardian
   must not.
2. **It is excluded from the unit-separation pass** (§4), because a synthesized *obstacle* at the
   same centre does the pushing — and does it with tangent steering, which `pushOutOfObstacle` alone
   cannot.

### 3.3 Residency in `SimWorld.step()`

| slot | system | guardian's involvement |
|---|---|---|
| top | `rebuildGrid()` | **included** — this is what makes it targetable by every ability query, projectile sweep and auto-attack |
| 5 | `movementSystem` | **skipped in the separation pass**; **present as a synthesized obstacle** in the steering + push-out passes (§4) |
| 8 | `combatResolveSystem` | `vsStructure` factor + `maxHitPctMaxHp` clamp + `StructureComp` mitigation fallback |
| 9 | `deathSystem` | emits `death {id, killer}`; **no XP, no gold, no `onKill` hooks** (the flower's rule) |
| 9b | `flowerSystem` | untouched |
| 9c | `reviveSystem` | untouched |
| **9d** | **`guardianSystem` (new)** | wake/sleep, threat decay, mark scheduling, volley resolution, **payout** |

**Why 9d and not earlier.** The payout must consume this tick's `death` events (like
`flowerSystem`) *and* must see the final alive-state of the killer, which `reviveSystem` (9c) can
still change. One system, one slot, no new invariants.

**Consequence, accepted:** volley packets queued at 9d drain at **step 8 of tick T+1** — a 33 ms
latency between the telegraph's scheduled impact and the damage numbers. The client already draws
the telegraph 0.8 s ahead, so this is invisible. The alternative (splitting the volley into a
system at slot 2c) buys 33 ms for a second ordering contract, and is rejected.

### 3.4 Arming and teardown

`sim/guardian.ts`, mirroring `flowers.ts` / `revive.ts` exactly:

```ts
export function beginCombatGuardians(world, rules: GuardianRules, zones: readonly number[], round: number): void
export function endCombatGuardians(world): void                     // silent despawn, idempotent
export function spawnGuardian(world, zone: number, hp: number, rules): EntityId
export function guardianRulesFromConfig(cfg: GuardianConfigLike, dt: number): GuardianRules
```

- `beginCombatGuardians` is called from `MatchController.enterCombat`, next to
  `beginCombatFlowers`/`beginCombatRevives`, and is passed `this.phase.round` so HP and volley
  damage scale (§5).
- `endCombatGuardians` is called from `concludeCombat`, next to `endCombatFlowers`. **Every guardian
  despawns silently the tick a duel is decided — no payout, no burst, no corpse.** This is what stops
  post-round farming (§11 D4).
- `world.guardianRules === null` (default) means **the mechanic is OFF**: unit tests, the skeleton
  boot, and the client's prediction shadow world are strict no-ops. Same convention as
  `flowerRules` / `reviveRules`.

### 3.5 Protocol

`ENTITY_KIND.GUARDIAN = 4`, `key = "prop.guardian"` (`GUARDIAN_MODEL_KEY`). Projection in
`net/snapshot.ts`, reusing the revive circle's precedent of packing state into otherwise-unused
float slots rather than growing the wire schema:

| slot | carries |
|---|---|
| `seatId` | `-1` (neutral) |
| `hp` / `maxHp` | real HP — drives the overhead bar |
| `mana` | **ticks until the next volley IMPACT** (0 = none pending) — drives the HUD ring |
| `maxMana` | `volleyPeriodTicks` — the ring's denominator |
| `shield` | **body radius in world units** — so the client never hard-codes 2.5 |
| `flags` | `ENTITY_FLAG.GUARDIAN_AWAKE (128)` · `ENTITY_FLAG.GUARDIAN_WINDUP (256)` |
| `alive` | `hp.alive` |

`MSG.EVENT` whitelist in `rooms/MatchRoom.ts` gains four types:
`guardianSpawn {id,zone,x,z,maxHp}` · `guardianWake {id,x,z}` ·
`guardianMark {id,targets:[{entityId,x,z}],impactInMs}` · `guardianSlain {id,x,z,killerSeatId,gold}`.
Volley impacts ride the existing `damage`/`hitImpact` events — no new per-hit traffic.

---

## 4. Movement, pathing and projectiles

### 4.1 The pathing defect, and the fix

**Verified defect.** `steerAroundObstacles` (`sim/collision/avoid.ts:40-46`) is called with
`zone.obstacles` only (`MovementSystem.ts:153-159`). **Entities are not obstacles.** A flower's body
push happens in a different place — the unit-separation pass, `MovementSystem.ts:210-217` — as a bare
radial `pushOutOfObstacle` with **no slide and no tangent**. All five arenas put the two mid-slot
spawns at `z = 0` on both sides, so an attack-move across the zone is a dead-on approach to
`zone.center`: the step goes in, the radial push cancels it, and the unit freezes on the spot. This
is precisely the bug `avoid.ts`'s own module comment was written to fix, for the pillar that is at
this exact coordinate.

**Fix — synthesized obstacles, no map change:**

```
obstaclesForZone(world, zoneIdx): readonly Obstacle[]
    = zone.obstacles  ++  [ {kind:"circle", center: t.pos, radius: t.radius}
                            for each ALIVE structure in that zone ]
```

Built once per zone per tick (2 zones, ≤1 structure each — allocation is a 1–2 element concat) and
consumed by **both** `steerAroundObstacles` and the post-separation `pushOutOfObstacle` loop.
Structures are then **skipped in the separation pass** (`if (world.structure.has(id)) continue;`,
one line, exactly the shape `reviveCircle` already uses two lines above).

Why this and not "add a pillar to the three arenas that lack one":

- It works on all five arenas with **zero content edits** — and `content/arenas/*.json` is
  concurrently owned by other work.
- The pillar **appears and disappears with the guardian**, so out-of-combat movement and the
  intermission scene are unchanged.
- `arena.castle` and `arena.skeleton` already have a radius-2.5 circle at the same centre; the
  synthesized one is co-located and identical, and `pushOutOfObstacle` is idempotent, so there is no
  double-push.

**Radius invariant (must be asserted in a test):** the structure's `transform.radius` and the
synthesized obstacle's radius are **the same number**, and the arena's own centre pillar, where it
exists, must equal it too (2.5 in both arenas that have one). If the obstacle were larger than the
transform, melee would be pushed out of its own reach.

**Melee reach is provably fine.** `reachTo(sc, selfR, tgtR) = max(attackRange, selfR + tgtR + 0.1)`
(`BasicAttackSystem.ts:46`). A melee champion (radius 0.6, range 1.6) pushed off a radius-2.5 body
stands at 3.1 u centre-to-centre; `reachTo` returns `max(1.6, 3.2) = 3.2`. The `+0.1` term makes this
hold for **any** guardian radius, which is why the radius is a config knob and not a constant.

### 4.2 Projectiles

The guardian is in the broad-phase grid, so **projectiles collide with it** exactly as they collide
with a champion body. This is **accepted, not fixed**:

- It is correct MOBA behaviour — a 2.5 u obstacle at the dead centre of a circular arena is the only
  piece of cover the arena has ever had, and skillshot lanes across the middle now have a shape.
- It is visible, static, and in the same place every round: it is learnable.
- The knock-on worry ("a stray auto-attack projectile puts me on the threat table") is
  self-solving — the table is a **cumulative total**, and a single 40-damage stray will never place
  a bystander in the top 3 against players who committed. A test pins this (`guardian-threat-stray`).

Consequence to watch in playtest: `arena.colosseum`, `arena.dota` and `arena.godie` gain a hard
centre blocker during combat that they did not have. That is an intended change to those maps'
combat geometry and it is the second-most visible side effect of the feature after the guardian
itself.

---

## 5. Tunables — every value, its derivation, and its home

All of it lives in **`content/config/arena-rules.json`** as an additive `guardianTower` block on
`config.arena-rules@1`, validated by a new `zGuardianTowerConfig` in
`packages/shared/src/content/schema/config.ts` next to `zFlowerConfig` / `zReviveCircleConfig`, and
surfaced on `ArenaRules` via `rulesFromDoc`. **Absent block = mechanic off (legacy).** Seconds in the
doc, ticks in the sim, converted once by `guardianRulesFromConfig(cfg, dt)`.

```json
"guardianTower": {
  "hpBase": 1450,
  "hpGrowthPerRound": 0.28,
  "armor": 0,
  "magicResist": 17.65,
  "radius": 2.5,
  "maxHitPctMaxHp": 0.15,

  "volleyPeriodSec": 4.0,
  "volleyWindupSec": 0.8,
  "volleyMarks": 3,
  "volleyRadius": 3.0,
  "volleyDamageBase": 108,
  "volleyDamageGrowthPerRound": 0.14,
  "volleyRampPct": 0.15,
  "volleyRampMax": 2.0,
  "dormancySec": 6.0,

  "rewardGold": 150,
  "restoreHpPct": 1.0,
  "restoreManaPct": 1.0,
  "buffDurationSec": 25,
  "heirPulsePct": 0.25,
  "heirPulseRadius": 2.5
}
```

### 5.1 The measured baselines every number is derived against

Roster medians over the 113 champion docs that carry `baseStats` (grep-derived, this session):
`maxHealth 480 (+37/lv)` · `ad 35 (+1.8)` · `as 0.50 (+0.02)` · `armor 8 (+0.6)` · `mr 28 (+1.2)` ·
`ms 5.8` · `range 1.6`.
Champion level at round R is **R + 2** (`arena-rules.json`: round 1 grants 2 levels, rounds 2-6 grant
1 each), matching #82's own "level 5 = round 3".

Duel-length distribution, 12 bot matches / 96 rounds / 160 duels on the real content tree
(`docs/todo/revive-circles.md:19-23`):
**p25 15.00 s · p50 18.73 s · p75 24.73 s · p90 30.83 s · max 55.77 s**, against a 90 s
`combatMaxSec` cap.

Blended DPS against a stationary 2.5 u target (autos × 1.8 for guaranteed ability landings, × the
round's realistic item multiplier): **R1 ≈ 41 · R3 ≈ 55 · R6 ≈ 99** for a median champion;
**× 1.56** for a 破塔 hero (its 2.0× applies to the auto share only — §1.4 term 2 — and autos are
1/1.8 of the blend).

### 5.2 The values

| key | value | derivation |
|---|---|---|
| `hpBase` / `hpGrowthPerRound` | **1450 / 0.28** → `1450 · (1 + 0.28·(R−1))` = 1450 / 1856 / 2262 / 2668 / 3074 / 3480 | Chosen so the **3-man take costs a constant amount of fight at every round**: 9.9 s (R1), 11.5 s (R3), 9.9 s (R6). Solo 破塔 22.7 / 26.3 / 22.6 s; solo plain hero 35 / 41 / 35 s — "not a thing you do alone", by arithmetic rather than by rule. The pre-critique additive `1200 + 300(R−1)` did not have this property: it made the objective 40% *cheaper* by round 6 as damage outgrew it. |
| `armor` / `magicResist` | **0 / 17.65** | Source-verified. `A0C1 塔之法扣` (base `Aegr`, on every one of the map's own towers: `uzg1`, `uzg2`, `etrp`, `u01G`, `e00P`, `ncap`, `u000`, `u004`) carries `DataA 承受傷害 (%) = 1.0` and `DataE 魔法傷害降低 = 0.85`. Column names read off #78's own rendering of `Aegr` rows. `100/(100+MR) = 0.85 ⟹ MR = 17.647`. **The map's tower takes 100% physical and 85% magic — physical is the intended siege lane, and armour 0 is what makes 對建築傷害加成 the whole story rather than a rounding error.** |
| `radius` | **2.5** | Equals the existing centre pillar in `arena.castle`/`arena.skeleton`, so the two arenas that already have one are visually and physically continuous. Also the value the §4 radius invariant is asserted against. |
| `maxHitPctMaxHp` | **0.15** | **The single most important number in the document.** See §5.3. |
| `volleyPeriodSec` | **4.0** | At the p50 duel of 18.73 s a guardian that is awake for a realistic 10–12 s window fires 2–3 times. At 5.0 s it fires twice and the threat table never has time to matter; below 3.0 s the telegraphs overlap and stop being readable. |
| `volleyWindupSec` | **0.8** | A champion at `ms 5.8` covers **4.64 u** in the wind-up against a **3.0 u** impact radius — dodgeable by a mobile, attentive player; undodgeable while rooted, stunned, knocked down, or standing still to attack. That asymmetry is the mechanic. |
| `volleyMarks` | **3** | Half the zone's population. At 6 marks the AoE is unavoidable and stops being a skill expression; at 1 it only ever punishes the single top damager and the rest of the scrum is free. 3 is the largest number that still leaves a choice about who stands where. |
| `volleyRadius` | **3.0** | 2.5× a champion's collision diameter (0.6 radius). Small enough to sidestep in 0.8 s, large enough that a clumped scrum eats every mark. ⅓ of the flower's `burstRadius 6`, so the two ground effects never read as the same thing (the rule `revive-circles.md` already set for `radius 2.0`). |
| `volleyDamageBase` / `GrowthPerRound` | **108 / 0.14** → 108 / 123 / 140 / 156 / 172 / 189 | Solved against §8's refund contract. At R3 a mark delivers `140 × 0.906` (median L5 armor 10.4) = **127**; the standard 3-man, ~11 s, 3-volley take costs each participating champion `(1.00+1.15+1.30) × 127 = 438` of a 628 HP bar — **70%**. Team cost ≈ 2.1 bars; refund = 1 bar, to one player. Growth 0.14 tracks the roster's own bar growth (554 → 739 base, ×1.33) plus item eHP, so the *fraction of a bar* a volley costs is flat across the ladder. **This is the first number to revisit after a human playtest** (the same caveat `revive-circles.md` puts on `lifetimeSec`). |
| `volleyRampPct` / `volleyRampMax` | **0.15 / 2.0** | Volley *n* deals `base × min(2.0, 1 + 0.15(n−1))`. **This is the anti-stall clause.** A 6-volley solo siege costs `8.25 × 127 = 1048` against a 628 bar — solo siege is gated on a real sustain build, not on a tag. It is also the direct answer to "hold the last enemy hostage and PvE the guardian" (§11 D4): the longer you farm, the faster it kills you. Reset to zero on sleep. |
| `dormancySec` | **6.0** | Untouched for 6 s → sleep: threat table cleared, ramp reset, no volleys. Legible ("disengage and it forgets you"), and it means a single probing hit costs exactly one volley window. 6.0 = 2× the revive channel, the map's existing "commitment window" unit. |
| `rewardGold` | **150** | `GOLD_REWARDS.kill`. See §8. |
| `restoreHpPct` / `restoreManaPct` | **1.0 / 1.0** | 滿 HP&MP, the user's literal ask. Defensible *only* because §5.2's volley numbers make it a refund rather than a windfall — see §8.2. |
| `buffDurationSec` | **25** | The flower's `respawnSec` — an existing rhythm in the map — and ≈1.3× the p50 duel, so a guardian taken mid-fight buffs you for the rest of the round. |
| `heirPulsePct` / `heirPulseRadius` | **0.25 / 2.5** | §8.3. |

### 5.3 `maxHitPctMaxHp = 0.15` — why the cap exists

A single damage packet against a structure is clamped, **post-mitigation**, to
`0.15 × hp.maxHp`. The clamped value is what hits HP, what is recorded to `matchStats`, and what
`applyImpact` sees.

It does four things at once:

1. **It converts the guardian from a burst check into a DPS check.** 對建築傷害加成 is a *sustained*
   multiplier on attacks. If the objective dies to one button, the multiplier is decoration and the
   feature has failed on its own stated terms.
2. **It makes 打死最後一下 a real race.** `1/0.15 = 6.67`, so the guardian survives a **minimum of 7
   packets** — seven discrete moments at which the last hit can be stolen.
3. **It kills the one-shot exploits outright** (§11 D1/D2/D3), without nerfing a single champion
   number and without touching champion-vs-champion combat at all.
4. **It gives the HP bar a readable shape**: 7 pips, one per cap step (§10).

It never touches an auto-attack: a 破塔 hero's L5 auto against armour 0 is `42.2 × 2.0 = 84`,
one quarter of the R3 cap of 339. **It is an anti-nuke clamp, not an anti-siege clamp.**

**Invention flag:** a per-hit damage cap is not a WC3 mechanic. It is the smallest single knob that
resolves three independent, verified breaks, and it is one line in `combatResolveSystem` gated on
`world.structure.has(pkt.target)`.

---

## 6. The AoE and its telegraph

The user's divergence from LoL: 「這個守護塔會範圍傷害打周圍玩家角色」.

### 6.1 The design

Every `volleyPeriodSec` while awake, the guardian:

1. reads its `threat` map and selects the **top `volleyMarks` champions by cumulative damage dealt
   to it since wake** — alive, in its zone. Ties break by **ascending `entityId`** (deterministic).
   Fewer than 3 damagers → fewer than 3 marks. Zero damagers → no volley (it is asleep by then
   anyway).
2. stamps a mark at **each marked champion's current position**, with
   `impactTick = world.tick + volleyWindupTicks`, and emits `guardianMark`.
3. at `impactTick`, queues a `physical` `DamagePacket` of
   `volleyDamage(round) × ramp(volleysFired)` against **every enemy champion within
   `volleyRadius` of the stamped point** (`queryOverlap` circle, zone-scoped, alive-only) —
   including champions who were never marked. Origin `"guardian"`.

The mark lands **on a player, not on a ring around the tower.** That is the whole of the fix for the
melee/ranged asymmetry and it is not a small point: **15 of the 17 破塔 heroes are `range 1.6`
melee.** A proximity ring taxes exactly the roster the feature exists to serve and exempts the
14 u sniper who steals the last hit. A threat-driven mark hits the sniper at 20 u exactly as hard as
the melee at 3.1 u.

Secondary benefits, all real:

- **The splash makes bystanders matter.** Standing next to a marked ally gets you hit, so the
  guardian spreads a scrum out — the first positional pressure this arena has ever had.
- **It is a threat table**, a mechanic every MOBA player already understands, and it makes "who is
  actually doing the work" a visible, contested fact rather than a hidden accumulator.
- **It re-uses `queryOverlap` verbatim.** No new spatial primitive.

### 6.2 The telegraph

| beat | t | what the player sees | what the sim does |
|---|---|---|---|
| mark | 0.0 s | a rune circle snaps onto the ground at each marked player's feet, guardian's crown flares, `guardianVolley` SFX | `marks.push(...)`, `guardianMark` event |
| tell | 0.0 → 0.8 s | the circle fills from rim to centre; the marked player's own circle pulses harder than an ally's | nothing (the mark is a stamped world point — **it does not follow the player**) |
| impact | 0.8 s | ground crack + dust column, `guardianImpact` SFX, floating damage numbers via #92 | packets queued; resolve at step 8 of tick T+1 |

**The mark does not track.** That is what makes walking out of it a decision rather than a formality.

### 6.3 The hero multiplier is folded in, not layered on

The map's own tower carries `A05R 00-爆破` (base `ANd1`) with **傷害增幅因子（英雄） = 1.5** — a
1.5× multiplier against heroes. In GGD every player character is a hero and there are no non-heroes,
so a separate 1.5 term would be a constant with nothing to contrast against. **It is folded into
`volleyDamageBase`**, and this sentence is the record of that so #78 does not later "discover" a
missing 1.5×.

---

## 7. Last-hit attribution — including every awkward case

### 7.1 The defect, verified

`sim/systems/DeathSystem.ts:13-18` builds `lastDamager` by walking `world.events` and taking the
**last** `damage` event of the tick. `damage.ts` skips a packet only on `!hp.alive`, never on
`hp.hp <= 0`, and `alive` is not cleared until `deathSystem`, one system later. **Every overkill
packet in the same tick still resolves, still emits `damage`, and still overwrites `lastDamager`.**
Queue order within a tick is fixed by `step()` — castResolve (2b) → command (3) → basicAttack (6) →
projectile impact (7) — so an instant nuke that crosses zero loses credit to a slower auto-attack
projectile that lands in the same tick. **The reward would go to the player whose packet was queued
latest, not to the one who crossed zero.**

### 7.2 The fix

`damage.ts` **already computes and ships the right answer**:
`const killingBlow = hpBefore > 0 && hp.hp <= 0;`, emitted on the `damage` event. Because
`hpBefore > 0` is false for every packet after the first one that crosses zero, **exactly one packet
per death can carry the flag** — this is a property of the shipped code, not something #89 adds.

In `deathSystem`, build a second map and prefer it:

```ts
const killingBlowSource = new Map<EntityId, EntityId>();
for (const ev of world.events) {
  if (ev.type === "damage" && ev.data.killingBlow === true) {
    killingBlowSource.set(ev.data.target as EntityId, ev.data.source as EntityId);
  }
}
...
const killer = killingBlowSource.get(id) ?? lastDamager.get(id) ?? null;
```

Three lines. No behavioural change for champion deaths in any case where the killing-blow packet is
also the last packet — which is the overwhelming majority — but it makes the guardian's one reward
rule implementable.

**#89 explicitly does NOT add `if (hp.hp <= 0) continue;` at the top of the packet loop.** That would
stop overkill packets emitting at all, which changes champion kill credit, assist windows and
`largestSingleHit`, and collides head-on with **#90 (kill bounty, "paid once per enemy")**. It is
recorded here as a follow-up **owned by #90**, and #90's owner must sign off on the three-line change
above before it lands.

### 7.3 The awkward cases, all of them

| # | case | rule | why |
|---|---|---|---|
| 1 | two packets cross zero in the same tick | **impossible** — `hpBefore > 0` gates the flag | property of shipped code; pinned by `guardian-lasthit-single-flag` |
| 2 | the killing blow is a DoT or a projectile whose owner is **dead** | **entire reward void**; the guardian still dies and still despawns | 打死最後一下的人 — a corpse is not a 人. Simple, testable, removes an argument |
| 3 | the killing blow's source is **not a champion** (a summon, an expired projectile, a despawned entity) | **entire reward void** | `world.champion.has(killer)` gate — the flower's existing rule, verbatim |
| 4 | the killer **dies later in the same tick** (his own death resolves in the same `deathSystem` pass) | **entire reward void** — `guardianSystem` runs at 9d and re-checks `hp.alive` at payout | see #2. Gold-but-no-buff was considered and rejected as a needless third state |
| 5 | the killing blow lands on the **same tick the duel is decided** | **payout stands.** `guardianSystem` (9d) runs inside `step()`; `checkCombatEnd` runs in `MatchController` *after* `step()` returns | ordering is deterministic and explicit |
| 6 | the guardian is alive when `concludeCombat` fires (nobody killed it) | **silent despawn, no payout, no burst** | `endCombatGuardians`, the flower's rule |
| 7 | the killer is in a **different zone** | impossible (`queryOverlap` zone filter + `clampToBoundary`); assert it in the payout and treat a violation as void | defence in depth |
| 8 | **both zones' guardians die on the same tick** | two independent payouts, resolved in ascending `entityId` order | `world.structure` iterates in insertion order = id order |
| 9 | the killer is **stunned / rooted / knocked down / mid-dash** when the blow lands | payout proceeds normally | no reason to gate on body state; the buff and restore are instantaneous |
| 10 | the killer was **revived** (#84) earlier in the round | payout proceeds normally | a revived player is a living player; no interaction |
| 11 | the killing blow is **`true` damage** | armour/MR bypassed as normal, **but the `maxHitPctMaxHp` clamp still applies** | the clamp is post-mitigation and unconditional |
| 12 | the guardian is killed by a **champion of the team that is about to lose the duel** | payout proceeds normally | the reward is per-player, not per-team, and the round outcome is unrelated |
| 13 | the guardian is killed **while asleep** (a single burst crosses zero before it ever volleys) | payout proceeds normally | possible only in the top 15% of packets seven times over; if playtest shows it, raise HP, do not add a rule |

**Scoreboard:** `guardiansSlain` (killing blows) and `guardianDamage` (mitigated output to
structures) are added to `PlayerMatchStats` and **must be folded into `SimWorld.digest()`** — every
existing counter is, and a counter that fires on one replica and not another must surface as a digest
mismatch, not as a quiet desync.

**No consolation prize.** Everyone who fought the guardian and lost the race gets `guardianDamage`
credit on the settlement screen and nothing else. That is 打死最後一下的人 read literally, and the
flower already owns the "shared team burst" slot.

---

## 8. The reward and its anti-snowball guard

### 8.1 The tension, named

The four reviews disagree with each other about this feature in exactly one place, and it is the
central design question:

- **the degenerate review (D4)** says the reward is *too weak* — spending three champions'
  cooldowns on a neutral costs you a round win worth 3× more, so ignoring it is dominant;
- **the snowball review (Break 1)** says the reward is *too strong* — a full restore plus
  +15% ad/ap/as converts a dead-even 3v3 into a Lanchester rout from parity.

Both are right about the design they were shown. The target is a **gamble that is sometimes correct
and never mandatory** — the flower's job description, one tier up. The four guards below are how the
number gets there.

### 8.2 G1 — the restore is a REFUND, not a windfall

`restoreHpPct 1.0` / `restoreManaPct 1.0`, instant. The user asked for 滿 HP&MP and gets it.

It is defensible only because §5.2 prices the volley against it. At round 3, the standard 3-man,
~11 s take costs **each participating champion ≈ 70% of a full HP bar**. The last hitter therefore
travels `100% → 30% → 100%` and, measured against a world where he never touched the guardian, has
gained **zero HP**. What he has gained is 150 g and a 25 s aura; what his two teammates and the
enemy's contesters have spent is real and is not refunded.

This answers the snowball review's Lanchester arithmetic directly: its 1.485×–2.300× strength
multipliers were computed for a player who went from 25–60% HP to 100% **for free**. Under this spec
he paid for it in advance, in the same currency, in the same fight.

It also answers that review's "Break 2 — the loop the design calls self-balancing is a null
operation". **Correct, and it is the intended shape.** The guardian is an HP-to-tempo converter with
a last-hit race attached. What is *not* intended — and what the top-3 threat table fixes — is that
only the sieger's own teammates pay: with a positional-independent mark, the enemy team's contesters
eat volleys too, so the transfer runs across the fight, not within one team.

### 8.3 G2 — 鎮守之力 is the guardian's weapon, not a stat line

The pre-critique buff was **+15% ad / ap / as for 25 s**. It is withdrawn. `as` compounds with every
on-hit source in the game, and a *percentage* buff multiplies with the winner's gold — which is
precisely the term that makes a snowball a snowball.

> **鎮守之力 (25 s): the bearer inherits the guardian's volley.** Every `volleyPeriodSec`, a
> `heirPulseRadius 2.5` pulse centred on the bearer deals `heirPulsePct 0.25 × volleyDamage(round)`
> physical to enemy champions in radius. No ramp, no marks, no wind-up.

- **Thematically exact**: 你打死了守護者，你繼承了它的力量. It is the single most legible expression of
  the reward the user described.
- **Flat, therefore boundable.** At R3 it is 35 per pulse: ~9 DPS against one enemy (+36% over a
  median L5 auto DPS of 24.5), ~26 DPS in a 3-man scrum. It does not scale with AD, AP, attack speed,
  crit, items or the stat path, so it cannot compound with any of them.
- **It is a zoning tool**, which is what a flat circular arena has none of, and it makes the
  buff-holder a thing you must respect rather than a bigger number.
- **Zero new mechanics** — it is the volley system with `marks = [self]`, no wind-up, and one
  multiplier.

Implementation: a `ModifierSource` of kind `"buff"` with `expiresAtTick`, carrying a
`HookDef`-free marker the `guardianSystem` reads. It expires through `buffExpirySystem` like every
other timed source.

### 8.4 G3 — the gold, and the constraint handed to #82

**`rewardGold = 150`, which is exactly `GOLD_REWARDS.kill`.** The design statement is one sentence a
player can hold in their head: **slaying the guardian is worth one champion kill.**

The snowball review's Break 3 is arithmetically correct and I reproduced it. Deterministic cumulative
gold before each shop is `[600, 1350, 3850, 4850, 6100, 7600]` (`STARTING_GOLD 600` + the
`arena-rules.json` grants), matching `itemTiers.test.ts:239-247`. Twenty stat ticks cost
`20 × 375 = 7500`. A player winning every round has `6100 + 4×300 = 7300` at shop 5 — **a 200 g slack
against the capstone gate.** Any per-round tower income of 50 g or more pulls the capstone from shop
6 to shop 5.

Three things follow, and all three are stated rather than fudged:

1. **The gate is already not robust to variable income.** `GOLD_REWARDS.kill = 150` ships today; two
   kills in a round is 300 g. `statPath.ts:19-24` says so itself — it derives the gate against
   *deterministic* income and acknowledges kill gold sits on top.
2. **#89 will not pretend to fix it, and will not be the thing that breaks it.** 150 g per round, to
   at most **one player per zone**, is bounded by *exactly one champion kill's worth* of the same
   inflation the shipped game already has. That is the strongest claim #89 can honestly make.
3. **The constraint is handed to #82 in writing:** *if the 「大約是第五場之後」 capstone promise must hold
   against variable income, the fix belongs in the gate (e.g. `statStacks >= 20 && round >= 6`), not
   in #89's payout.* #82 and #90 (kill bounty) between them own the aggregate; #89 owns its own
   150 g and no more.

Open question **Q3** (§14) puts 300 g back on the table with the consequence spelled out.

### 8.5 G4 — one guardian per zone per round, no respawn

The flower respawns every 25 s. **The guardian does not.** At most one payout per zone per round,
so a player who wins every last-hit race in a 6-round match takes 6 × 150 = 900 g and six 25 s
auras — a real advantage, earned six separate times, against six separate contests.

---

## 9. Art, audio, and the licensing answer

### 9.1 The #29 problem is real and the tower cannot be a tower

`apps/client/src/render/ArenaScene.ts:51-135` is the occluder audit's live, unit-tested math, and it
runs at the game's own default camera (`CAMERA_PITCH_RAD` 55°, `DOLLY_MIN = DOLLY_DEFAULT = 10` →
eye 8.1915 u, standoff 5.7358 u). `occludesPlayArea()` tests a prop's shadow rectangle against each
zone disc; at `zone.center` the distance is **0**, so the test is trivially true for anything over
`SIGHTLINE_HEIGHT_CAP = 2.4 u`. Re-running `fullHideReach`:

| top height | depth of the band NORTH of it in which a 1.7 u hero is fully hidden |
|---|---|
| 2.4 (the cap) | 0.69 u — body contact, never a vanished hero |
| 4.00 | 3.15 u |
| **4.946** | **5.74 u** — `minFullHideWidth` returns 0: it occludes at *any* width |
| 6.00 | 11.25 u |
| **6.939** | **24.02 u** — the entire north half of a `boundaryRadius 24` zone |
| ≥ 8.19 | ∞ |

`zone.center` is the single worst coordinate in the zone for this function. There is no geometry
escape.

### 9.2 The compliant read

> **The collidable, occluding body is ≤ 2.4 u. The vertical "tower" read is an additive emissive
> light column that contributes to no AABB.**

- **Body (2.4 u, in every AABB):** a stone **plinth/obelisk stub** built from the *same mesh recipe
  `buildArena` already uses for circle obstacles* — `MeshBuilder.CreateCylinder({diameter: radius*2,
  height: SIGHTLINE_HEIGHT_CAP})` — so the guardian is visually continuous with the arena's own
  pillars, and identical to the pillar that already stands at `zone.center` on two arenas. Dressed
  with `rock.glb` (shipped CC0, KayKit Medieval Hexagon Pack) fragments as a broken crown.
- **Column (6 u, in no AABB):** an additive `StandardMaterial` (`emissiveColor`, `alphaMode
  ALPHA_ADD`, `disableDepthWrite = true`, `isPickable = false`), 0.9 u wide × 6 u tall, plus a slow
  counter-rotating ring at 3.5 u. **Invisible to `occludesPlayArea`, which reasons only about prop
  bounds, and invisible to `DecorFader`, which slab-tests AABBs.** It sells the silhouette without
  occluding a pixel of ground truth.
- **States:** dormant = dim column, ring still, no crown flare. Awake = column brightens ~2×, ring
  spins, crown fragments lift and orbit. Wind-up = column strobes on the 0.8 s beat. Death = column
  collapses downward into the plinth, fragments fall, plinth cracks.
- **Do NOT register it with `DecorFader`.** At ≤2.4 u it never needs to fade — that is the entire
  point of the cap — and `DecorFader` is a static-AABB pipeline populated by `dressArena` and cleared
  on teardown, which a per-round `EntityViewRegistry` entity is not part of. Explicitly out of scope.
  (Left unfixed, the fader would have ghosted the guardian to `DECOR_FADE_ALPHA 0.25` for the whole
  fight, because with six bodies scrumming a centre object at least one is north of it essentially
  always — you would have been last-hitting a ghost.)

**Naming.** A literal tall tower is illegal here. The shipped entity is a **守護石碑 / guardian
obelisk**: a cracked stone plinth with an orbiting crown and a pillar of light. The user's word
守護塔 stays in the UI copy and the task title; the art is honest about what it is. Open question
**Q4** offers the rename.

### 9.3 Licensing — the answer, explicitly

**No new third-party asset is introduced by this feature, and the mandatory-attribution list does not
change.**

- Every mesh used (`rock.glb`, and the procedural cylinder that already ships) is **CC0**, from
  KayKit — Medieval Hexagon Pack 1.0 / Dungeon Remastered 1.0, already recorded in
  `content/assets/CREDITS.md` as a *courtesy* credit. No attribution obligation.
- **`tower_blue.glb` / `tower_red.glb` were considered and rejected.** They are the same CC0 pack and
  would have been free, but they are **team-coloured**, and a neutral guardian that reads as a team's
  tower is a legibility bug in a 4-team match. They also carry the `FADE_MODELS` registration in
  `ArenaScene.ts:142` and would drag `DecorFader` back in.
- **The one mandatory in-game credit remains exactly one item**: `dragon2.glb` (LasquetiSpice,
  CC-BY 4.0), per `content/assets/CREDITS.md`. **Task #13's obligation list is unchanged by #89.**

### 9.4 Audio

Four new `sfx` keys in `content/config/audio-map.json` (the existing map already has 57), fed into
`apps/client/src/audio/types.ts` and the `combatSfx` fan-out:

| key | moment | source | notes |
|---|---|---|---|
| `guardianWake` | first damage taken | 効果音ラボ `sfx/lab/cast-circle.mp3` pitched −25%, or a new `GENERATE.sh` entry | one-shot, `maxConcurrent 1` |
| `guardianVolley` | mark stamped (the telegraph's *start*) | `sfx/lab/magic-lightning.mp3` at low gain | must be audible off-screen — this is the tell |
| `guardianImpact` | volley resolves | `sfx/lab/impact-heavy.mp3` | `cooldownMs` throttled: three marks can land in one frame |
| `guardianSlain` | the killing blow | `sfx/lab/match-end-gong.mp3` + `sfx/lab/explosion.mp3` layered | the round's biggest non-victory sound |

**Licensing:** the 効果音ラボ pack is **free for commercial use, credit optional** — filed with the
CC0 courtesy credits, *not* with the mandatory rows (`content/assets/audio/README.md:798-822`).
Three prohibitions bite and none of them applies here: no soundboard/sound-test screen for that
directory, no AI training or voice cloning, and voice-actress lines must be played whole (these are
SFX, not voice). If no shipped clip fits, extend the deterministic `sfx/fx/GENERATE.sh` — our own
synthesis, unencumbered. **No new licence obligation either way.**

VFX (`apps/client/src/vfx/VfxSystem.ts`): reuse existing hand-authored docs — `guardianMark` → a
ground rune decal (new `vfx@1` doc, procedural), `guardianImpact` → the existing `fx.explosion`
family, `guardianSlain` → layered `explosion` + a light-column collapse. `HitSpark` fallback when a
doc never loaded, following the flower's precedent exactly.

---

## 10. HUD, minimap, settlement

### 10.1 The client cannot currently click it — this is a blocker

`apps/client/src/GameApp.ts:1085-1096`:

```ts
private enemyUnitsFor(myTeam: number): PickableUnit[] {
  ...
  state.entities.forEach((es) => {
    if (es.kind !== 0 || !es.alive) return;   // ← champions ONLY
```

This is the *only* source for `pickEnemyAt` (`:1098`), the mouse right-click order, touch
`nearestEnemy` (`:407`) and pad auto-aim (`:435`). `docs/todo/flowers.md` already records it as a
known open item. It was tolerable for a flower (AoE clips it incidentally). **It is fatal for a
feature whose entire reward rule is 打死最後一下的人.**

**Fix (client, required):**

```ts
if ((es.kind !== KIND_CHAMPION && es.kind !== KIND_GUARDIAN) || !es.alive) return;
...
units.push({ id: es.id, x: pos.x, z: pos.z, radius: es.kind === KIND_GUARDIAN ? es.shield : 0.6 });
```

The radius comes from `es.shield` (§3.5), so the client never hard-codes 2.5. A guardian is a
legal target for an attack order at all times (there is no invulnerable phase to gate on). Ally-
targeted casts (`targetsEnemies: false`) already reject non-champions server-side; the client only
has to allow the order.

**AI (`apps/game-server/src/ai/Tier0Brain.ts`):** mirror the flower rule's shape. A bot attacks the
guardian when *(a)* its own team has ≥2 alive in the zone, *(b)* the guardian is within
`GUARDIAN_SEEK_RANGE 12` u, and *(c)* its own HP fraction is above `GUARDIAN_SEEK_HP_PCT 0.55`.
The flower rule (below 65% HP → harvest) already outranks it when hurt, and the revive circle
outranks both. Without this, no bot match ever exercises the feature.

### 10.2 The overhead bar

`apps/client/src/render/overheadAnchors.ts` gates every world-anchored bar and currently returns
true only for kinds 0 and 2 — a new kind gets **no bar at all**. Three pure changes, all unit-tested
in that file's existing test:

- `hasOverheadBar(4) → true`
- `anchorColorFor(4) → "#d9b36c"` — a stone/amber outside both the 4-team palette and the flower's
  `#b7e3a8`, so a guardian bar can never read as a team's champion or as a plant
- `anchorHeightFor(4) → 2.8` — above the 2.4 u body (champions use 2.45, flowers 1.35)

**And the bar is segmented into 7 pips.** `1/maxHitPctMaxHp = 6.67 → 7`: one pip per cap step, so
"one more hit" is readable at a glance from across the arena. This is the last-hit race made
legible, and it falls straight out of §5.3 rather than being decoration.

⚠ **`ui/WorldAnchorLayer.tsx` is LOCKED by #33.** The flowers doc already records the required 1-line
consumer change (`makeChampionNode(anchor.name, anchor.color ?? teamCss(anchor.teamId),
anchor.isLocal)`); until it lands, a guardian bar renders with `teamCss(-1)` (gold). **#89 inherits
that dependency and does not fix it.**

### 10.3 The volley HUD

- The **wind-up ring** is drawn in the world at each marked point (not on the HUD), from
  `es.mana / es.maxMana`. Your own mark is drawn at 2× the rim brightness of an ally's or an
  enemy's — you must be able to tell "that one is mine" in 0.8 s.
- A **compact guardian strip** at the top-centre of the HUD, next to the round timer: the pip bar,
  awake/dormant state, and a 4 s volley countdown. Off-screen guardians must still be readable — the
  guardian is at `zone.center` and the camera is often not.
- 鎮守之力 renders as a standard buff icon with a 25 s sweep in the existing buff row.

### 10.4 Minimap

One neutral icon at `zone.center` with a thin HP ring; **never** drawn through the champion-portrait
path (`#58`'s LoL-spec minimap). Neutral colour = the bar's `#d9b36c`. **Note #67 is pending** (the
minimap should show only the player's own duel zone); when it lands, the guardian icon follows it
automatically because it is per-zone data.

### 10.5 Settlement

- `PlayerMatchStats.guardiansSlain` and `.guardianDamage`, both in `digest()` (§7.3).
- The settlement screen (#25) shows **守護塔** as its own row: `guardiansSlain` as the headline and
  `guardianDamage` beneath it, so the three players who did the work and lost the race are visibly
  credited even though they were paid nothing.
- **Rating (#25's `rating.ts`)**: `guardiansSlain` should feed the objective/utility axis, weighted
  above `flowersEaten`. The exact weight is #25's to own; #89 supplies the counters and states the
  requirement.

---

## 11. Disposition of every critique finding

**Transmission note, stated rather than hidden:** three of the four reviews arrived truncated in this
session. Received in full: the snowball review (Breaks 1–3). Received partially: the degenerate
review (D1–D4 complete, **D5 cut mid-sentence** at *"The payout lands on whoever is already
winni…"*), the feel review (F1–F3 complete, **F4 cut mid-item**, **F5 never received** despite the
verdict announcing five blockers), and the engineering review (**B1–B4 complete of a stated nine;
B5, B6, B8, B9 never received; B7 is known only from cross-references inside B1 and B4**). Every
received item is dispositioned below; every missing item is named as an explicit gate in §12/§13
rather than assumed away.

### 11.1 Degenerate-strategy review

| id | finding | disposition |
|---|---|---|
| **D1** | 藤井八雲's R 光牙 (targeted, range 11, 600/1000/1400 magic, `ap` coeff 1.0) with the design's own 2.0× deletes the guardian in one cast from outside every punish. Verified: `content/champions/godie-hpal.json` R block is exactly as quoted. | **FIXED, twice over.** (a) §1.4 term 2 — a champion's `vsStructure` applies to **basic attacks only**, which is also the *faithful* reading of Demolish/攻城, so 光牙 gets ×1.0, not ×2.0. (b) §5.3 — `maxHitPctMaxHp 0.15` clamps any single packet. At round 3 (R unlocks; `ultUnlockRound 3`) 光牙 rank 1 delivers `600 × 0.850 = 510`, clamped to `0.15 × 2262 = 339` — **15% of the bar, on a 55 s cooldown**. (c) And §6 marks him: he is now the top damager, so the volley finds him at 11 u. |
| **D2** | Same trick without an ult, from round 1: 鋼彈煌 W 磁軌砲 (cd 15 s), 勇者小呆 R, 魔人普烏 W. Numbers verified, though the critique quoted **max ranks** — 磁軌砲 is 125 at rank 1, not 350; 把你變成餅乾 is 250 at rank 1, not 650. | **FIXED** by the same two mechanisms; the correction is recorded because it changes the magnitude, not the direction. 磁軌砲 rank 1 at round 1: `125 × 0.850 = 106`, under the cap, **7% of a 1450 bar**, twice a minute. |
| **D3** | The reward flows to a hero who never lost his role: 莉娜 04-03 龍破斬 (`ground`, range 14.0, radius 6.0, auto-learned rank 1 in round 1) reaches 20 u — she snipes the last hit **without leaving spawn** (spawns are 16.0–16.49 u from `zone.center`). Verified in `content/champions/godie-hjai.json` and all five arena docs. | **FIXED, three ways, and this critique produced the design's best idea.** (a) §6 — the volley marks the **top-3 damagers wherever they stand**, so the 20 u sniper eats the punish that the 3.1 u melee used to eat alone. This is the whole reason the volley is threat-driven rather than proximity-driven. (b) §5.3 — the cap means she can never take the last hit from above 15% HP, and 龍破斬 is on a 60 s cooldown. (c) **The map's own data agrees with the critique's instinct and goes further**: `godie-hjai.e` / `godie-h020.e` carry `建築物損壞因子 = 0` in the w3a (#78 ledger, lines 87 and 579). Under §1.5 T1 that is transcribed verbatim — **龍破斬 does literally zero damage to a structure.** The ledger annotates it "(in w3a, never read)", meaning the GGD sim never reads the field, not that the author left it blank; I am treating it as authored because it is not tagged `*(slk)*`. **Q2 in §14 asks the user to confirm.** |
| **D4** | Ignoring it is dominant: `checkCombatEnd` (`MatchController.ts:517-537`) decides the instant `teamAliveCount(side, zone) === 0`, so the guardian is killable only while both teams have a body up — and a round win is 900 team gold + 1–3 lives against 300 g to one player. Corollary: at 3v1 the correct play is to **refuse to kill the last enemy** and farm. | **PARTLY ACCEPTED, partly FIXED.** *Accepted:* a neutral objective in a 3v3 arena **should** be a gamble, not a tax — LoL Arena's flower is likewise optional. The failure mode to avoid is "always ignore it", not "sometimes ignore it", and §8's costing puts the trade near break-even so the decision is real. *Fixed, for the hostage case:* (a) `volleyRampPct 0.15` uncapped-until-2.0 makes a long PvE session strictly worse than a short one — volleys 5–8 hit for 1.6–2.0×, so farming at 3v1 costs more HP than 150 g is worth; (b) `endCombatGuardians` in `concludeCombat` despawns the guardian **silently, with no payout**, the tick the pairing is decided, so there is no post-round farming window at all. |
| **D5** | *Truncated mid-sentence: "The payout lands on whoever is already winni…"* | **CANNOT BE DISPOSITIONED — recorded as an open gate.** The visible fragment reads as "the reward compounds for the team that is already ahead", which is the same axis as Snowball Break 1 and is addressed by §8.2/§8.3 (refund-shaped restore, flat non-scaling buff, 150 g). **§13 makes re-running the degenerate review against this spec a hard gate before any code lands**, and this row is why. |

### 11.2 Snowball review

| id | finding | disposition |
|---|---|---|
| **Break 1** | The 300 g is the small half. The reward is combat power, mid-round, to one player, in a round already proven close (the 20 s wake meant it *only* fired in rounds still undecided at 20 s). Lanchester: a full restore + 15% ad/ap/as converts parity into a 51–72% decisive win. Priced on #82's own `POWER = sqrt(DPS × eHP)`. | **FIXED, three ways.** (a) **The 20 s wake is gone** (§0 #5) — the guardian is live in *every* round, not only the close ones, so the selection effect the critique correctly identified is deleted at the root. (b) **The +15% ad/ap/as is withdrawn** and replaced by 鎮守之力, a **flat** inherited pulse (§8.3): flat damage cannot multiply with build and does not enter the `sqrt(DPS × eHP)` term as a scalar on the whole player. (c) **The restore is pre-paid**: at round 3 a 3-man take costs each participant ≈70% of a bar (§8.2), so the last hitter's net HP swing versus not-fighting-the-guardian is **zero**. The critique's model assumed a free heal; under this spec it is a refund. |
| **Break 2** | The self-balance loop is a null operation — the sieger spends 516 HP and the kill refunds all 516; the punish taxes *everyone who helped and lost the race* and is refunded in full to the winner. | **ACCEPTED as the intended shape, with one real correction.** The guardian is an HP-to-tempo converter with a last-hit race attached; "you pay a bar, you get a bar plus 150 g plus an aura" is exactly the trade. The critique's *real* defect is the word **"your teammates"** — under a proximity ring only your own side paid. Under the §6 threat-driven mark **the enemy's contesters are marked too**, so the transfer runs across the fight rather than within one team. That part is fixed; the refund shape is deliberate and is now stated as such in §8.2 rather than left as an emergent accident. |
| **Break 3** | 300 g breaks #82's capstone gate. Reproduced exactly: deterministic cumulative `[600, 1350, 3850, 4850, 6100, 7600]` (matches `itemTiers.test.ts:239-247`); 20 ticks = 7500 g; a player winning every round has 7300 at shop 5 — a **200 g** slack. Any tower gold ≥50 g/round moves the capstone to shop 5; with #90's bounty as well, to shop 4. | **PARTLY FIXED, partly ACCEPTED, with the constraint handed over in writing.** *Fixed:* the payout drops from 300 g to **150 g = `GOLD_REWARDS.kill`** (§8.4), one player per zone per round, no respawn. *Accepted, and named:* the gate is **already** not robust to variable income — `GOLD_REWARDS.kill = 150` ships today and two kills is 300 g; `statPath.ts:19-24` derives the gate against *deterministic* income and says so. #89 will not pretend to fix that and will not be the thing that breaks it: 150 g is bounded by exactly one champion kill of the same inflation the shipped game already has. *Handed over:* if 「大約是第五場之後」 must hold against variable income, the fix belongs in the gate (`statStacks >= 20 && round >= 6`), and that is **#82's**. §14 **Q3** puts 300 g back on the table with the consequence priced. |

### 11.3 Feel / legibility review

| id | finding | disposition |
|---|---|---|
| **F1** | You cannot click it. `GameApp.enemyUnitsFor:1085-1096` hard-filters `es.kind !== 0`, and it is the only source for right-click orders, touch `nearestEnemy` and pad auto-aim. | **FIXED — §10.1**, verbatim as proposed, plus the radius from `es.shield` so the client never hard-codes the config, plus the `Tier0Brain` rule without which no bot match exercises the feature. |
| **F2** | A tower-shaped tower is illegal under #29, and the legal one is a bollard. `occludesPlayArea` at `zone.center` has distance 0; anything over 2.4 u offends; at 4.946 u it occludes at any width; at 6.939 u it hides the entire north half of the zone. | **FIXED — §9.1/§9.2, adopting the critique's own proposed fix verbatim and crediting it.** The occluding body is ≤2.4 u and reuses `buildArena`'s own obstacle-cylinder recipe; the vertical read is an **additive, depth-write-off emissive column** that enters no AABB and is therefore invisible to both `occludesPlayArea` and `DecorFader`. The entity is renamed in the art to **守護石碑** — §14 **Q4** asks the user whether the UI copy should follow. |
| **F3** | `DecorFade` is the failure mode, not the escape hatch: with six bodies scrumming a centre object, at least one is north of it essentially always, so the fade target is 0.25 for the whole fight; and `DecorFader.register` takes a pre-measured static AABB populated by `dressArena`, which a per-round entity is not part of. | **FIXED by exclusion — §9.2.** The guardian is **never registered** with `DecorFader`. At ≤2.4 u it never needs to, which is the entire point of the height cap. No new register/unregister plumbing, no budget for it. |
| **F4** | The HP bar renders as a blue team-0 champion. `hasOverheadBar(kind)` (`overheadAnchors.ts:28`) returns true only for kinds 0 and 2 — a new kind gets **no bar at all**; `GameApp.ts:1302-1331` hardcodes every neutral branch as a binary is-flower test. *(item truncated mid-sentence at its third file)* | **FIXED for what was received — §10.2.** `hasOverheadBar(4)`, `anchorColorFor(4) = "#d9b36c"` (outside both the team palette and the flower green), `anchorHeightFor(4) = 2.8`, plus the **7-pip segmentation** that makes the last-hit race readable. The `isFlower` binary at `GameApp:1302-1331` becomes a per-kind lookup rather than a second boolean. **The locked `ui/WorldAnchorLayer.tsx` dependency (#33) is inherited, not fixed**, and is named in §10.2. |
| **F5** | **Never received.** The verdict announced five blockers; F2 states *"That also solves F5 for free"*, which points at the emissive-column decision. | **CANNOT BE DISPOSITIONED — recorded as an open gate.** Two candidate readings are consistent with F2's remark: (i) a death/state read problem (you cannot see that the guardian died, which the collapsing light column solves), or (ii) a `DecorFade`/material interaction (which §9.2's no-registration rule solves). **§13 makes re-running the feel review against this spec a hard gate**, and this row is why. |

### 11.4 Engineering review

| id | finding | disposition |
|---|---|---|
| **B1** | Last-hit credit does not go to the killing blow. `DeathSystem.ts:13-18` takes the *last* `damage` event; `damage.ts` skips only on `!hp.alive`, so overkill packets in the same tick overwrite `lastDamager`. **Verified against the shipped code.** | **FIXED — §7.2**, using the critique's own minimum fix: `deathSystem` builds a second map from `killingBlow === true` and prefers it. Three lines. **The second half of the critique's fix (`if (hp.hp <= 0) continue;` in `damage.ts`) is deliberately NOT taken by #89** — it changes champion kill credit and collides with #90; it is recorded as #90-owned and #90 must sign off on the three-line `deathSystem` change. |
| **B2** | 20 s dormancy kills the feature in >50% of rounds. Measured, in-repo: p50 duel **18.73 s** (`docs/todo/revive-circles.md:19-23`, 96 rounds / 160 duels). Soloable by a 破塔 hero essentially never. | **FIXED, and the fix is bigger than the critique's.** The critique proposed 8–10 s or an HP gate. **This spec removes the time gate entirely** (§0 #5): the guardian is present and attackable from combat entry and wakes on **first damage**, so it is live in 100% of rounds and the player decides when the clock starts. The old justification ("keeps the 15 s flower beat clean") was wrong on its own terms, since it made the objective a no-show in the median round. §5.2's HP curve is separately re-derived so a 3-man take is ~10–11.5 s at *every* round, which fits inside p25 (15.00 s). |
| **B3** | The wake clock has no tick source that survives a no-flowers config: `world.combatTicks` is incremented **only inside** `flowerSystem`, which returns early when `flowerRules` is null — the legacy path, the skeleton boot and every unit test. A `combatTicks`-based wake never fires there, leaving a permanently invulnerable body in the broad-phase. **Verified.** | **FIXED — §3.1/§0 #6.** *Every* guardian timestamp is absolute `world.tick`, stamped in `spawnGuardian` / on damage: `lastDamagedTick`, `wakeTick`, `nextVolleyTick`, `marks[].impactTick`. This is the exact rule #84 already documented at `components.ts:150-152` and #89 follows it verbatim. The invulnerability that made the failure catastrophic is also gone — there is no invulnerable phase at all. |
| **B4** | The guardian is invisible to pathing. `steerAroundObstacles` is called with `zone.obstacles` only (`MovementSystem.ts:153-159`); entity push-out is a bare radial `pushOutOfObstacle` in the separation pass (`:210-217`) with no slide and no tangent. All five arenas put both mid-slot spawns at `z = 0`, so an attack-move across the zone is a dead-on approach and the mid player locks up **every round, on both sides**. **Verified**, and `avoid.ts`'s own module comment describes this exact bug at this exact coordinate. | **FIXED — §4.1.** `obstaclesForZone(world, zoneIdx)` concatenates a synthesized circle per live structure onto `zone.obstacles` and feeds **both** the steering and the push-out passes; structures are skipped in the separation pass (one line, matching the `reviveCircle` line two rows above). Chosen over "add a pillar to three arena docs" because it needs **zero content edits** (those files are concurrently owned), works on all five arenas, and the pillar appears and disappears with the guardian. The `transform.radius == obstacle.radius` invariant and the `reachTo` melee-reach proof are in §4.1 and are pinned by tests. |
| **B7** | Stray projectiles hit the guardian by accident (known only from cross-references inside B1 and B4; the item itself was not received). | **ACCEPTED as intended behaviour, with the side effect named — §4.2.** A 2.5 u body at the dead centre of a circular arena is the only cover this arena has ever had, and skillshot lanes across the middle acquiring a shape is a gain, not a bug. The knock-on ("a stray auto marks me for a volley") is self-solving because the threat table is a cumulative total; pinned by `guardian-threat-stray`. The visible cost — `arena.colosseum` / `arena.dota` / `arena.godie` gain a hard centre blocker during combat — is stated in §4.2 as the second-most visible side effect of the feature. |
| **B5, B6, B8, B9** | **Never received** (the review announced nine defects, four blocking; four items and their blocking status are unknown). | **CANNOT BE DISPOSITIONED — recorded as an open gate.** Known-adjacent hazards this spec addresses pre-emptively, in case they overlap: a champion killed by the guardian is a death whose `killer` is a non-champion — `recordChampionDeath` already guards with `world.champion.has(killer)` (verified, `matchStats.ts:248`), so no kill, no gold, no XP, no `onKill`, and **#90's bounty must not pay on it**; `matchStats` entries are created only by `spawnChampion`, so a guardian never accumulates; `digest()` must gain the two new counters. **§13 makes re-running the engineering review against this spec a hard gate.** |

### 11.5 Rejected outright

| claim | rejection |
|---|---|
| *(pre-critique design)* `A0R5 破塔加成` is "trigger-granted, no `uhab` carrier" | **Rejected on the source.** It sits in the `abilities` array of `u002 兄貴戰士`, `u003 戀愛戰士`, `u02U 援軍戰士`. The substance survives (no *champion* carries it) but the correct statement makes §1.5 T3 a **100% invention**, not a 90% one, and the user is entitled to that distinction. |
| *(pre-critique design)* `A05R` carries 建築 2.5 | **Rejected on the source.** `A05R` data is `{2: 1.0, 3: 1.0, 4: 1.5}` — 建築 **1.0**, 英雄 **1.5**. The 2.5 does not exist anywhere in the object file. `godie-harf.r`'s 「攻擊類型轉為攻城」 therefore uses 2.0 (the `A0R5` magnitude), and the 1.5 is repurposed as source evidence for the guardian's own hero damage (§6.3). |
| *(pre-critique design)* the reward buff should be +15% ad/ap/as | **Rejected** — see Snowball Break 1. A percentage buff multiplies with the winner's gold; that is the definition of the term you must not add to a snowball. |
| *(D2)* "the HP budget is smaller than the burst the design is doubling" therefore the HP budget must rise | **Rejected as the fix**, accepted as the diagnosis. Raising HP to survive a 2380-damage nuke makes the guardian unkillable by the autos-and-sustain build the feature exists to serve. The cap is the correct instrument: it bounds the *nuke* without bounding the *siege*. |
| *(F2, as an option)* keep the tall tower and rely on `DecorFade` | **Rejected** — see F3. The fade would be pinned at 0.25 for the whole fight, and the fader is the wrong pipeline for a per-round entity. |

---

## 12. Test plan

Conventions per `docs/todo/_index.md`: every item carries a unique `Test ID` emitted by
`cover("<test_id>")` from `@ggd/shared/testkit`; `pnpm todo:check` gates statically, CI gates at
runtime. Regression suites run last.

### 12.1 Sim — determinism and purity (`packages/shared/src/sim/guardian.test.ts`)

| id | assertion | category |
|---|---|---|
| `guardian-determinism-digest` | two worlds, same seed, same intents, guardian armed → identical `digest()` every tick for 2700 ticks, and `guardiansSlain`/`guardianDamage` are inside the digest | determinism |
| `guardian-purity-no-rng` | the volley, the mark selection, the threat table and the payout consume **no** `world.rng` draws (rng state unchanged across a full siege) | purity |
| `guardian-tick-source` | with `flowerRules === null`, a guardian still wakes, volleys and pays out — i.e. nothing reads `combatTicks` | regression (B3) |
| `guardian-disarmed-noop` | `guardianRules === null` → `spawnGuardian` never called, no entity, no events, digest identical to a pre-feature world | unit |

### 12.2 Sim — combat

| id | assertion | category |
|---|---|---|
| `guardian-mitigation-physical` | 1000 physical into `armor 0` → 1000 pre-clamp | unit |
| `guardian-mitigation-magic` | 1000 magic into `magicResist 17.65` → 850 ± 0.5 (the `A0C1` 0.85) | unit |
| `guardian-cap-single-packet` | a 5000-damage packet against a 2262 HP guardian removes exactly `0.15 × 2262 = 339.3`; `matchStats.damageDealt` records the **clamped** value | unit (D1/D2) |
| `guardian-cap-min-packets` | a guardian cannot die in fewer than 7 packets at any round | unit |
| `guardian-cap-not-autos` | a `vsStructure 2.0` auto at L5 (84 dmg) is never clamped | unit |
| `guardian-vsstructure-basic-only` | `ChampionDef.vsStructure 2.0` doubles an `origin === "basic"` packet and leaves an `origin === "ability:*"` packet untouched | unit (D1) |
| `guardian-vsstructure-ability` | `AbilityDef.vsStructure 0` (龍破斬) → zero damage to a structure and unchanged damage to a champion | unit (D3) |
| `guardian-vsstructure-modifier` | a timed `ModifierSource.vsStructure 2.0` (godie-harf.r) applies while active and stops at `expiresAtTick` | unit |
| `guardian-vsstructure-champions-untouched` | every `vsStructure` path is a strict no-op against a target with a `StatsComp` | regression |

### 12.3 Sim — the volley

| id | assertion | category |
|---|---|---|
| `guardian-wake-on-damage` | dormant until the first packet; `wakeTick` stamped from `world.tick` | unit (B2) |
| `guardian-sleep-on-neglect` | 6 s untouched → dormant, `threat` cleared, `volleysFired = 0` | unit |
| `guardian-marks-top3` | with 6 damagers, exactly the top 3 by cumulative damage are marked; ties break by ascending `entityId` | unit |
| `guardian-marks-reach-the-sniper` | a champion who damages it from 20 u is marked and takes the volley | regression (D3) |
| `guardian-mark-does-not-track` | a marked champion who moves 5 u during the 0.8 s wind-up takes **zero** | unit |
| `guardian-mark-splash` | an unmarked champion standing within 3.0 u of a mark **is** hit | unit |
| `guardian-ramp` | volley *n* deals `base × min(2.0, 1 + 0.15(n−1))`; reset on sleep | unit (D4) |
| `guardian-volley-hits-both-teams` | a 3v3 in which both sides attack it produces marks on both sides | regression (Break 2) |
| `guardian-threat-stray` | a single stray 40-damage projectile never places a bystander in the top 3 against three committed attackers | unit (B7) |

### 12.4 Sim — attribution and reward (one test per §7.3 row)

| id | assertion | category |
|---|---|---|
| `guardian-lasthit-killing-blow` | an instant nuke crossing zero at castResolve beats a projectile that impacts later in the same tick | **regression (B1)** |
| `guardian-lasthit-single-flag` | at most one `damage` event per death carries `killingBlow: true` | unit |
| `guardian-lasthit-void-dead-killer` | killer dead at payout → no gold, no restore, no buff; guardian still dies | exception |
| `guardian-lasthit-void-non-champion` | non-champion source → reward void | exception |
| `guardian-lasthit-void-same-tick-death` | killer dies in the same `deathSystem` pass → reward void | exception |
| `guardian-lasthit-round-ends-same-tick` | payout resolves before `checkCombatEnd`; the gold is on the scoreboard at settlement | integration |
| `guardian-lasthit-true-damage` | a `true` packet is still clamped and still credits normally | unit |
| `guardian-two-zones` | both zones pay independently, in ascending `entityId` order | unit |
| `guardian-reward-values` | +150 g, HP and mana to max, `鎮守之力` source attached with `expiresAtTick = tick + 25/dt` | unit |
| `guardian-heir-pulse` | the buff pulses `0.25 × volleyDamage(round)` physical every 4 s within 2.5 u to enemy champions only, and stops at expiry | unit (Break 1) |
| `guardian-no-xp-no-gold-on-death-event` | killing a guardian grants **no** `XP_REWARDS.kill`, **no** `GOLD_REWARDS.kill`, and fires **no** `onKill` hooks | regression |
| `guardian-victim-of-guardian` | a champion killed by a volley produces a death with a non-champion killer: no kill credit, no bounty (#90), `recordChampionDeath` guard holds | regression |

### 12.5 Sim — neutrality and lifecycle

| id | assertion | category |
|---|---|---|
| `guardian-invisible-to-team-iterations` | `teamAliveCount`, `teamHpPct`, duel resolution, lives and placement are unchanged with a guardian alive in the zone | regression |
| `guardian-no-matchstats-entry` | `world.matchStats` never gains a guardian entry | unit |
| `guardian-despawn-on-conclude` | `concludeCombat` despawns every guardian silently — no payout, no burst, no events | integration (D4) |
| `guardian-per-active-zone` | 4 alive teams → 2 guardians; 3 alive teams → 1 (zone 0 only); the bye gets none | unit |
| `guardian-hp-by-round` | `hp = round(1450 × (1 + 0.28(R−1)))` for R = 1..6 and for the overflow rounds | unit |

### 12.6 Sim — movement

| id | assertion | category |
|---|---|---|
| `guardian-pathing-mid-slot` | the `z = 0` mid-slot champion attack-moving across the zone **reaches the far side** — no lockup — on all five arenas | **regression (B4)** |
| `guardian-obstacle-radius-invariant` | `transform.radius === synthesized obstacle radius`, and equals the arena's own centre pillar where one exists | unit |
| `guardian-melee-reach` | a melee champion (0.6 / range 1.6) pushed off the body is inside `reachTo` and lands autos | unit |
| `guardian-no-separation-push` | the guardian never moves, and never appears in a `separatePair` call | unit |
| `guardian-obstacle-cleared-on-despawn` | after `endCombatGuardians`, `obstaclesForZone` returns exactly `zone.obstacles` | unit |

### 12.7 Client

| id | assertion | category |
|---|---|---|
| `guardian-pick-clickable` | `enemyUnitsFor` returns the guardian at its own radius; `pickEnemyAt` resolves a click on the body | **regression (F1)** |
| `guardian-pick-not-ally-target` | an ally-targeted cast never resolves onto a guardian | exception |
| `guardian-overhead-bar` | `hasOverheadBar(4)`, `anchorColorFor(4) === "#d9b36c"`, `anchorHeightFor(4) === 2.8` | unit (F4) |
| `guardian-bar-pips` | the bar renders `ceil(1/maxHitPctMaxHp) = 7` segments | unit |
| `guardian-occluder-audit` | the guardian's body AABB passes `occludesPlayArea` against both zones; the light column contributes to no AABB | **regression (#29 / F2)** |
| `guardian-not-in-decorfader` | `DecorFader` never receives a guardian registration | regression (F3) |
| `guardian-telegraph-timing` | the mark VFX appears at the `guardianMark` event and the impact VFX 0.8 s later | unit |
| `guardian-minimap-neutral` | one neutral icon at `zone.center`, never through the champion-portrait path | unit |

### 12.8 Server / integration

| id | assertion | category |
|---|---|---|
| `guardian-snapshot-kind` | `es.kind === ENTITY_KIND.GUARDIAN`, `seatId === -1`, `shield === radius`, `mana` counts down to the next impact | integration |
| `guardian-event-whitelist` | all four `guardian*` events are forwarded on `MSG.EVENT` (source lint, matching `flowers.test.ts:255`) | integration |
| `guardian-config-absent` | `arena-rules.json` with no `guardianTower` block → mechanic off, no entity, existing tests byte-identical | regression |
| `guardian-ai-engages` | a Tier-0 bot above 55% HP with ≥2 living teammates attacks a guardian within 12 u; the flower rule still outranks it when hurt | integration |
| `guardian-bot-match-sweep` | 12 full bot matches: ≥1 guardian killed per match, no round exceeds `combatMaxSec`, and the duel-length p50 stays inside 15–25 s | e2e |
| `guardian-settlement-row` | `guardiansSlain` / `guardianDamage` reach the settlement screen and the rating input | integration |

---

## 13. BUILD ORDER

### 13.1 Must land first — hard blockers

| # | task | why it blocks, concretely |
|---|---|---|
| 1 | **#78 — U5 withdrawal for the STRUCTURE leg** | `docs/content/reconciliation/README.md:258-265` proposes collapsing all 123 `STRUCTURE` branches to their non-structure leg *"because the arena has no towers"*. If that lands, §1.5's T1/T2 content has been deleted and #89 has nothing to attach. **The `PLAYER_NEUTRAL_AGGRESSIVE`/creep leg is unaffected and stands.** This is a bidirectional dependency and it is item 1 for that reason. |
| 2 | **#78 — the `vsStructure` authoring pass** | The 47 ledger rows with a building column, plus the T2 structure-only DoTs, are the *only* faithful content input the feature has. #89 supplies the field; #78 supplies the values. |
| 3 | **#82 — the price ladder and the capstone gate** | §8.4's 150 g is only checkable against a settled `ITEM_TIER_PRICE` / `STAT_TICK_PRICE` / grant table, and #82 owns the decision in Q3. Writing #89's payout before #82 settles means re-deriving it twice. |
| 4 | **#84 — revive circles** | Supplies four things #89 copies verbatim: the absolute-`world.tick` scheduling rule, the `beginCombat*/endCombat*` arming seam, the snapshot float-slot reuse pattern, and the `MovementSystem` per-entity-skip precedent. It also creates the "a revived player last-hits the guardian" interaction (§7.3 row 10), which cannot be tested before it exists. |
| 5 | **Re-run all four adversarial reviews against THIS document** | §11 records that **D5, F5 and B5/B6/B8/B9 were never received**, and that the reviews announced more blockers than arrived. Nine unknown findings, at least four of them self-declared blocking, is not an acceptable state to start writing code in. This is a gate, not a courtesy. |

### 13.2 Can start immediately — no collision with #78/#82/#84

| what | files | why it is safe |
|---|---|---|
| the `guardianTower` config block + `zGuardianTowerConfig` + `guardianRulesFromConfig` | `content/config/arena-rules.json`, `packages/shared/src/content/schema/config.ts`, `packages/shared/src/sim/guardian.ts` | purely additive, mirrors `zFlowerConfig`/`zReviveCircleConfig`, absent block = off |
| `StructureComp` + the `world.structure` store + the `destroy()` line + the two `digest()` lines | `sim/components.ts`, `sim/SimWorld.ts` | new store, new component, no existing behaviour reads them |
| `ENTITY_KIND.GUARDIAN = 4` + `ENTITY_FLAG` bits 128/256 + the snapshot branch | `protocol/schema.ts`, `net/snapshot.ts` | additive enum member; the branch is an `else if` on a store nothing else populates |
| `overheadAnchors` extension + its unit test | `apps/client/src/render/overheadAnchors.ts` | the file is a pure-rules module with its own test, explicitly extracted to be extended |
| the four `sfx` keys + `audio/types.ts` + `combatSfx` fan-out | `content/config/audio-map.json`, `apps/client/src/audio/**` | additive keys; missing files degrade to silence by design |
| `content/models/prop.guardian.json` + `GuardianView` | `content/models/`, `apps/client/src/render/views/` | new doc, new pooled view following `FlowerView` |
| the §5.1 arena-geometry verification | — | **done, in §2 of this document** |

### 13.3 Explicitly NOT touched by #89

| what | owner | why |
|---|---|---|
| `if (hp.hp <= 0) continue;` in `damage.ts`'s packet loop | **#90** | changes champion kill credit, assist windows and `largestSingleHit`; collides with "paid once per enemy" |
| `apps/client/src/ui/WorldAnchorLayer.tsx` | **#33 (LOCKED)** | the 1-line consumer change is already recorded in `docs/todo/flowers.md`; #89 inherits the dependency |
| `content/arenas/*.json` | concurrent | §4.1's synthesized obstacle exists precisely so no arena doc has to change |
| `COMBAT_ENV_KEYS` | **#28** | `vsStructure` is a content scalar, not a global environment multiplier; the env table is closed |
| `rating.ts` weights | **#25** | #89 supplies the counters and states the requirement; #25 owns the grade |

### 13.4 Suggested sequence once the blockers clear

1. Config + component + store + digest + snapshot (§13.2 — all of it, one commit, no behaviour).
2. `deathSystem` killing-blow preference (§7.2) **with #90's sign-off**, plus `guardian-lasthit-*`.
3. `mitigate()` structure fallback + `vsStructureOf` + the `maxHitPctMaxHp` clamp, plus §12.2.
4. `movementSystem` — `obstaclesForZone` + the separation skip, plus §12.6. **Ship this before the
   guardian is ever spawned in a real match**, or every playtest reports a movement bug.
5. `guardianSystem` — wake/sleep, threat, marks, volley — plus §12.3.
6. Payout + `鎮守之力` + `matchStats`, plus §12.4.
7. `MatchController` arming/teardown + AI, plus §12.5 and §12.8.
8. Client: picking, bar, telegraph, minimap, VFX/SFX, plus §12.7.
9. 12-match bot sweep (`guardian-bot-match-sweep`); re-derive `volleyDamageBase` against the measured
   result before any human playtest.

---

## 14. Open questions — **ALL SIX RESOLVED 2026-07-22**

> ### ✅ DECIDED — build against these
>
> **Q4 · IT IS A 樹人 (treant), and it keeps the name 守護塔.** User's answer, and it
> is better than either option offered: 「可以叫守護塔(樹人) 但實際只比人高一倍」.
>
> This dissolves the §9.1 problem rather than compromising on it. A stone tower short
> enough to obey #29 was going to look like a plinth wearing a tower's name; a **living
> tree** at that height looks like exactly what it is. It also lands the feature back in
> its own source world — Warcraft 3's tower unit for the Night Elves IS a tree
> (Ancient Protector), so 守護塔 = 樹人 is faithful, not a workaround.
>
> **HEIGHT IS A CONSTRAINT, NOT A GUESS.** 「只比人高一倍」 = about twice hero height.
> Heroes render normalised to 1.7 u, so the target is **~3.4 u** — which is ABOVE the
> 2.4 u plinth §9.1 proposed and above task #29's prop cap. That must be *verified*, not
> assumed: re-run #29's 35-ray sweep with the treant at `zone.center` at the intended
> height and find the tallest silhouette that still passes. If 3.4 u fails, options in
> order: shape the silhouette so the mass is low and the crown is sparse (a tree can be
> mostly canopy — rays pass through gaps that a solid stone shaft blocks), then the
> fade-management path the arena already uses for 4 occluders in `arena.dota`, then
> reduce the height. Report the number that actually passed.
>
> **Q1 · Instant full HP&MP.** User's answer. The literal reading of 滿 HP&MP, and the
> bigger moment. The accepted consequence is on the record: for a few seconds after the
> last hit that player is close to unkillable and the fight tilts hard. §8.2's pricing —
> the winner has already spent that bar surviving the volley — is what keeps this from
> being a pure windfall, so if instant restore plays as oppressive, the fix is the volley
> pricing, not a stealth nerf back to a fill.
>
> **Q3 · 300 g, AND #82 moves the capstone gate.** Decided here, taking §14 Q3's own
> third option because it is strictly better than either headline choice.
>
> 300 g is the satisfying number — it buys a whole item and equals `ITEM_TIER_PRICE.SIMPLE`
> — but at 300 g the 20-tick capstone slides to shop 5, and with #90's kill bounty as well
> to shop 4, which breaks the user's own 「大約是第五場之後」. Rather than shrink the reward
> to protect a promise, **move the gate**: `statStacks >= 20 && round >= 6` in #82. That
> makes 「第五場之後」 hold against *any* variable income — this tower, #90's bounties, a
> lucky draft — instead of holding only under the one income model it was computed against.
> Costs #82 one line. **#82 must be told; it is mid-implementation.**
>
> **Q2 · Transcribe 龍破斬's `建築物損壞因子 = 0` verbatim, and the other eleven 0-rows with it.**
> Decided on precedent: the standing rule on this project is that a verified value from the
> map beats a plausibility argument, and that when the source and our intuition disagree we
> raise the guard knowingly rather than quietly rescaling the content. The value is in
> `war3map.w3a` — the author's own file — not merely in Blizzard's SLK. Transcribing is the
> faithful act; inventing a non-zero because zero feels wrong is not. It also independently
> kills the spawn-sniping strategy (§11 D3), which is a free win. **This is one line to
> revert** if 莉娜 being unable to siege plays badly, and the spec should say so where the
> value is set.
>
> **Q5 · Zone-local announce only.** Consistent with #67, which is scoping the minimap to
> the player's own duel zone precisely because the other 3v3 is noise you cannot act on. A
> global call-out about a heal and a buff happening to someone in a fight you are not in is
> exactly that noise, however good the announcer line would sound. It surfaces in the
> settlement instead, where the other zone can actually read it.
>
> **Q6 · No respawn.** As specified in §8.5, and the snowball review is the reason: a respawn
> would only fire in the <10% of rounds that run past 45 s, and those are the attrition
> rounds already most likely to be decided by a lead compounding. Concentrating a second
> payout exactly there is the one place the reviews said it hurts most.

---

### The original framing, kept for the reasoning

Each of these is a decision the user owns because it trades one thing the user asked for against
another. None is a request for permission.

**Q1 — 滿 HP&MP: instant, or a 3-second fill?**
As specified it is instant, because §8.2 prices the volley so that the winner has already spent that
bar. *Instant* is the literal reading of 滿 HP&MP and it is the bigger moment — the bar snaps full,
the crowd goes up. *Over 3 s* (the revive-channel unit) reaches the same end state but gives the
enemy team three seconds to burst the winner down and make the reward contested rather than banked.
**Consequence of instant:** the moment the last hit lands, that player is unkillable-adjacent for the
next few seconds and the fight tilts hard. **Consequence of 3 s:** the reward can be *denied* after
it is earned, which some players will read as the game taking back what it gave.

**Q2 — 龍破斬's 建築物損壞因子 = 0: authored intent, or importer noise?**
The w3a says the map's biggest ground nuke does **zero** damage to buildings, and the #78 ledger
annotates it "(in w3a, never read)". Transcribing it verbatim (§1.5 T1) is the faithful move and it
independently kills the spawn-sniping strategy (§11 D3). **If it is authored intent:** 莉娜 is
canonically a champion who cannot siege, which is a real identity and a real counterpick. **If it is
Blizzard SLK noise the author never touched:** transcribing it invents a nerf the author never wrote,
on a hero with no 破塔 tag to justify it. The same question applies to the other eleven 0-valued rows.
**Either answer is defensible; #89 needs to know which, because it decides whether §1.5 T1 is
"transcription" or "a judgement call in transcription's clothing".**

**Q3 — 150 g or 300 g?**
As specified, **150 g** = `GOLD_REWARDS.kill`, on the argument that slaying the guardian should be
worth one champion kill. **300 g** = `GOLD_REWARDS.roundWin` = `ITEM_TIER_PRICE.SIMPLE`, which is the
more *satisfying* number (it buys a whole item) and is what the pre-critique design used.
**Consequence of 300 g, measured:** the 20-tick capstone lands at **shop 5 instead of shop 6** —
even at a 50% capture rate — and with #90's kill bounty as well, at **shop 4**. 「大約是第五場之後」
survives 300 g; it does not survive 300 g *plus* #90. **Consequence of 150 g:** the reward may read
as small next to a full HP restore and a 25 s buff, and 額外金幣 becomes the least interesting third
of the prize. **A third option exists:** keep 300 g and move the capstone gate to
`statStacks >= 20 && round >= 6` in #82, which makes the promise hold against *any* variable income
including kills. That is the most robust answer and it costs #82 one line.

**Q4 — 守護塔 or 守護石碑?**
Task #29 makes a literal tall tower illegal at `zone.center` (§9.1: at 6.9 u it hides the entire north
half of the zone). The compliant entity is a 2.4 u plinth with a light column. **Keep the name 守護塔:**
the user's word, the task's word, and players will read the light column as a tower even though the
geometry is a plinth. **Rename to 守護石碑 / 守護之柱:** the name matches what is on screen, and nobody
ever asks "why is the tower two metres tall". The art is identical either way; this is purely what
the HUD, the announcer VO and the settlement row call it.

**Q5 — should the guardian's death be announced to the other duel zone?**
The two 3v3s are independent and, per #67, players should arguably not even see the other zone's
minimap. But 「A 隊的某某把守護塔打死了」 is a great announcer beat and the map already has an
announcer-VO pipeline (#34/#40). **Announce globally:** more drama, and it tells the other zone that
someone over there just got a full heal and a buff — information they cannot act on. **Zone-local
only:** consistent with #67 and with the "two independent duels" contract, but the biggest neutral
event in the round passes silently for half the lobby.

**Q6 — one guardian per round, or does it respawn?**
As specified it does **not** respawn (§8.5): one payout per zone per round, at most six per match.
**If it respawned** (say 45 s after death, in the fraction of rounds that run that long — p90 is
30.83 s, so this would fire in under 10% of rounds), the objective would stay live in long
grind-out rounds instead of vanishing after the first contest, and the losers of the first race
would get a second one. **Consequence of respawning:** two payouts in the longest rounds, which are
also the rounds already most likely to be decided by attrition — i.e. the gold and the buff would
concentrate exactly where the snowball review said they hurt most.

---

## 15. Per-arena faces (task #105) — one mechanic, five silhouettes

The mechanic in §§1–14 is arena-agnostic: HP, mitigation, the volley, the reward, the neutrality
contract are identical everywhere. **Only the body changes.** #105 gives the guardian a per-arena
identity so 守護塔 reads as the arena it stands in — 樹人 in the grove, 石頭人 in stone, a bone giant
in the ossuary — without touching a single tunable in §5. A face is a `.glb` + a scale + a swept
height, nothing more.

**Height is not one number.** §14 Q4 fixed the *design intent* at ~3.4 u (「只比人高一倍」), and Q4's
own instruction is to **verify per silhouette, not assume**: re-run task #29's 35-ray sweep with the
real body at `zone.center` and report the height that actually passed. That number differs by
silhouette, and *that difference is the finding* — a canopy and a solid mass at the same height
occlude completely differently, because rays pass through the gaps in the first and nothing in the
second. Each face below carries its own swept ceiling, measured, not guessed.

### 15.1 arena.skeleton (`groundStyle: stone`) — 拼裝骷髏 / bone giant — **RESOLVED**

- **Model:** `content/assets/models/props/guardian_skeleton.glb` — KayKit Character Pack Skeletons 1.0,
  **CC0** (verbatim `LICENSE.txt`: *"Creative Commons Zero, CC0 … free to use in personal, educational
  and commercial projects"*; crediting Kay Lousberg is courtesy, not required). **No new
  mandatory-attribution obligation** — the CC-BY login dragon stays the only required credit (§9.3
  unchanged). 5,288 tris (2.9% of the 182,610-tri budget), one 1,024² gradient atlas (17 KB), 41-bone
  rig, 15 trimmed clips.
- **Ship scale 1.57× → 3.40 u** (native skinned height 2.1661 u), i.e. exactly §14 Q4's ~3.4 u,
  twice the 1.7 u hero.
- **Reads as 骨巨人.** Nine named meshes: exposed **ribcage** (`Body`, 1,833 v) as a hollow chest, bare
  **skull** (`Head`, 595 v) + hinged **jaw**, hollow **eye sockets** on a separate emissive `Glow`
  material the torch ring backlights, tattered **cloak**, two bone **arms**, two femur **legs**. Wake
  and death are **baked, not scripted**: `Skeletons_Awaken_Floor_Long` lifts the hips from below the
  floor plane (y −0.174 → +0.613) so it reassembles itself off the ground; `Death_C_Skeletons` +
  `Death_C_Pose` drop it into a settled heap to twitch on. `root` translation is 0 in every clip — it
  never drifts off `zone.center`.

**The crown split is a mesh-name filter, not modelling.** At 3.40 u every mesh except the skull and
eye glow already sits under `SIGHTLINE_HEIGHT_CAP` 2.4 u: **ribcage top 2.236 · jaw 2.380 · cloak
2.059 · legs 0.831**, while **skull 2.062→3.400 · eyes 2.476→2.675** ride above. So the only occluding
mass above the cap is a lone skull on a thin neck — the sparse top §14 asks for, for free.

**Sweep — task #29's 35-ray audit, run per-mesh (gaps count) at `zone.center`, both zones**
(`apps/client/scripts/occluder-sweep.ts` math verbatim; camera eye 8.192 u, standoff 5.736 u, closest
dolly = default, grid 0.25 u, contact band 0.693 u):

| guardian height | standable pts | occluders | worst ray-block | contact-hides | **failures** | verdict |
|---|---|---|---|---|---|---|
| 3.00 u | 52,924 | 35 | 10/35 | 0 | 0 | PASS |
| **3.40 u (ship)** | **52,924** | **35** | **10/35** | **0** | **0** | **PASS** |
| 3.80 u | 52,924 | 35 | 14/35 | 0 | 0 | PASS |
| 4.00 u | 52,924 | 35 | 21/35 | 0 | 0 | PASS |
| **4.20 u (ceiling)** | 52,924 | 35 | 28/35 | 0 | 0 | PASS |
| 4.40 u | 52,924 | 35 | 35/35 | 0 | **8** | FAIL (skull) |

At the shipped 3.40 u the guardian never blocks more than **10 of 35 rays** for any of 52,924 points
per zone, and no point is a full hide — a hero behind it always reads as a hero behind it. Result is
byte-identical whether the guardian **replaces** the existing centre pillar or stands **co-located**
with it (35 vs 37 occluders): a ≤2.4 u capped pillar can only ever contact-hide, exactly #29's
guarantee, so placement is robust either way.

**The finding — silhouette, not height, sets the ceiling.** The *same* skeleton modelled as **one
solid box** (a golem of identical footprint) first fails at **4.00 u**; modelled as **the real sparse
bones** it holds to **4.20 u**. A hollow ribcage plus a lone skull lets rays through where a solid
shaft blocks them — so this face sits with the canopy tree, not the stone golem, and 3.40 u ships with
**0.80 u of headroom** it would not have as a solid.

**No content edit.** `arena.skeleton.json` is untouched: the arena schema is `.strict()` and the
guardian is a per-round runtime entity (§3, #89), not `decor`. The centre pillar stays as legitimate
arena geometry for the mechanic-off path; the guardian embodies it in combat (§4.1/§9.2). The face is
recorded here — model + scale 1.57 + swept ceiling 4.20 u — for #89 to spawn against
`GUARDIAN_MODEL_KEY` when it wires per-arena models.

> Visual check against #22 (the flower that shipped as an invisible 0.137 u disc because nobody looked
> at it in the actual view): the body was staged in Babylon 7.54.3 at 1.57× under the exact fixed rig,
> and every dimension above was measured through the client's own `LoadAssetContainerAsync` +
> `refreshBoundingInfo(applySkeleton)` path — it is a 3.40 u giant, not a disc. A to-scale elevation +
> the sweep table is published as a private artifact.

### 15.2 arena.dota (`groundStyle: grass`) — 山寨肉山 / 巨獸 — **RESOLVED**

- **Model:** `content/assets/models/guardians/guardian_beast.glb` — Quaternius *Triceratops*, **CC0**
  (model page's own line, verbatim: *"Public Domain (CC0)"*, hyperlinked to the CC0 1.0 deed;
  courtesy credit only, **no new mandatory-attribution obligation** — the CC-BY login dragon stays the
  only required credit, §9.3 unchanged). Recorded in `content/assets/CREDITS.md`. **1,332 tris** (0.7%
  of the 182,610-tri budget), **0 texture bytes** (3 flat-colour `baseColorFactor` materials — the
  mossy-shell/algae recolour is a factor swap, not a texture), 29-bone `skeleton0`, 6 baked clips
  (`Triceratops_Idle` 2.542 s / `_Death` 1.792 s the two the guardian needs, cheapest of the set).
- **Ship scale 0.2693 → top 2.400 u** (native skinned height 8.8714 u), broadside; the sourcing's
  **0.2705** (feet-on-ground bbox height 2.40 u, idle-bob peak 2.41 u) also passes 0-fail and is
  equivalent. **This is the cap, not §14 Q4's 3.4 u — and that gap is the finding (below).**
- **Reads as 巨獸.** A hunched, heavy-shouldered knuckle-walking quadruped: broad **frill** + two brow
  horns + nose horn are the crown-layer read, the shoulders and mossy shell are the mass, a tapering
  tail behind. Wake and death are **baked**: `Triceratops_Idle` bobs it in place (never drifts off
  `zone.center`), `Triceratops_Death` (1.79 s) collapses it — dressed with existing river-spray VFX
  for the 沉回河裡 beat. Native bbox `5.8482 × 8.8714 × 20.9815`, `minY −0.112`, long axis Z,
  measured through the client's own path (Babylon 7.54.3 `NullEngine`,
  `refreshBoundingInfo({applySkeleton:true})`).

**There is no crown split — the whole silhouette is SOLID.** Unlike the skeleton's ribcage-plus-skull,
the beast is dense mass all the way up, so §9.2's ≤ 2.4 u cap binds it strictly and there is **no
sparse top to spend above the cap**. The "towering" verticality is §9.2's job — the additive emissive
column / wake-flare that enters no AABB — **never the body**, which is exactly what the sweep prices.

**Sweep — task #29's 35-ray audit at `zone.center`, both zones** (`apps/client/scripts/occluder-sweep.ts`
math verbatim; eye 8.1915 u, standoff 5.7358 u, closest = default dolly, contact band
`fullHideReach(2.4) = 0.693 u`). The beast is added **UNSQUASHED** (a spawned entity is not decor;
`dressArena`'s squash never touches it, and squashing 巨獸 to a 2.4 u pancake would delete the
silhouette), with its own §4 body-obstacle (`radius 2.5` → heroes clamped ≥ 3.1 u from centre). The
harness first reproduces the shipped `arena.dota` baseline exactly — 52,220 pts / 74 occ / 48
contact-hides / worst-gap 0.500 u / 0 FAIL — as its fidelity check, then adds the beast:

| guardian top | orient | standable pts | occluders | worst ray-block | contact-hides (worst gap) | **failures** | verdict |
|---|---|---|---|---|---|---|---|
| **2.400 u (ship)** | broadside | **51,264** | **76** | **35/35** | **48 (0.500 u)** | **0** | **PASS** |
| 2.410 u (0.2705) | broadside | 51,264 | 76 | 35/35 | 48 (0.500 u) | 0 | PASS |
| **2.495 u (ceiling)** | broadside | 51,264 | 76 | 35/35 | 68 (0.681 u) | 0 | PASS |
| 2.539 u | broadside | 51,264 | 76 | 35/35 | 90 (0.717 u) | **12** | FAIL |
| 2.486 u (ceiling) | deep | 51,264 | 76 | 35/35 | 240 (0.659 u) | 0 | PASS |
| 2.495 u | deep | 51,264 | 76 | 35/35 | 240 (0.700 u) | **30** | FAIL |

(The official 0.25 u grid **aliases** near the edge — its rows land on `z = …, 3.10, 3.35, …`, stepping
over the thin failure sliver a solid mass opens just north of centre — so the ceiling rows were pinned
on a 0.05 u local grid.) At the shipped 2.40 u every full-hide is a **contact-hide** (hero pressed
against the body, gap ≤ 0.693 u), which is #29's accepted case; **zero real failures.** Standable count
drops 956 from baseline = the beast's own 3.1 u no-stand interior.

**The finding — silhouette, not height, sets the ceiling, and a solid mass tops out at the cap.** The
solid 巨獸's tallest passing top is **≈ 2.49 u** (broadside 2.50, deep 2.49) — **NOT the 3.4 u the
sparse 樹人 (§14 Q4) and 骨巨人 (§15.1) reach.** Same `zone.center`, same 35-ray sweep, same mechanic;
a **0.9 u** difference driven purely by silhouette density. Above 2.4 u `fullHideReach` grows past the
contact band and a hero standing *clear* is fully hidden — unless the mass up there is sparse enough
for rays to pass (canopy gaps; a ribcage; a skull on a thin neck). The beast has no such escape, so
its only headroom (2.40 → ~2.49 u) is bought entirely by its own 3.1 u body-obstacle and depends on
`radius 2.5` staying 2.5 (§5.2) — reported, not spent. **Ship at the cap; put the height in the
emissive column.** *(Orientation: broadside `rotQuarter 1`/`3` reads best AND sweeps tallest; deep —
facing the camera, Roshan-style — also passes at ship height and is an acceptable alternate; the
rump-to-camera facing is rejected, the horns point away and it reads as a lump.)*

**No content edit.** `arena.dota.json` is untouched (§13.3): the guardian is a per-round runtime
entity, not `decor` (squashing it as decor would both flatten the silhouette and give the sweep a
false pass). The face is recorded here — model + scale 0.2693 + broadside + swept ceiling 2.49 u — for
#89 to spawn against `GUARDIAN_MODEL_KEY` when it wires per-arena models.

> Visual check against #22 (the flower that shipped as an invisible 0.137 u disc because nobody looked
> at it in the actual view): the beast was rendered under the exact fixed rig (pitch 55° / dolly 10)
> at ship scale beside two 1.7 u hero references — it stands ~1.4× hero height with a legible
> horned-frill crown and heavy quadruped mass. It is a monster, not a disc.

### 15.3 The remaining face — OPEN

`arena.castle` (巨獸人, solid) still needs its own model, scale and
**its own sweep**. (`arena.godie` — 樹人 sakura treant — is now **RESOLVED in §15.5**;
`arena.colosseum` — 石膏鬥士 / 石頭人 — is **RESOLVED in §15.4**; per
`content/assets/CREDITS.md` the 石頭人 face belongs to **colosseum**, not castle — grey stone reads
against tan sand — superseding the tentative slotting once written on this line.) A **wide** solid
face will not inherit the skeleton's 4.2 u ceiling — as §15.2 measured, a wide solid mass tops out at
~2.4–2.5 u — and must either be shaped so the mass stays low and the top stays sparse (a real canopy),
or ship at the cap with the height carried by §9.2's emissive column. **But §15.4 shows this is a
WIDTH rule, not a solidity rule:** a *thin* solid (the gladiator, 0.76 u deep, tapering to a crest)
passed to 5.45 u. Same procedure: stage at `zone.center`, run `occluder-sweep.ts`'s per-silhouette
audit **unsquashed**, report the height that passed, never accept a failing sweep.

**Directory convention to reconcile:** §15.1 landed at `models/props/guardian_skeleton.glb`, §15.2 at
`models/guardians/guardian_beast.glb` — two #105 sub-workflows picked different subdirs. Left as-is (no
restructure; `models/**` is being measured by #99), flagged for the #105 umbrella to unify before
`GuardianView` hard-codes a path scheme.

### 15.4 arena.colosseum (`groundStyle: sand`) — 石膏鬥士 (石頭人) — **RESOLVED**

- **Model:** `content/assets/models/guardians/guardian_stone.glb` — mastjie *"Warrior"* (mesh
  `warr_03`), **CC0** (model page verbatim *"Public Domain (CC0)"*, embedded record `"license":"CC0
  1.0"`; courtesy credit only, **no new mandatory-attribution obligation** — the CC-BY login dragon
  stays the only required credit, §9.3 unchanged). Recorded in `content/assets/CREDITS.md`. **4,300
  tris** (2.4 % of the 182,610-tri budget), **97 texture bytes** (one flat-palette PNG; the
  plaster/marble recolour is a #49-pipeline material swap, not a texture author). **No rig, 0 clips** —
  wake/death are §9.2's PROCEDURAL states (a statue stands dead-still, then hairline-cracks light up
  and it shatters to `rock.glb` chalk rubble), so a rigless body is faithful here, not a compromise.
- **Ship scale 147.123 → top 3.40 u** (native height 0.023110 u), exactly §14 Q4's ~3.4 u / the
  skeleton's height, twice the 1.7 u hero. **Unlike the beast (§15.2), the stone body reaches the full
  design-intent height with room to spare — it does NOT have to ship at the 2.4 u cap.** The sourcing's
  2.4 u (scale 103.851) also passes and composes with §9.2's cap-plus-column plan if the umbrella
  prefers uniformity; 3.4 u is recommended because this silhouette earns it.
- **Reads as 石頭人.** A low-poly Roman gladiator: crested **galea** helm (the vertical plume = the
  crown-layer read), broad shoulders, bracered arms, belted skirt, solid legs on a plinth base —
  **thin front-to-back** (0.76 u deep at 2.4 u). Staged and rendered under the exact fixed rig
  (pitch 55° / dolly 10), plaster-grey on sand: it is unmistakably a pale gladiator statue, grey stone
  reading AGAINST the tan sand — the exact legibility argument for putting 石頭人 on colosseum. (Honest
  gap, per CREDITS: symmetric standing pose, no separate raised-sword mesh — the crest carries the
  crown; ships flesh-toned, plaster tint is a required material step.)

**The crown split falls out of the mesh for free.** The occluding mass tapers with height — the wide
belt/shoulders sit at 45–60 % of height and the top 20 % is a thin helm crest (X-span 5–19 % of full
width). So at hero-head height the cross-section presented to the fixed camera is either the tapering
upper torso or the thin crest, and rays escape beside it.

**Sweep — task #29's 35-ray audit at `zone.center`, both zones**, real triangles loaded through the
client's own Babylon 7.54.3 path and added **UNSQUASHED** (a spawned entity is not decor). The harness
(`apps/client/scripts/guardian-occluder-sweep.mjs`) reproduces the shipped `arena.colosseum` baseline
exactly — 43,078 pts / 66 occ / 12 contact-hides / worst-gap 0.260 u / 0 FAIL — then adds the guardian.
The "35/35 worst ray-block" and "12 contact-hides" below are the arena's own PILLARS (the #29
baseline); **the guardian's own contribution is the last column, and it is zero until the ceiling.**

Intrinsic silhouette (collision hugs the visible footprint — worst case, no generous body-obstacle):

| guardian top | standable pts | occluders | worst ray-block | contact-hides (arena) | **guardian full-hides** | verdict |
|---|---|---|---|---|---|---|
| 2.40 u | 42,902 | 67 | 35/35 | 12 (0.260 u) | **0** | PASS |
| **3.40 u (ship)** | **42,806** | **67** | **35/35** | **12 (0.260 u)** | **0** | **PASS** |
| **5.45 u (ceiling)** | 42,560 | 67 | 35/35 | 12 (0.260 u) | **0** | PASS |
| 5.50 u | 42,556 | 67 | 35/35 | 12 (0.260 u) | **2** | FAIL |

Shipped mechanic (§4.1 body-obstacle `radius 2.5` → heroes clamped ≥ 3.1 u from centre): identical
0-fail at 2.40 / 3.40 u, and the ceiling rises to **5.55 u** (first fail 6.47 u). Either way the
gladiator never fully hides a hero — not even a contact-hide — anywhere below ~5.4 u.

**The finding — it is a WIDTH rule, not a solidity rule; §15.2's dichotomy is refined here.** §15.2
measured a *solid* beast topping out at ~2.49 u and read it as "a solid mass tops out at the cap." But
the beast is a *wide* quadruped (broadside ≈ 2.5–5.8 u). The gladiator is equally solid yet passes to
**5.45 u** — because it is **thin front-to-back and tapers to a crest**, so from the fixed south camera
its shadow is narrow and rays escape beside it at the hero's projected head height. The determinant is
**the width of the occluding cross-section at hero-head height and the front-to-back depth**, not
solid-vs-sparse. A thin biped is as forgiving as a canopy; a wide mass is not. So 石頭人 ships at the
full 3.4 u design intent with **~2.05 u** of headroom below its worst-case ceiling — no reshaping, no
fade-management, no forced retreat to the cap.

**No content edit.** `arena.colosseum.json` is untouched: the guardian is a per-round runtime entity,
not `decor` (squashing it as decor would flatten the silhouette and give the sweep a false pass; the
arena schema is `.strict()`). The face is recorded here — model + scale 147.123 + swept ceiling 5.45 u
— for #89 to spawn against `GUARDIAN_MODEL_KEY`. **Directory:** landed at
`models/guardians/guardian_stone.glb` (with the beast), the convention §15.3 flags for the umbrella to
unify.

> Visual check against #22 (the flower that shipped as an invisible 0.137 u disc because nobody looked
> at it in the actual view): the body was rendered under the exact fixed rig at ship scale, plaster-grey
> on sand — a crested-helm gladiator with legible shoulders, belt and legs, ~2× hero height. It is a
> statue, not a disc. (`apps/client/scripts/guardian-render-probe.mjs`.)

### 15.5 arena.godie (`groundStyle: dirt`) — 樹人 / sakura treant — **RESOLVED**

The §14 Q4 face itself: 守護塔(樹人), the arena's own grove made flesh. Built as a **3-part composite**,
staged at `zone.center` (both zones, `(±40, 0)`), swept with `occluder-sweep.ts`'s math verbatim.

- **Body (solid) — two CC0 kitbash pieces, vendored byte-unchanged:**
  `content/assets/models/guardians/guardian_treant_trunk.glb` (KayKit Halloween "Dead tree", **CC0**;
  256 tris, one 256² atlas 15,093 B, native `2.302 × 5.066 × 1.377`) as the trunk +
  `content/assets/models/guardians/guardian_treant_roots.glb` (Quaternius "Tree Stump with Moss",
  **CC0** — checked per-page, *not* assumed from the author, since Quaternius is not uniformly CC0;
  232 tris, 0 texture bytes, native `1.360 × 0.622 × 1.031`) as the root-claws. Provenance in
  `content/assets/CREDITS.md`; **no new mandatory-attribution obligation** — the CC-BY login dragon
  stays the only required credit (§9.3 unchanged).
- **Crown — zero new asset.** The crown is `_primitive1` of the arena's **own** `japanesecherry.glb`
  (the map author's 自製櫻花樹, ships as OURS) **re-materialised** above the trunk — 54 alpha-BLEND
  blossom tris, native `X[−9.83, 8.17] Y[7.94, 18.78]`. It reuses geometry the arena already loads for
  decor: **0 added tris, 0 added texture, 0 new licence.** Total *new* cost = the 488-tri body + one
  15 KB atlas (0.27 % of the 182,610-tri budget).
- **Ship scale k = 0.379 → 3.20 u** on a fixed stack (trunk = 0.60 of total height, root pad at the
  base, crown top at 100 %), i.e. **1.88 × the 1.7 u hero** — 「只比人高一倍」, verified not assumed.
- **Reads as 樹人.** Root-claws gripping the dirt, a narrow bark trunk, a broad pink sakura crown; at
  the fixed rig (55° pitch, closest dolly) beside a 1.7 u hero it is unmistakably a flowering tree
  ~2 × hero height (elevation + plan projected through the exact camera). **Wake / death are procedural
  VFX on this geometry** — canopy shiver + petal drop / trunk split + petal storm — **not baked clips**,
  which is why the body meshes need no rig.

**The crown is the entire occlusion budget — the trunk is free.** A bare trunk+roots (crown removed)
blocks at most **2 / 35 rays at 3.20 u and still only 4 / 35 at 5.0 u**: the solid core is a ~0.4–0.5 u
shaft, far too narrow to cover the 1.0 u hero span, so it can never fully hide. **Every full-hide the
treant produces comes from the crown**, which is what the sweep prices.

**Sweep — task #29's 35-ray audit at `zone.center`, both zones, guardian added UNSQUASHED**
(`apps/client/scripts/occluder-sweep.ts` math verbatim, ported and cross-checked against it; eye
8.1915 u, standoff 5.7358 u, closest = default dolly, contact band `fullHideReach(2.4) = 0.693 u`). The
harness first reproduces the shipped `arena.godie` baseline **byte-for-byte** — **51,256 pts / 107 occ /
316 contact-hides / worst-gap 0.600 u / 0 FAIL** — as its fidelity check, then adds the guardian as
**real triangle geometry** (an AABB would model a see-through canopy as a solid wall — the whole point
of Q4 is that it is not):

| guardian height | silhouette model | standable pts | worst ray-block | contact-hides (worst gap) | **failures** | verdict |
|---|---|---|---|---|---|---|
| **3.20 u (ship)** | treant, cherry crown | **51,090** | 35/35 | 328 (**0.632 u**) | **0** | **PASS** |
| **3.26 u (ceiling)** | treant, cherry crown | — | 35/35 | — (0.659 u) | **0** | **PASS** |
| 3.28 u | treant, cherry crown | — | 35/35 | — (0.702 u) | **4** | FAIL (canopy) |
| 3.40 u (Q4 intent) | treant, cherry crown | — | 35/35 | — (0.756 u) | **34** | FAIL (canopy) |
| 2.45 u (ceiling) | **solid box** (golem) | — | 35/35 | — (0.618 u) | **0** | PASS |
| 2.50 u | **solid box** (golem) | — | 35/35 | — (0.699 u) | **50** | FAIL |

**Grid aliasing is real here — the ceilings are pinned on a 0.05 u local grid, not the official
0.25 u.** On the 0.25 u grid the treant *falsely passes* at 3.40 u (its 35/35 full-hide ring at
z ≈ 2.0 u lands between grid rows); the 0.05 u re-check over the north sliver exposes 34 real failures.
This is the §15.2 / #22 lesson reconfirmed: **any silhouette that ever reaches 35/35 must be pinned
fine.** The shipped 3.20 u passes on **both** grids (0.25 u full-disc *and* 0.05 u sliver, worst gap
0.632 u — 0.061 u under the band), so it is a robust pass, not an aliased one.

**The finding — a canopy buys +0.81 u over the same-width solid mass, but a *painted* canopy is not a
*hollow* one, and §15.4's width rule still binds.** Same `zone.center`, same 35-ray sweep, same
mechanic: the wide sakura crown holds to **3.26 u**; the *same-footprint* **solid box tops out at
2.45 u** (which independently reproduces §15.2's wide 巨獸 ≈ 2.49 u). That **0.81 u** is the canopy
contribution Q4 predicted. But it does **not** reach §15.1's 3.40–4.20 u or §15.4's 5.45 u, and the two
reasons compound: **(1) width** — this crown is a *wide* opaque cross-section (~2.9 u), so §15.4's
width rule holds it down exactly as it holds the wide beast, where §15.4's *thin* gladiator and §15.1's
narrow-necked skull escape; **(2) alpha, not holes** — the crown reaches **35/35** (a continuous
shell), unlike the skeleton's ≤ 10/35 ribcage; a real sakura's see-through lives in **texture alpha**,
which no triangle raycast (mine or #29's) can credit. So **3.26 u is a conservative floor** and the
in-engine textured crown hides strictly less — margin deliberately **not banked**. Reshaping the opaque
crown does not recover 3.40 u (a narrower crown concentrates a *denser* wall; overlapping "blossom
puffs" stack in depth and sweep *worse* — from a 55° oblique the gaps close). **To ship the literal
3.40 u** the crown must be modelled as genuinely open mesh — well-separated blossom clusters that never
reach 35/35, like the bones — or carried by the §9.2 / `arena.dota` fade path. **Recommendation: ship
3.20 u on provable geometry today;** it is faithful to 「只比人高一倍」 and needs neither a bespoke crown
lattice nor a fade.

**No content edit.** `arena.godie.json` is untouched: the guardian is a per-round runtime entity, not
`decor` (squashing it as decor would flatten the silhouette and hand the sweep a false pass). The face
is recorded here — trunk+roots+re-materialised crown, scale 0.379, swept ceiling 3.26 u, ship 3.20 u —
for #89 to spawn against `GUARDIAN_MODEL_KEY`. Directory `models/guardians/` (with the beast §15.2 and
stone §15.4), the convention §15.3 flags for the umbrella to unify.

> Visual check against #22 (the flower that shipped as an invisible 0.137 u disc because nobody looked
> at it in the actual view): the composite was projected through the exact fixed rig at 3.20 u beside a
> 1.7 u hero reference — root pad, bark trunk, sakura crown, ~1.9 × hero. It is a tree, not a disc.
