/**
 * GH#250 — 克勞德 (godie-hart) 01-01 凶斬 / 01-04 超究武神霸斬, rebuilt from
 * war3map.j and proved BEHAVIOURALLY.
 *
 * owner 2026-08-01 playtest:
 *   「克勞德 凶斬應該會飛過去才對」
 *   「克勞德 超究武神霸斬完全沒用(JASS沒實作)」
 *
 * The second half of that diagnosis is half right and the correction matters,
 * because it decides where the fix goes. The JASS **is** implemented and it
 * **is** enabled: `Trig_SuperFF7_Actions` is a complete 7-hit routine and
 * `Trig_init_Love_*` calls `EnableTrigger(gg_trg_SuperFF7)` on the branch that
 * fires when 克勞德 is picked. What was never ported is GGD's side — the doc
 * shipped ONE instant damage packet plus a 3 s root, i.e. exactly what
 * `docs/content/reconciliation/abilities.md` records for `godie-hart.r` as
 * 「JASS script not ported」.
 *
 * ── WHAT THE JASS ACTUALLY SAYS (quoted, so this file can be checked) ───────
 *
 * `Trig_XFight_Actions` (凶斬 A072, and its EX twin 囧斬 A0AZ). Both branches
 * end with the SAME line, and it is the whole of owner's 「飛過去」:
 *
 *     call SetUnitPositionLoc( GetTriggerUnit(), GetUnitLoc(GetSpellTargetUnit()) )
 *
 * — a SAME-FRAME reposition of the CASTER onto the target. No arc, no collision,
 * no travel. `A072` takes the `else` branch, which sleeps 0.30 s first and deals
 * no trigger damage of its own (the 150/220/290/360 comes from the `ANsb` object
 * row, already shipped).
 *
 * `Trig_SuperFF7_Actions` (超究武神霸斬 A077, and its EX twin A0B1):
 *
 *     set udg_SuperFF7 = ( 49.00 + ( I2R(GetUnitAbilityLevelSwapped('A077', udg_FF7_CloudUnit)) * 50.00 ) )
 *     set udg_SupI = 1
 *     loop
 *         exitwhen udg_SupI > 7
 *         ...
 *         call TriggerSleepAction( ( 1.00 - ( I2R(udg_SupI) * 0.50 ) ) )
 *         ...
 *         call TriggerSleepAction( ( 1.00 - ( I2R(udg_SupI) * 0.60 ) ) )
 *         if ( Trig_SuperFF7_Func023Func041C() ) then   // udg_SupI >= 7
 *             ... call UnitDamageTargetBJ( …, ( udg_SuperFF7 + ( I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, udg_FF7_CloudUnit, true) * udg_FF7OmniSlashLevel )) * 1.00 ) ), … )
 *         else
 *             call UnitDamageTargetBJ( udg_FF7_CloudUnit, udg_FF7_CastedUnit, udg_SuperFF7, ATTACK_TYPE_HERO, DAMAGE_TYPE_NORMAL )
 *         endif
 *         set udg_SupI = udg_SupI + 1
 *     endloop
 *
 * plus, on both bodies, for the whole loop:
 *     call UnitAddAbilityBJ( 'Avul', udg_FF7_CloudUnit )      // 施法者無敵
 *     call PauseUnitBJ( true, udg_FF7_CloudUnit )             // 施法者不能動
 *     call IssueImmediateOrderBJ( udg_FF7_CastedUnit, "stop" ) // 目標被鎖住
 *
 * So: SEVEN payouts of `49 + 50×rank` (99 / 149 / 199), the seventh carrying an
 * extra `STR × rank`, while the caster is invulnerable AND action-locked and the
 * victim is hard-CC'd. Total 693 / 1043 / 1393 (+STR terms) — the perRank
 * numbers the doc already shipped, which is why only the SHAPE changed.
 *
 * COMBO LENGTH IS DERIVED, NOT INVENTED. The sleeps are `1 − 0.5i` and
 * `1 − 0.6i` and WC3's `TriggerSleepAction` floors at ~0.10 s, so i=1 costs
 * 0.90 s, i=2…6 cost 0.20 s each, and i=7 costs 0.20 s + the finisher's own
 * 0.20+0.60+0.40+0.20 = 1.40 s → 0.90 + 1.00 + 1.60 = **3.50 s**, seven hits,
 * i.e. one every 0.5 s. That is the same flattening `content/ability-templates/
 * tpl-lock-combo.json`'s expander documents for this exact ability
 * (「01-04 超究武神霸斬 uses `sleep 1 - 0.5i`; `dot` has one cadence」).
 *
 * ── NAMED GAP (measured, not hidden) ───────────────────────────────────────
 * The finisher's JASS bonus is `STR × rank`. `Scaling.attrRatios[].coeff`
 * (content/schema/common.ts) is ONE number with no per-rank column, so the
 * shipped doc carries `coeff: 1` and ranks 2 / 3 under-deliver by 1×STR and
 * 2×STR. Everything else is exact. Closing it needs a per-rank coefficient on
 * `attrRatios`, which is a shared-schema change and is deliberately not made
 * from this lane.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility, rankUpAbility } from "./abilities/abilitySystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { TICK_HZ } from "../constants";
import type { CoreAbilitySlot } from "./intents";
import * as V from "./math/vec2";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const WAR3MAP_J = join(HERE, "../../../../tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j");
const Z0 = SKELETON_ARENA.zones[0]!;
/**
 * Test anchor, 14 units "north" of the zone centre. SKELETON_ARENA puts a
 * radius-2.5 pillar ON the centre (and two more at ±9/∓8); spawning there drops
 * both bodies inside an obstacle and the collision relaxation shoves them
 * apart, which would fake a displacement this file is trying to measure.
 */
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
const NO_INTENTS = new Map();

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

let seat = 0;
function mk(world: SimWorld, championId: string, team: number, dx: number, dz = 0): EntityId {
  return spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: { x: P.x + dx, z: P.z + dz },
    zone: 0,
  });
}

/** A fresh world with 克勞德 at the anchor and an enemy 克勞德 `gap` units east. */
function rig(gap: number): { world: SimWorld; cloud: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 250);
  const cloud = mk(world, "godie-hart", 0, 0);
  const foe = mk(world, "godie-hart", 1, gap);
  world.step(NO_INTENTS);
  world.rebuildGrid();
  return { world, cloud, foe };
}

function toRank(world: SimWorld, id: EntityId, slot: CoreAbilitySlot, rank: number): void {
  world.ultGateOverride = true;
  const ab = world.abilities.get(id)!;
  while (ab.slots[slot].rank < rank) {
    ab.unspentPoints = 1;
    expect(rankUpAbility(world, id, slot)).toBe(true);
  }
  world.step(NO_INTENTS);
  world.rebuildGrid();
}

/** Give the caster enough mana that no assertion below can be about the cost. */
function fillMana(world: SimWorld, id: EntityId): void {
  const hp = world.health.get(id)!;
  hp.mana = hp.maxMana = Math.max(hp.maxMana, 1000);
}

cover("gh250-hart-jass-fidelity");

// ───────────────────────────────────────────────────────────────────── JASS
describe("GH#250 — the JASS this port is built from is really there", () => {
  const J = readFileSync(WAR3MAP_J, "utf8");

  // No line numbers on purpose (CLAUDE.md 第三守則: a cited line number rots
  // silently; a cited SOURCE STRING cannot). Each needle is a whole statement,
  // so a re-extraction that changes the map's behaviour fails this file first.
  it.each([
    // 凶斬 — the reposition owner asked for, and the id that selects it
    ["A072 is 凶斬's rawcode", "if ( ( GetSpellAbilityId() == 'A072' ) ) then"],
    [
      "凶斬 puts the CASTER on the TARGET",
      "call SetUnitPositionLoc( GetTriggerUnit(), GetUnitLoc(GetSpellTargetUnit()) )",
    ],
    // 超究武神霸斬 — per-hit damage, the 7-hit loop, the finisher, the two locks
    ["A077 is 超究武神霸斬's rawcode", "if ( ( GetSpellAbilityId() == 'A077' ) ) then"],
    [
      "per-hit damage is 49 + 50 × rank",
      "set udg_SuperFF7 = ( 49.00 + ( I2R(GetUnitAbilityLevelSwapped('A077', udg_FF7_CloudUnit)) * 50.00 ) )",
    ],
    ["the loop runs seven times", "exitwhen udg_SupI > 7"],
    [
      "the finisher branch is hit 7",
      "if ( not ( udg_SupI >= 7 ) ) then",
    ],
    [
      "every non-final hit pays udg_SuperFF7 flat",
      "call UnitDamageTargetBJ( udg_FF7_CloudUnit, udg_FF7_CastedUnit, udg_SuperFF7, ATTACK_TYPE_HERO, DAMAGE_TYPE_NORMAL )",
    ],
    ["the caster is made invulnerable", "call UnitAddAbilityBJ( 'Avul', udg_FF7_CloudUnit )"],
    ["the caster is paused", "call PauseUnitBJ( true, udg_FF7_CloudUnit )"],
    ["the victim is stopped", 'call IssueImmediateOrderBJ( udg_FF7_CastedUnit, "stop" )'],
    // ...and the trigger is switched ON when 克勞德 is picked, which is the half
    // of owner's 「JASS沒實作」 that is measurably false.
    ["SuperFF7 is enabled at pick time", "call EnableTrigger( gg_trg_SuperFF7 )"],
    ["XFight is enabled at pick time", "call EnableTrigger( gg_trg_XFight )"],
  ])("war3map.j contains: %s", (_label, needle) => {
    expect(J).toContain(needle);
  });
});


/**
 * ⭐「等到這一支解析完」的 tick 數 —— **從技能自己的 castTimeSec 推**，
 * ⛔ 不是一個寫死的數字。
 *
 * 2026-08-13：owner 把吟唱規則改成「所有技能 0.06~4.00 秒」（`config.cast-time@1`），
 * 01-01 凶斬 從 0.4 → **0.633 秒 = 19 tick**，而下面那條測試等 14 tick ⇒
 * 傷害還沒發生就斷言「傷害 > 100」，紅在一個沒壞的東西上。
 * 同一天同一個形狀壞了 `castabilitySweep`（120 格）與變身時長守衛（`= 11` 的常數）。
 *
 * ⛔ 不要把 14 改成 25 了事：下一次調吟唱倍率它會再壞一次，而且用錯誤的訊息紅。
 */
function settleTicks(slot: "Q" | "W" | "E" | "R", cid: ChampionId, extra: number): number {
  const champ = Champions.tryGet(cid);
  const sec = champ?.abilities?.[slot]?.castTimeSec ?? 0;
  return Math.round(sec * TICK_HZ) + 1 + extra;
}

// ─────────────────────────────────────────────────────────────────────── Q
describe("GH#250 A — 01-01 凶斬 really flies over", () => {
  it("carries the CASTER onto the target instead of leaving him standing", () => {
    const GAP = 4;
    const { world, cloud, foe } = rig(GAP);
    fillMana(world, cloud);
    const from = { ...world.transform.get(cloud)!.pos };
    const mark = { ...world.transform.get(foe)!.pos };
    expect(V.len(V.sub(mark, from))).toBeCloseTo(GAP, 5);

    expect(castAbility(world, cloud, "Q", { type: "entity", entityId: foe })).toBe("ok");
    // 吟唱（從技能自己的秒數推）+ 0.2 秒飛行（6 tick）+ 落地後的碰撞鬆弛。
    for (let i = 0; i < settleTicks("Q", "godie-hart" as ChampionId, 18); i++) world.step(NO_INTENTS);

    const landed = world.transform.get(cloud)!.pos;
    const closed = V.len(V.sub(mark, landed));
    // He must end up ON the man he cut, not somewhere vaguely nearer. The only
    // thing between him and the exact point is the two bodies' own radii
    // (0.6 + 0.6), which the collision relaxation resolves after touchdown.
    expect(closed, `凶斬 left the caster ${closed.toFixed(2)}u from the target`).toBeLessThan(1.5);
  });

  it("does not lose the damage or the 1-second disable it already had", () => {
    const { world, cloud, foe } = rig(4);
    fillMana(world, cloud);
    const hp = world.health.get(foe)!;
    const before = hp.hp;
    expect(castAbility(world, cloud, "Q", { type: "entity", entityId: foe })).toBe("ok");
    for (let i = 0; i < settleTicks("Q", "godie-hart" as ChampionId, 2); i++) world.step(NO_INTENTS);
    expect(before - hp.hp).toBeGreaterThan(100);
    // ⚠️ 2026-08-18（#356）：這裡本來寫死 `"slow25"`，而 `slowLabelMatchesMultiplier`
    //    那條守衛（標籤必須等於 `moveSpeedMult` 換算出來的減速）把這一支的
    //    `moveSpeedMult: 0.6` 從 slow25 正名成 slow40 —— 於是這條用「凶斬掉了減速」
    //    這句假話紅了。⭐ 這條要守的是「那個 applyStatus 真的在 sim 裡開火」，
    //    ⛔ 不是那個標籤叫什麼，所以名字從**出貨的技能文件**推導。
    const qId = Champions.get("godie-hart" as ChampionId).abilities.Q.id;
    const slowId = (Abilities.get(qId).effects ?? []).find(
      (e) => e.kind === "applyStatus",
    )?.statusId;
    expect(slowId, "凶斬的 applyStatus 效果整個不見了").toBeDefined();
    expect(world.status.get(foe)!.effects.map((e) => e.statusId)).toContain(slowId);
  });
});

// ─────────────────────────────────────────────────────────────────────── R
/**
 * Run 超究武神霸斬 at `rank` and return every distinct HP drop the victim took,
 * in order. Regen is subtracted out by only recording NEGATIVE deltas.
 */
function omnislash(rank: number): { hits: number[]; world: SimWorld; cloud: EntityId; foe: EntityId } {
  const { world, cloud, foe } = rig(3);
  toRank(world, cloud, "R", rank);
  fillMana(world, cloud);
  const hp = world.health.get(foe)!;
  hp.hp = hp.maxHp = 100000; // survive the whole combo at every rank
  expect(castAbility(world, cloud, "R", { type: "entity", entityId: foe })).toBe("ok");
  const hits: number[] = [];
  let last = hp.hp;
  // 0.8 s wind-up + 3.5 s combo = 4.3 s = 129 ticks; 200 leaves slack.
  for (let i = 0; i < 200; i++) {
    world.step(NO_INTENTS);
    const drop = last - hp.hp;
    if (drop > 0.5) hits.push(drop);
    last = hp.hp;
  }
  return { hits, world, cloud, foe };
}

describe("GH#250 B — 01-04 超究武神霸斬 is seven slashes, not one packet", () => {
  /**
   * ⚠️ COUNTING THE PAYOUTS IS NOT ENOUGH, and the mutation run proved it: with
   * the combo shortened 3.5 s → 3.0 s the base burn pays only SIX times and the
   * finisher lands alone afterwards, so the count is still 7 and a count-only
   * assertion stays green while a whole slash has gone missing (失敗形態 ④).
   * The BUDGET is what makes it a guard: seven payouts of the same flat number
   * PLUS the finisher's strength term, so the total must exceed 7 × one hit.
   */
  it.each([1, 2, 3])("rank %i pays SEVEN hits worth SEVEN hits", (rank) => {
    const { hits } = omnislash(rank);
    const shown = hits.map((h) => h.toFixed(1)).join(", ");
    expect(hits.length, `payouts: ${shown}`).toBe(7);
    const sum = hits.reduce((a, b) => a + b, 0);
    expect(sum, `payouts: ${shown}`).toBeGreaterThan(7 * hits[0]!);
  });

  it("the seventh hit is the heavier finisher (the JASS's +STR×rank term)", () => {
    const { hits } = omnislash(1);
    const [h1] = hits;
    const last = hits[hits.length - 1]!;
    // hits 1..6 are one flat number each…
    for (const h of hits.slice(0, 6)) expect(h).toBeCloseTo(h1!, 3);
    // …and hit 7 carries STR on top of that same number. 克勞德's base STR is
    // 24 (content/champions/godie-hart.json), so the surplus is unmistakable
    // even after armour — but assert only the DIRECTION so armour/level tuning
    // never turns this into a maintenance tax.
    expect(last, `hit7=${last.toFixed(1)} vs hit1=${h1!.toFixed(1)}`).toBeGreaterThan(h1! + 10);
  });

  /**
   * ⛔ 這一條在 2026-08-22 之前斷言 `r2/r1 = 149/99`、`r3/r1 = 199/99`
   *    ——「逐階 +50」，逐字抄自 JASS 的 `49 + 50×rank`。
   *
   * ⚠️ **那個比例已經不存在了，而且不是這次改壞的**：owner 的**傷害五級距**
   *    (`config.damage-tiers@1`) 是全專案的傷害語言 —— 量到的出貨內容是
   *    **147 個傷害葉走 `damageTier`、只剩 6 個還帶 `perRank`**。
   *    這一支之所以撐到今天才被發現，只是因為它以前掛在 `dot.amountPerTick` 上，
   *    而 `apply_tiers.py` 不走那一格（＝ CLAUDE.md 記著的那個級距走訪缺口）。
   *    改成 `comboStrikes` 之後它落在 `damage.amount`，級距當場接管。
   *
   * ⇒ 現在驗**還活著的那個機制**：每一刀的數字來自**共用的級距表**
   *    （改表就會變），而 ⭐ **第七刀多帶一個力量項** —— 那正是 JASS
   *    `if ( not ( udg_SupI >= 7 ) )` 分出來的那一發。
   *    ⛔ 不驗任何字面數字（第二守則：出貨數值住 config，抄進測試就是第四個住處）。
   */
  it("每一刀走共用級距表，而第七刀（收尾）多帶力量項 —— JASS 的 `SupI >= 7`", () => {
    const runs = [omnislash(1), omnislash(2), omnislash(3)];
    for (const r of runs) {
      expect(r.hits.length, "七刀").toBe(7);
      // 前六刀同一個級距 ⇒ 彼此相等（⛔ 不問等於多少）
      const flat = r.hits.slice(0, 6);
      for (const h of flat) expect(h).toBeCloseTo(flat[0]!, 5);
      // ⭐ 第七刀 = 同級距 + 力量項 ⇒ 嚴格更大。這是這支技能的**形狀**。
      expect(r.hits[6]!, "第七刀要比前六刀重").toBeGreaterThan(flat[0]!);
    }
  });
});

describe("GH#250 C — both bodies are locked for the performance", () => {
  it("the victim is hard-CC'd, and the caster is paused AND untouchable", () => {
    const { world, cloud, foe } = rig(3);
    toRank(world, cloud, "R", 1);
    fillMana(world, cloud);
    expect(castAbility(world, cloud, "R", { type: "entity", entityId: foe })).toBe("ok");
    // 吟唱從技能自己的秒數推（2026-08-13 從 0.8 → 1.5 秒 = 45 tick；
    // 寫死的 30 已經追不上了，⛔ 不要改成 50 了事）。
    const wait = settleTicks("R", "godie-hart" as ChampionId, 2);
    for (let i = 0; i < wait; i++) world.step(NO_INTENTS);

    const stunned = (id: EntityId, statusId: string): boolean =>
      world.status.get(id)!.effects.some((e) => e.statusId === statusId && e.stun === true);
    expect(stunned(foe, "omnislash-lock"), "victim is not locked").toBe(true);
    expect(stunned(cloud, "omnislash-perform"), "caster is not paused").toBe(true);

    // `Avul`: a 500-point physical packet must bounce off mid-combo.
    //
    // ⚠️ PHYSICAL, NOT TRUE, and that is a DELIBERATE divergence from WC3 rather
    // than a weaker test. WC3's `Avul` ignores everything; GGD's shipped floor
    // (owner, #270 — 火圈改真實傷害) is that NO immunity window may survive the
    // shrinking fire ring, so every bound `invulnerable` in the tree carries
    // `blocksTrueDamage: false` and content/invulnerableBinding.test.ts asserts
    // exactly that for this doc by name. Asserting immunity to true damage here
    // would demand the opposite of the rule the other suite enforces.
    const hp = world.health.get(cloud)!;
    const before = hp.hp;
    world.damageQueue.push({
      source: foe,
      target: cloud,
      amount: 500,
      type: "physical",
      crit: false,
      origin: "test:avul",
    });
    world.step(NO_INTENTS);
    expect(before - hp.hp, "caster took damage during 演武").toBeLessThanOrEqual(0);

    // `PauseUnitBJ`: he cannot start another ability while performing.
    expect(castAbility(world, cloud, "Q", { type: "entity", entityId: foe })).toBe("stunned");
  });

  it("releases BOTH bodies when the combo ends — nobody is stuck", () => {
    const { world, cloud, foe } = rig(3);
    toRank(world, cloud, "R", 1);
    fillMana(world, cloud);
    expect(castAbility(world, cloud, "R", { type: "entity", entityId: foe })).toBe("ok");
    // 0.8 s wind-up + 3.5 s combo = 129 ticks. Step well past it.
    for (let i = 0; i < 180; i++) world.step(NO_INTENTS);
    for (const [id, name] of [
      [cloud, "caster"],
      [foe, "victim"],
    ] as const) {
      const held = world.status.get(id)!.effects.filter((e) => e.stun === true);
      expect(held.map((e) => e.statusId), `${name} still locked`).toEqual([]);
    }
    // and the caster can act again — the strongest form of "not stuck".
    // ⚠️ ⛔ 不可以斷言 `"ok"`：七刀之後那位受害者多半**已經死了**，於是回傳
    //    `"bad-target"` —— 而那與「施法者被卡住」一點關係都沒有。
    //    ⭐ 這一條要驗的是**沒有被鎖住**，所以它問的是「不是 stunned」。
    expect(castAbility(world, cloud, "Q", { type: "entity", entityId: foe })).not.toBe("stunned");
  });
});
