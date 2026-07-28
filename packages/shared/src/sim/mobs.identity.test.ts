/**
 * 殭屍身分的三個「最後一吋」 —— 稽核補的守衛 (verifier, GH#191/GH#192).
 *
 * 這一支不是重寫已經有的東西。它只補三條**在交付的套件裡突變能存活**的縫：
 *
 *  ① 王 / 特殊殭屍各自的 `championId` 完全沒有守衛。把
 *     `mobRulesFromConfig` 的兩支解析改成
 *         modelKey: cfg.boss.modelKey ?? modelKey,
 *         modelKey: cfg.special.modelKey ?? modelKey,
 *     （也就是忽略那兩個欄位）之後，shared 1438 / game-server 562 /
 *     client mobSizeWiring 5 條**全綠**。後台那兩個下拉選單存得進去、畫得回來、
 *     永遠不生效 —— 跟 GH#191 一開始要修的缺陷是同一個形狀（失敗形狀 ②，而且
 *     UI 還替它圓謊），只是換到了王與特殊殭屍身上。
 *
 *  ② 「留空 = 沿用該回合的一般殭屍」這條規則本身也沒有守衛，而出貨設定走的
 *     正是這一支。
 *
 *  ③ 逐回合「由誰擔任」目前只在 `mobChampionForRound` 這個純函式與一個**手動
 *     組好 rules 再塞進 world 的** wire 測試裡被斷言過。這裡改成斷言
 *     `mobRulesFromConfig` 這個唯一的入口在**同一份 cfg、不同 round** 下真的
 *     給出不同的 modelKey ——「臉」與「網格」是一起換的，不是兩個獨立欄位。
 *
 * ⑦ 會是斷言 `cfg.boss.championId === "sela"`（config 的屬性，改前改後都真）。
 * 這裡全部斷言在 `mobModelKeyFor(rules, kind)` 上 —— 也就是 `snapshot.ts` 寫進
 * `EntityState.key`、客戶端拿去 `modelDocFor` 決定載哪個網格的那個字串。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { registerSkeletonContent } from "./content/skeleton";
import { Champions } from "./content/registry";
import type { ChampionId } from "../ids";
import { MOB_MODEL_KEY, mobModelKeyFor, mobRulesFromConfig } from "./mobs";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;

describe("王 / 特殊殭屍的 championId 真的決定它們的網格 (GH#192)", () => {
  it("先證明這三個答案本來就該不同 —— 守衛的守衛", () => {
    cover("mob-special-visible");
    expect(Champions.tryGet("sela" as ChampionId)?.modelKey).toBe("champ.sela");
    expect(Champions.tryGet("thorne" as ChampionId)?.modelKey).toBe("champ.thorne");
    // 出貨的 `mob.championId` (godie-zombiex) 在骨架內容裡沒註冊,所以一般殭屍
    // 會落到 MOB_MODEL_KEY —— 這正好給我們第三個互不相同的字串。
    expect(MOB_MODEL_KEY).not.toBe("champ.sela");
    expect(MOB_MODEL_KEY).not.toBe("champ.thorne");
  });

  it("三個 championId → 三個不同的 model key,而且是出貨路徑讀得到的那個", () => {
    cover("mob-special-visible");
    const cfg = {
      ...DEFAULT_MOB_WAVES_CONFIG,
      boss: { ...DEFAULT_MOB_WAVES_CONFIG.boss!, championId: "sela" },
      special: { ...DEFAULT_MOB_WAVES_CONFIG.special!, championId: "thorne" },
    };
    const rules = mobRulesFromConfig(cfg, DT, 3);

    expect(mobModelKeyFor(rules, "normal")).toBe(MOB_MODEL_KEY);
    expect(mobModelKeyFor(rules, "boss")).toBe("champ.sela");
    expect(mobModelKeyFor(rules, "special")).toBe("champ.thorne");
    // 三個字串真的互不相同 —— 否則上面三條可以同時為真而功能是死的
    expect(
      new Set([
        mobModelKeyFor(rules, "normal"),
        mobModelKeyFor(rules, "boss"),
        mobModelKeyFor(rules, "special"),
      ]).size,
    ).toBe(3);
  });

  it("`modelKey` 覆蓋仍然贏過 championId —— 兩個欄位的優先序沒有反過來", () => {
    cover("mob-special-visible");
    const cfg = {
      ...DEFAULT_MOB_WAVES_CONFIG,
      boss: {
        ...DEFAULT_MOB_WAVES_CONFIG.boss!,
        championId: "sela",
        modelKey: "prop.explicit-king",
      },
      special: { ...DEFAULT_MOB_WAVES_CONFIG.special!, championId: "thorne" },
    };
    const rules = mobRulesFromConfig(cfg, DT, 3);
    expect(mobModelKeyFor(rules, "boss")).toBe("prop.explicit-king");
    // …而沒有覆蓋的那一支不受影響
    expect(mobModelKeyFor(rules, "special")).toBe("champ.thorne");
  });

  it("留空 = 沿用該回合的一般殭屍 —— 出貨設定走的就是這一支", () => {
    cover("mob-special-visible");
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    expect(mobModelKeyFor(rules, "boss")).toBe(mobModelKeyFor(rules, "normal"));
    expect(mobModelKeyFor(rules, "special")).toBe(mobModelKeyFor(rules, "normal"));
  });

  it("逐回合的「由誰擔任」也帶著王與特殊殭屍一起換臉", () => {
    cover("mob-round-champion");
    // 出貨形狀:王/特殊都沒有自己的 championId,所以它們沿用「該回合」的一般
    // 殭屍。第 3 回合指定 sela、第 4 回合沒有列 ⇒ 兩回合三種殭屍全部換過去。
    const cfg = {
      ...DEFAULT_MOB_WAVES_CONFIG,
      mob: { ...DEFAULT_MOB_WAVES_CONFIG.mob, championId: "thorne" },
      schedule: [
        { round: 3, mobsPerWaveCap: 5, maxAlivePerZone: 15, championId: "sela" },
        ...(DEFAULT_MOB_WAVES_CONFIG.schedule ?? []),
      ],
    };
    const r3 = mobRulesFromConfig(cfg, DT, 3);
    const r4 = mobRulesFromConfig(cfg, DT, 4);
    for (const kind of ["normal", "boss", "special"] as const) {
      expect(mobModelKeyFor(r3, kind)).toBe("champ.sela");
      expect(mobModelKeyFor(r4, kind)).toBe("champ.thorne");
    }
    // 兩個答案真的是不同字串 —— 否則整組斷言可以在功能全死的實作上通過
    expect(mobModelKeyFor(r3, "boss")).not.toBe(mobModelKeyFor(r4, "boss"));
  });
});
