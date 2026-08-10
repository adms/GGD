/**
 * 冷卻的**兩個**上限（owner 2026-08-10）——
 * 「cdr 天花板可以是 0.99（99%減免），但要卡最低秒數 0.1 秒」。
 *
 * ⭐ 這一條要守的是「**兩個一起**才蓋得住整個值域」，不是任何一個數字：
 *
 *  ① 比率天花板真的放到 0.99 —— 一支長技能的冷卻被砍掉的量會跟著 cdr 走，
 *     而不是在半路被某一層夾住（這一格在 2026-08-10 一天內動過兩次：
 *     0.45 → 0.5 → 0.99，每一次都有東西在下游偷偷夾它）。
 *  ② ⭐ 秒數地板真的擋得住短技能 —— 這是這一批**唯一**的新機制。
 *     只有比率上限的話，一支 1 秒的技能在 99% 減免下是 0.01 秒，也就是
 *     每個 tick 都放得出來，而比率天花板再怎麼調都擋不住它。
 *  ③ 地板是**最後**一步：全域冷卻倍率乘完之後才夾。放在中間的話
 *     「全域冷卻 ×2」會把已經觸底的技能推回地板之上。
 *
 * ⚠️ 上限值一律從出貨表推導（`statCapBounds` / `DEFAULT_COOLDOWN_RULES`），
 * 不抄字面值 —— owner 當天就改過兩次（CLAUDE.md：出貨數值住進測試＝第四個住處）。
 *
 * 突變紀錄：
 *   · `applyCooldownFloor` 的 `Math.max` 改成直接回傳 seconds  → ② 紅
 *   · 地板改成套在 `combatEnv.cooldown` **之前**                → ③ 紅
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import {
  applyCooldownFloor,
  cooldownRulesFromDoc,
  DEFAULT_COOLDOWN_RULES,
  type CooldownRules,
} from "./cooldownRules";
import { DEFAULT_STAT_CAPS } from "./statCaps";
import { Stat, STAT_CLAMPS } from "./stats/statTypes";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { attachSource, recomputeStats } from "./stats/statPipeline";
import { ModOp } from "./stats/modifiers";
import { asSeatId, asTeamId, type ChampionId } from "../ids";

/** 出貨的比率天花板 —— 從表推導，不抄。 */
const CDR_CAP = DEFAULT_STAT_CAPS[Stat.CooldownReduction]?.base ?? STAT_CLAMPS[Stat.CooldownReduction]![1];
/** 出貨的秒數地板。 */
const FLOOR = DEFAULT_COOLDOWN_RULES.minSeconds;

/** 出貨算式的複本 —— 順序與 `abilitySystem.ts` 完全一致。 */
function cooldownSecs(opts: {
  base: number;
  cdr: number;
  envCooldown?: number;
  rules?: CooldownRules;
}): number {
  return applyCooldownFloor(
    opts.rules ?? DEFAULT_COOLDOWN_RULES,
    opts.base * (1 - opts.cdr) * (opts.envCooldown ?? 1),
  );
}

describe("冷卻的兩個上限 —— 比率天花板 + 秒數地板", () => {
  it("① 比率天花板真的開到 0.99 這一級（長技能砍得動）", () => {
    cover("cooldown-cap-rate");
    // 夾具前提：天花板不是舊的 0.45 / 0.5 那一級。用「砍掉多少」來說，
    // 不用「等於 0.99」—— 守的是「這一格真的被放寬了」。
    expect(CDR_CAP).toBeGreaterThan(0.9);

    // 一支 120 秒的 EX：吃滿天花板之後剩下的秒數遠遠在地板之上，
    // 所以它完全由比率決定 —— 這正是「比率管長技能」。
    const ex = cooldownSecs({ base: 120, cdr: CDR_CAP });
    expect(ex).toBeCloseTo(120 * (1 - CDR_CAP), 9);
    expect(ex).toBeGreaterThan(FLOOR);
  });

  it("② ⭐ 秒數地板擋得住短技能 —— 比率天花板對它完全無能為力", () => {
    cover("cooldown-floor");
    // 一支 1 秒的技能吃滿 99% 減免 → 0.01 秒 = 每個 tick 都放得出來。
    const raw = 1 * (1 - CDR_CAP);
    expect(raw).toBeLessThan(FLOOR); // 夾具前提：沒有地板的話它真的低於地板

    expect(cooldownSecs({ base: 1, cdr: CDR_CAP })).toBe(FLOOR);
    // 關掉地板 → 回到那個 0.01，證明擋住它的是地板而不是別的東西
    const off: CooldownRules = { ...DEFAULT_COOLDOWN_RULES, enabled: false };
    expect(cooldownSecs({ base: 1, cdr: CDR_CAP, rules: off })).toBeCloseTo(raw, 9);
  });

  it("③ 地板是最後一步 —— 全域冷卻倍率不會把觸底的技能推回地板之上", () => {
    cover("cooldown-floor-last");
    // 已經觸底的技能 × 全域 2.0：正確的實作先乘再夾，所以答案是
    // max(0.02, 地板) = 地板；把地板套在乘法之前會得到 地板 × 2。
    const got = cooldownSecs({ base: 1, cdr: CDR_CAP, envCooldown: 2 });
    expect(got).toBe(FLOOR);
    expect(got).not.toBeCloseTo(FLOOR * 2, 9);
  });

  it("認不得的文件 → 出貨值；超界的秒數被夾住而不是照收", () => {
    cover("cooldown-floor");
    expect(cooldownRulesFromDoc(undefined)).toEqual(DEFAULT_COOLDOWN_RULES);
    expect(cooldownRulesFromDoc({ schema: "config.something-else@1" })).toEqual(
      DEFAULT_COOLDOWN_RULES,
    );
    const wild = cooldownRulesFromDoc({
      schema: "config.cooldown-rules@1",
      enabled: true,
      minSeconds: 9999,
    });
    expect(wild.minSeconds).toBeLessThanOrEqual(10);
    expect(
      cooldownRulesFromDoc({ schema: "config.cooldown-rules@1", enabled: true, minSeconds: -5 })
        .minSeconds,
    ).toBe(0);
  });

  it("④ ⭐ 走**出貨的施法路徑**：地板真的在乘完全域倍率之後才夾", async () => {
    cover("cooldown-floor-shipped");
    // ⚠️ 上面 ③ 驗的是我自己複製的一份算式 —— 突變「把地板搬到乘法之前」
    //    對它是綠的（失敗形態⑤：被測的不是出貨的那個）。這一條走真的
    //    `castAbility`，讀真的 `cooldownRemainingTicks`。
    registerSkeletonContent();

    const measure = (envCooldown: number, cdr: number): { ticks: number; dt: number } => {
      const world = new SimWorld(SKELETON_ARENA, 17);
      world.combatActive = true;
      world.combatEnv = { ...world.combatEnv, cooldown: envCooldown };
      const hero = spawnChampion(world, {
        championId: SELA.id as ChampionId,
        seatId: asSeatId(0),
        teamId: asTeamId(0),
        pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
        zone: 0,
      });
      world.step(new Map());
      if (cdr > 0) {
        attachSource(world, hero, {
          id: "t:cdr-max",
          kind: "buff",
          modifiers: [{ stat: Stat.CooldownReduction, op: ModOp.Flat, value: cdr }],
        });
        // ⚠️ attachSource 自己不重算 —— 少了這一行 cdr 是 0，而測試會「通過」
        //    一個完全沒有冷卻縮減的世界（夾具騙自己）。
        recomputeStats(world, hero);
      }
      const slot = world.abilities.get(hero)!.slots.Q;
      slot.cooldownRemainingTicks = 0;
      world.health.get(hero)!.mana = 9999;
      expect(castAbility(world, hero, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
      return { ticks: slot.cooldownRemainingTicks, dt: world.dt };
    };

    // 這一格技能的基礎冷卻 —— 量出來的，不抄內容檔（它是內容，會被改）。
    const { ticks: baseTicks, dt } = measure(1, 0);
    const baseSecs = baseTicks * dt;
    expect(baseSecs).toBeGreaterThan(0);

    const cut = baseSecs * (1 - CDR_CAP); // 吃滿天花板之後剩下的秒數
    const expected = (env: number): number => Math.round(Math.max(cut * env, FLOOR) / dt);
    // ⛔ 錯的順序（地板套在乘法之前）長這樣 —— 拿來當反例，不是當期望值。
    const wrongOrder = (env: number): number => Math.round((Math.max(cut, FLOOR) * env) / dt);

    expect(measure(1, CDR_CAP).ticks).toBe(expected(1));

    // ⬇⬇ THE assertion：全域 ×2 之下，正確與錯誤的順序給出**不同**的 tick 數。
    //     夾具前提先確認這兩個數真的不一樣，否則這一條驗不到任何東西。
    expect(expected(2)).not.toBe(wrongOrder(2));
    expect(measure(2, CDR_CAP).ticks).toBe(expected(2));
  });

  it("出貨檔與 DEFAULT 一致（第一守則的三個住處）", async () => {
    cover("cooldown-floor");
    const doc = (await import("../../../../content/config/cooldown-rules.json")) as unknown as {
      default: { schema: string; enabled: boolean; minSeconds: number };
    };
    const shipped = doc.default ?? (doc as unknown as { schema: string; minSeconds: number });
    expect(shipped.schema).toBe("config.cooldown-rules@1");
    expect(cooldownRulesFromDoc(shipped)).toEqual(DEFAULT_COOLDOWN_RULES);
  });
});
