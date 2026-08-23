/**
 * ⛔⛔ **客戶端預測的屬性要與伺服器逐位元相同**（GH#616）。
 *
 * owner 2026-08-23：「客戶端移動還是**非常不順 常常有回溯**的部分 —— 是不是
 * **移動速度客戶端跟伺服器端其實不匹配**？」＋「**尤其是後來新地圖大小有變化
 * 可能是移動量測的公式有落差**」。⭐ 第一句他猜對了；第二句量過**不是地圖**。
 *
 * ── 量到的（⛔ 不是推測）──────────────────────────────────────────────────
 * ① 地圖那一半：13 張出貨場地 · 25 個分區（含 7 張新 graybox，rect 邊界 + 導航表
 *    + 最多 16 個 box，半徑 24→42）逐張跑「影子 vs 權威走一趟全場 8 秒」——
 *    **maxErr 全部 = 0.000**（連不做 reconcile 的自由奔跑也是 0）。
 *    ⇒ 「一單位移動多遠」由**共用的** `movementSystem` + 同一份 `arenaDefFromDoc`
 *      關死，⛔ 地圖大小進不了那條公式。
 *
 * ② 屬性那一半：**五層**只在伺服器發生（逐項見 `predictedStats.ts` 的檔頭表）——
 *    `growth·(等級−1)` · 非 Flat 的道具修飾子 · 職業限定閘 `requires` · `rangeScale`
 *    · 三張出貨設定表。出貨內容量到：帶移速道具**慢 17–33%**、
 *    7 位英雄射程**短到 30%**（`godie-o030` 伺服器 6.396 / 客戶端 4.920）、
 *    貫雷槍兩條閘都收 ⇒ 射程 **4.44 vs 3.24**。
 *
 * ── 這條守衛驗什麼 ─────────────────────────────────────────────────────────
 * ⭐ **每一位英雄 × 兩條屬性，客戶端與伺服器算出同一個 double**，
 *   而且**帶著出貨道具**也要成立。⛔ 一個出貨數字都沒進斷言：兩邊都從
 *   出貨的 `combat-env` / `stat-caps` / `base-bonus` / `body-scale` / 英雄卡算。
 *
 * 突變（一條，承重線，2026-08-23 實測）：`predictedStat` 的 `rangeScale:` 換成 `1`
 * ⇒ **紅**，逐名指出 7 位體型 ≠ 1 的英雄（`godie-o030` 6.396 vs 4.920）。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { grantItemFree } from "@ggd/shared/sim/economy/shop";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import { baseBonusFromDoc, perLevelBonusFromDoc } from "@ggd/shared/sim/baseBonus";
import { statCapsFromDoc } from "@ggd/shared/sim/statCaps";
import { bodyScaleRulesFromDoc } from "@ggd/shared/sim/bodyScale";
import { heroStartLevel } from "@ggd/shared/content/schema/config/match";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { predictedMoveSpeed, predictedAttackRange } from "./predictedStats";
import { asSeatId, asTeamId, type ChampionId, type ItemId } from "@ggd/shared/ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/** 出貨的 `config.combat-env@1`（⛔ 不是程式預設）。 */
function shippedEnv() {
  const doc = Configs.tryGet("combat-env") as { multipliers?: Record<string, number> } | undefined;
  return normalizeCombatEnv(doc?.multipliers ?? {});
}

/** 伺服器**真的**跑出來的那個值 —— 真 SimWorld + 真 stat pipeline + 出貨設定表。 */
function serverStats(championId: string, items: readonly string[]) {
  const world = new SimWorld(SKELETON_ARENA, 1);
  // 與 `MatchController` 逐格相同的五張表（那裡是 :1097 / :1099 / :1102 / :1116 / :1203）。
  world.combatEnv = shippedEnv();
  world.baseBonus = baseBonusFromDoc(Configs.tryGet("base-bonus"));
  world.perLevelBonus = perLevelBonusFromDoc(Configs.tryGet("per-level-bonus"));
  world.statCaps = statCapsFromDoc(Configs.tryGet("stat-caps"));
  world.bodyScaleRules = bodyScaleRulesFromDoc(Configs.tryGet("body-scale"));
  const id = spawnChampion(world, {
    championId: championId as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: C.x, z: C.z }, zone: 0,
    // ⭐ 出貨的登場等級（owner 2026-08-23「英雄登場初始等級設定為 6」），
    //   ⛔ 不是寫死的 6：它是後台一格，改了這條守衛要跟著走。
    level: heroStartLevel(Configs.tryGet("config.match")),
  });
  for (const it of items) grantItemFree(world, id, it as ItemId);
  world.step(new Map());
  const final = world.stats.get(id)!.final;
  return { ms: final[Stat.MoveSpeed], range: final[Stat.AttackRange] };
}

/** 凡是修飾這條屬性的每一件出貨道具（⛔ 不寫死 id：owner 加一件自動涵蓋）。 */
function itemsTouching(stat: Stat): string[] {
  return Items.ids()
    .map(String)
    .filter((i) => (Items.tryGet(i as ItemId)?.modifiers ?? []).some((m) => m.stat === stat));
}

/**
 * ⭐ 天生技把這條屬性寫進 **`auras`** 的英雄 —— 客戶端**預測不到**，
 * 因為靈氣是「誰站在半徑內」的函式，而影子世界只有自己一具身體。
 *
 * ⛔ 這不是寫死的豁免名單：它從**出貨內容**推導。新的一位英雄把移速加成寫進
 * 靈氣時，他自動落進這裡；⭐ 而如果哪天靈氣清單空了，下面的對照組會紅。
 * ⇒ 這一段差值由 `reconcile` 吸收（一趟 RTT），⛔ 不是被忽略。
 */
function auraCarriers(stat: Stat): Set<string> {
  const out = new Set<string>();
  for (const cid of Champions.ids().map(String)) {
    const pid = Champions.tryGet(cid as ChampionId)?.passiveAbility;
    if (!pid) continue;
    const ranks = (Abilities.tryGet(pid) as { passive?: { ranks?: unknown[] } } | undefined)?.passive?.ranks ?? [];
    for (const r of ranks as { auras?: { modifiers?: { stat?: string }[] }[] }[]) {
      for (const a of r.auras ?? []) {
        if ((a.modifiers ?? []).some((m) => m.stat === stat)) out.add(cid);
      }
    }
  }
  return out;
}

describe("預測屬性與伺服器的一致性（GH#616）", () => {
  it("⭐ 每一位英雄 · 移速與射程 · 逐位元相同（裸裝）", () => {
    const env = shippedEnv();
    const msAura = auraCarriers(Stat.MoveSpeed);
    const rgAura = auraCarriers(Stat.AttackRange);
    const bad: string[] = [];
    for (const cid of Champions.ids().map(String)) {
      const s = serverStats(cid, []);
      const ms = predictedMoveSpeed(cid, [], env);
      const rg = predictedAttackRange(cid, [], env);
      if (!msAura.has(cid) && ms !== s.ms) bad.push(`移速 ${cid}: 伺服器 ${s.ms} / 客戶端 ${ms}`);
      if (!rgAura.has(cid) && rg !== s.range) bad.push(`射程 ${cid}: 伺服器 ${s.range} / 客戶端 ${rg}`);
    }
    expect(bad, `⛔ 影子與權威不同 ⇒ 每一張快照把玩家拉回去（owner 說的「回溯」）:\n${bad.join("\n")}`)
      .toEqual([]);
  });

  it("⭐ 帶著出貨道具也要相同 —— 非 Flat 的修飾子是漏接最大的一格", () => {
    const env = shippedEnv();
    const bad: string[] = [];
    for (const [stat, read] of [
      [Stat.MoveSpeed, predictedMoveSpeed],
      [Stat.AttackRange, predictedAttackRange],
    ] as const) {
      const items = itemsTouching(stat);
      expect(items.length, `出貨內容裡沒有任何道具碰 ${stat} —— 標本失效了`).toBeGreaterThan(0);
      // 一位英雄逐件試：六格背包一次只塞一件，錯的那一件才指得出來。
      const cid = Champions.ids().map(String)[0]!;
      for (const it of items) {
        const s = serverStats(cid, [it]);
        const got = read(cid, [it], env);
        const want = stat === Stat.MoveSpeed ? s.ms : s.range;
        if (got !== want) bad.push(`${cid} + ${it}（${stat}）: 伺服器 ${want} / 客戶端 ${got}`);
      }
    }
    expect(bad, `⛔ 買了道具影子就跑錯速度:\n${bad.join("\n")}`).toEqual([]);
  });

  it("⭐ 對照組：近戰與遠程的出貨倍率**真的不同** —— 否則上面驗不到 byAttackType", () => {
    const env = shippedEnv();
    expect(
      env.moveSpeedMelee,
      "近戰與遠程倍率相同 ⇒ 上面那條對「漏掉第二格」的實作也會綠（失敗形態④）",
    ).not.toBe(env.moveSpeedRanged);
  });

  it("⭐ 對照組：靈氣豁免名單是**推導**的，而且今天真的有人在裡面", () => {
    // 它空了 = 上面那條的豁免分支從沒被走過 ⇒ 分支本身變成一段沒有人驗的程式；
    // 它長大了 = 有新英雄把移速寫進靈氣，那正是要被看見的事。
    expect([...auraCarriers(Stat.MoveSpeed)].length).toBeGreaterThan(0);
  });

  it("⭐ 對照組：出貨內容裡**真的有**體型 ≠ 1 的英雄 —— 否則驗不到 rangeScale", () => {
    const scaled = Champions.ids()
      .map((c) => Champions.tryGet(c)?.bodyScale)
      .filter((b): b is number => typeof b === "number" && b !== 1);
    expect(scaled.length, "沒有任何英雄的 bodyScale ≠ 1 ⇒ 漏掉 rangeScale 的實作也會綠").toBeGreaterThan(0);
  });
});
