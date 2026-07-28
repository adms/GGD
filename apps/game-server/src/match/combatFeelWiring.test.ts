/**
 * 戰鬥手感 (`config.combat-feel@1`, GH#193) 的**接線**守衛。
 *
 * 為什麼需要它 —— 一個存活的突變:把 MatchController 建構子裡的
 *
 *     this.world.combatFeel = combatFeel;
 *
 * 整行刪掉,`@ggd/shared`(1462 條)與 `@ggd/game-server`(558 條)**沒有任何一條
 * 新的測試會紅**。sim 那側的守衛全部自己指派 `world.combatFeel`(單元測試本來
 * 就該這樣),所以它們證明的是「sim 讀得到這張表」,不是「比賽真的把操作者那張
 * 表交給了 sim」。少了這一行,後台怎麼調都不會進到任何一場比賽,而每一條測試
 * 照樣是綠的 —— 正是「算出來了但從來沒送到玩家」那個失敗形狀。
 *
 * 所以這一份斷言的是**接縫**:一張非預設的表傳進建構子之後,
 *   1. 真的落在 `ctl.world.combatFeel` 上,而且
 *   2. 真的改變了 sim 的行為(把擊退整個關掉 vs. 打開),不只是欄位對得上。
 * 第 2 點是刻意的:只比欄位就是「掃屬性而非行為」。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import {
  DEFAULT_COMBAT_ENV,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";
import { DEFAULT_BASE_BONUS } from "@ggd/shared/sim/baseBonus";
import { DEFAULT_STAT_CAPS } from "@ggd/shared/sim/statCaps";
import {
  DEFAULT_COMBAT_FEEL,
  combatFeelFromDoc,
  COMBAT_FEEL_SCHEMA,
  type CombatFeelRules,
} from "@ggd/shared/sim/combatFeel";
import { Whitelist } from "../curation/whitelist";
import { Ownership } from "../curation/ownership";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";

const FAST = {
  champSelectTicks: 5,
  intermissionTicks: 30,
  combatMaxTicks: 1200,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function build(combatFeel: CombatFeelRules): MatchController {
  return new MatchController(
    "m-cf",
    99,
    allBots(),
    FAST,
    3,
    DEFAULT_ARENA_RULES,
    SKELETON_ARENA,
    Whitelist.allowAll(),
    DEFAULT_COMBAT_ENV as CombatEnvMultipliers,
    null,
    [],
    Ownership.allowAll(),
    DEFAULT_BASE_BONUS,
    DEFAULT_STAT_CAPS,
    combatFeel,
  );
}

/** 一張「擊退整個關掉」的操作者表:門檻拉到 1.0 = 只有一擊必殺才推。 */
const NO_KNOCKBACK: CombatFeelRules = Object.freeze({
  knockback: { minPct: 1, maxBodies: 10, bodyUnit: 1.0 },
  standstill: DEFAULT_COMBAT_FEEL.standstill,
});

describe("combat-feel 真的從 MatchController 走進 sim (cf-wiring)", () => {
  it("cf-wiring-lands — 建構子拿到的那張表就是 world 上的那張表", () => {
    cover("cf-wiring-lands");
    const ctl = build(NO_KNOCKBACK);
    expect(ctl.world.combatFeel.knockback.minPct).toBe(1);
    // 儀器活著:另一張表就會得到另一個值,不是「怎麼傳都一樣」。
    expect(build(DEFAULT_COMBAT_FEEL).world.combatFeel.knockback.minPct).toBe(
      DEFAULT_COMBAT_FEEL.knockback.minPct,
    );
  });

  it("cf-wiring-behaviour — 換一張表就換一個 sim 行為(不是只有欄位對得上)", () => {
    cover("cf-wiring-behaviour");
    // 同一發傷害、同一個受害者、同一個距離,唯一的變數是操作者那張表。
    const shove = (feel: CombatFeelRules): number => {
      const ctl = build(feel);
      const w = ctl.world;
      const a = w.spawn();
      const b = w.spawn();
      for (const [id, x] of [
        [a, 0],
        [b, 1],
      ] as const) {
        w.transform.set(id, {
          pos: { x, z: 0 },
          vel: { x: 0, z: 0 },
          facing: { x: 1, z: 0 },
          radius: 0.1,
          zone: 0,
        });
        w.health.set(id, { hp: 100, maxHp: 100, mana: 0, maxMana: 0, alive: true, shields: [] });
        w.nav.set(id, {
          order: null,
          moveTarget: null,
          override: null,
          attackTarget: null,
          attackTargetAuto: false,
        });
        w.status.set(id, { effects: [] });
      }
      // 50% 最大生命的一發真傷,距離 1.0。
      w.damageQueue.push({ source: a, target: b, amount: 50, type: "true", crit: false, origin: "t" });
      w.step(new Map());
      const ov = w.nav.get(b)!.override;
      return ov?.kind === "knockback" ? ov.remaining : 0;
    };

    // 出貨表:50% → 5 身位 − 1.0 的距離 = 推得動。
    expect(shove(DEFAULT_COMBAT_FEEL)).toBeGreaterThan(0);
    // 操作者把門檻拉到 100%:同一發完全不推。
    expect(shove(NO_KNOCKBACK)).toBe(0);
  });

  it("cf-wiring-default — 不傳參數時走的是 config 文件(缺文件 → 出貨預設,不是空表)", () => {
    cover("cf-wiring-default");
    // MatchRoom / replay Player 兩個出貨呼叫端都**不傳**這個參數,所以建構子
    // 預設值就是線上真正用的那一條路。它必須是「文件 → 出貨預設」,不是空表。
    const ctl = new MatchController("m-cf-def", 99, allBots(), FAST, 3, DEFAULT_ARENA_RULES, SKELETON_ARENA);
    const fromDoc = combatFeelFromDoc(undefined);
    expect(fromDoc.knockback).toEqual(DEFAULT_COMBAT_FEEL.knockback);
    // 測試環境沒有載入 content,`Configs.tryGet` 回 undefined → 出貨預設。
    expect(ctl.world.combatFeel.knockback.maxBodies).toBeGreaterThan(0);
    expect(ctl.world.combatFeel.standstill.enabled).toBe(true);
    // schema 字串是讀寫兩端共用的常數,拼錯就整張表默默消失。
    expect(COMBAT_FEEL_SCHEMA).toBe("config.combat-feel@1");
  });
});
