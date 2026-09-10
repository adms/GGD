/**
 * GH#1082 —— 11-03 鬼氣九刀流／11-04 三千世界的「三刀流持續期間」增幅改讀**狀態葉**
 * （`{kind:"status", subject:"self", statusId:"three-sword-style"}`），⛔ 不再是
 * `recentCast PASSIVE withinSec 15`（＝ 11-00 三刀流 `applyBuff.duration` 的第二住處，第〇·四守則）。
 *
 * 三條、兩個方向（一把只驗單邊的尺不算自證）：
 *  ① 機制：**出貨的** 11-03 在身上帶／不帶〔三刀流〕標記時各打一發 —— 帶著更痛、不帶回到基礎。
 *     標記走 `applyBuff.statusId`（`statusStacks` 的第三本帳：ModifierSource），與 11-00 出貨後的形狀逐字相同。
 *  ② 配對：**真的**按 11-00 → 期間吃得到 → ⭐ 真的到期後同一發不吃（recentCast 做不到的那一半）。
 *     ⚠️ 前提是 `godie-{u01u,udre}.passive` 的 applyBuff 帶 `statusId:"three-sword-style"` ——
 *     缺了它，第一個斷言會**指名那一格**（⛔ 不是「4 秒內沒落地」那種指錯方向的訊息）。
 *  ③ 四份文件（11-03／11-04 × 本體／變身）讀的是**同一個**狀態，⛔ 沒有 PASSIVE 的 recentCast 殘留。
 * ⛔ 沒有出貨數值進斷言：法強是夾具、到期秒數從出貨的 11-00 文件讀、係數只問「有／沒有」。
 * 突變紀錄：`godie-udre.e.json` 的 statusId 改成 `three-sword-style-nope` ⇒ ①🔴（帶標記那一發與基礎一樣痛）
 *   ③🔴（讀不到〔三刀流〕）；改回來 ①③ 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { shippedContentSource } from "../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { attachSource } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { runEffects } from "./effects/effectRunner";
import { hasStatus } from "./effects/effectCommon";
import type { EffectDef } from "./effects/effect";
import type { CastTarget } from "./intents";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type StatusId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
/** 11 索隆的**本體**（`championForms`：baseId udre ／ alternateId u01u）。 */
const ZORO = "godie-udre" as ChampionId;
const SID = "three-sword-style" as StatusId;
const C = SKELETON_ARENA.zones[0]!.center;
const FOUR = ["godie-udre.e", "godie-u01u.e", "godie-udre.r", "godie-u01u.r"] as AbilityId[];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 索隆 ＋ 3 格外的敵人（11-03 射程 8 之內）。E 學到 1 級；法強／法力池是夾具。 */
function stage(): { world: SimWorld; hero: EntityId; enemy: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1082);
  world.combatActive = true;
  const mk = (dx: number, seat: number): EntityId =>
    spawnChampion(world, { championId: ZORO, seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: C.x + dx, z: C.z }, zone: 0 });
  const hero = mk(0, 0);
  const enemy = mk(3, 1);
  world.abilities.get(hero)!.slots.E.rank = 1;
  const modifiers = [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 }, { stat: Stat.MaxMana, op: ModOp.Flat, value: 1000 }];
  attachSource(world, hero, { id: "test:ap", kind: "buff", modifiers });
  world.step(new Map());
  return { world, hero, enemy };
}

/** 推一 tick，⛔ 不讓三刀流「每秒掉血」的代價在測試裡殺死索隆（量的是傷害，不是他的血）。 */
function tick(world: SimWorld, hero: EntityId): void {
  world.step(new Map());
  const h = world.health.get(hero)!;
  h.hp = h.maxHp;
}

/** 按下一格並把世界推到 `done` 成立（吟唱長度由出貨值決定；4 秒上限由 `dt` 推導）。 */
function castUntil(world: SimWorld, hero: EntityId, slot: "E" | "PASSIVE", target: CastTarget, done: () => boolean): void {
  const ab = world.abilities.get(hero)!;
  if (slot === "E") ab.slots.E.cooldownRemainingTicks = 0;
  const h = world.health.get(hero)!;
  h.mana = h.maxMana;
  expect(castAbility(world, hero, slot, target), `${slot} 按不下去`).toBe("ok");
  for (let i = 0; i < Math.round(4 / world.dt); i++) {
    tick(world, hero);
    if (done()) return;
  }
  throw new Error(`${slot} 在 4 秒內沒有落地`);
}

/** 施放 11-03，回傳那一發打在 enemy 身上的傷害（出貨的 `damage` 事件，⛔ 不是自己算的）。 */
function castE(world: SimWorld, hero: EntityId, enemy: EntityId): number {
  tick(world, hero);
  const eh = world.health.get(enemy)!;
  eh.hp = eh.maxHp;
  let amount: number | undefined;
  castUntil(world, hero, "E", { type: "entity", entityId: enemy }, () => {
    const hit = world.events.find((e) => e.type === "damage" && e.data["target"] === enemy && String(e.data["origin"]).endsWith(".e"));
    if (hit) amount = hit.data["amount"] as number;
    return amount !== undefined;
  });
  return amount!;
}

describe("GH#1082 三刀流增幅讀狀態葉 —— 出貨 11-03 鬼氣九刀流", () => {
  it("① 身上帶〔三刀流〕標記那一發更痛；⛔ 不帶的兩發一樣痛", () => {
    const a = stage();
    const plain = castE(a.world, a.hero, a.enemy);
    const b = stage();
    runEffects([{ kind: "applyBuff", modifiers: [], duration: 30, statusId: SID } as EffectDef], {
      world: b.world, caster: b.hero, rank: 1, targets: [b.hero], origin: "probe", rng: b.world.rng,
    });
    const buffed = castE(b.world, b.hero, b.enemy);
    expect(plain, "⛔ 基礎那一發沒有掉血 —— 量尺壞了，這一支的結論全部作廢").toBeGreaterThan(0);
    expect(buffed, `帶著〔三刀流〕與沒帶一樣痛（${buffed} vs ${plain}）—— 0.5×AP 的 status ratio 沒有生效`).toBeGreaterThan(plain);
    expect(castE(a.world, a.hero, a.enemy), "沒帶標記的第二發不一樣痛 —— 條件式係數在漏水").toBeCloseTo(plain, 6);
  });

  it("② 真的按 11-00 三刀流 → 期間吃得到 → ⭐ 真的到期後同一發不吃", () => {
    const passive = Abilities.get(`${ZORO}.passive` as AbilityId);
    const buff = passive.effects.find((e) => e.kind === "applyBuff") as Extract<EffectDef, { kind: "applyBuff" }> | undefined;
    expect(
      buff?.statusId,
      `⛔ 11-00 三刀流（${passive.id}）的 applyBuff 沒有 statusId:"${SID}" ⇒ 11-03／11-04 的 status 葉永遠讀不到它（卡面說了但不會發生）。` +
        `修法：godie-{u01u,udre}.passive.json 的 applyBuff 補 "statusId": "${SID}"，並新增 content/status-effects/${SID}.json`,
    ).toBe(SID);
    const { world, hero, enemy } = stage();
    const plain = castE(world, hero, enemy);
    castUntil(world, hero, "PASSIVE", { type: "self" }, () => hasStatus(world, hero, SID));
    const during = castE(world, hero, enemy);
    // 到期：秒數從出貨的 11-00 文件讀（⛔ 不抄 15），多給 1 秒的餘裕。
    const limit = Math.round(((buff!.duration ?? 0) + 1) / world.dt);
    for (let i = 0; i < limit && hasStatus(world, hero, SID); i++) tick(world, hero);
    expect(hasStatus(world, hero, SID), "三刀流沒有在自己的持續秒數內到期").toBe(false);
    const after = castE(world, hero, enemy);
    expect(during, "三刀流期間那一發沒有比基礎大").toBeGreaterThan(plain);
    expect(after, "三刀流到期後仍吃到增幅 —— 那正是 recentCast withinSec 的尾巴").toBeCloseTo(plain, 6);
  });

  it("③ 11-03／11-04 × 本體／變身四份文件讀同一個狀態，⛔ 沒有 PASSIVE 的 recentCast 殘留", () => {
    const whens: Record<string, unknown>[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n === null || typeof n !== "object") return;
      const r = n as Record<string, unknown>;
      if (r["when"] !== null && typeof r["when"] === "object") whens.push(r["when"] as Record<string, unknown>);
      Object.values(r).forEach(walk);
    };
    for (const id of FOUR) {
      whens.length = 0;
      walk(Abilities.get(id).effects);
      expect(whens.some((w) => w["kind"] === "recentCast" && w["slot"] === "PASSIVE"), `${id} 仍有 recentCast PASSIVE`).toBe(false);
      expect(whens.some((w) => w["kind"] === "status" && w["subject"] === "self" && w["statusId"] === SID), `${id} 沒有讀〔三刀流〕`).toBe(true);
    }
  });
});
