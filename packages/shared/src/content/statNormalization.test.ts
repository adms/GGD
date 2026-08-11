/**
 * 英雄屬性正規化 —— 角色定位真的變成了英雄卡上的數字。
 *
 * ⚠️ 驗的是**機制**不是數字（第二守則）：斷言不抄 4.64/5.8/7.25，
 * 全部從 `DEFAULT_STAT_NORMALIZATION` 推導。那三個數字已經有三個住處
 * （content/config + Zod DEFAULT + admin SHIPPED）與 drift 測試在守，
 * 抄進來就是第四個住處，必過期而且會用錯誤的訊息紅。
 *
 * ⛔ 也**不驗人數分佈** —— owner 2026-08-12：「極大極小就是為了極端例外而誕生，
 * 不需要考慮平均分佈問題」。這一檔一句「幾個人落在哪一格」都不會有。
 *
 * 突變紀錄（承重那一條，跑過）：
 *   · `registries.ts` 的 `resolveChampionStats(...)` 拆掉 → 「註冊之後移速真的變了」那條紅
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import {
  ARCHETYPES,
  DEFAULT_STAT_NORMALIZATION,
  archetypeOf,
  deriveArchetype,
  resolveChampionStats,
  statNormalizationFromDoc,
} from "./statNormalization";
import { Champions } from "../sim/content/registry";
import { registerAll } from "./registries";
import type { ContentStore } from "./store";
// ⭐ 驗「哪些屬性有三圍來源」時對照**引擎自己的那張表**，⛔ 不抄一份。
import { ATTR_STAT_SOURCE } from "../sim/stats/attributes";
import { Stat } from "../sim/stats/statTypes";
import { HAS_ATTRIBUTE_SOURCE } from "./statNormalization";

const ab = (id: string) => ({
  id,
  name: id,
  icon: "assets/icons/abilities/x.webp",
  description: "測試用",
  slot: id.slice(-1).toUpperCase(),
  castType: "self",
  maxRank: 1,
  cooldown: [10],
  manaCost: [10],
  range: 0,
  effects: [],
});

/** 一位力量主的近戰 → 坦克。 */
const TANK = {
  id: "t.tank",
  schema: "champion@1",
  name: "測試坦",
  role: "fighter",
  attackType: "melee",
  modelKey: "m",
  baseStats: { ms: 99, mr: 99 },
  growth: {},
  // ⚠️ 三圍的成長住在 attributes.*Growth，不是 growth.* —— 夾具要照真實形狀。
  attributes: { str: 30, agi: 10, int: 10, strGrowth: 2, agiGrowth: 0.5, intGrowth: 0.5, primary: "STR", source: "authored" },
  // ⚠️ 四格都要在 —— `expandChampionTemplates` 逐槽讀 `.template`，缺一格就爆。
  abilities: {
    Q: ab("t.tank.q"),
    W: ab("t.tank.w"),
    E: ab("t.tank.e"),
    R: ab("t.tank.r"),
  },
} as const;

function storeOf(docs: Record<string, unknown[]>): ContentStore {
  return { all: (c: string) => docs[c] ?? [] } as unknown as ContentStore;
}

describe("英雄屬性正規化（角色定位 → 級別 → 數字）", () => {
  it("夾具前提：archetype 真的是推導出來的，不是抄 role 欄位", () => {
    cover("stat-normalization");
    // ⚠️ 少了這一條，下面那些在「deriveArchetype 對誰都回同一個值」的實作下也會過。
    expect(deriveArchetype(TANK)).toBe("tank");
    expect(deriveArchetype({ ...TANK, attributes: { str: 10, agi: 10, int: 30, strGrowth: 0, agiGrowth: 0, intGrowth: 0 } })).toBe("mage");
    expect(deriveArchetype({ ...TANK, attributes: { str: 10, agi: 30, int: 10, strGrowth: 0, agiGrowth: 0, intGrowth: 0 } })).toBe("fighter");
    expect(
      deriveArchetype({ ...TANK, attackType: "ranged", attributes: { str: 10, agi: 30, int: 10, strGrowth: 0, agiGrowth: 0, intGrowth: 0 } }),
    ).toBe("marksman");
    // ⛔ role 說 fighter，主屬性說 tank —— 以主屬性為準（role 是匯入時的粗分類）。
    expect(TANK.role).toBe("fighter");
  });

  it("⭐ 註冊之後，英雄卡上的移速真的變成該角色定位那一格的值", () => {
    cover("stat-normalization");
    Champions.clear();
    registerAll(storeOf({ champions: [TANK] }));
    const got = Champions.tryGet("t.tank" as never)?.baseStats as Record<string, number>;
    const cfg = DEFAULT_STAT_NORMALIZATION;
    // 期望值從出貨表推導，⛔ 不抄字面值。
    expect(got.ms).toBe(cfg.bands.ms[cfg.byArchetype.ms.tank]);
    expect(got.ms).not.toBe(99); // 原值真的被換掉了
    // ⚠️ 魔抗**沒有**在 appliesTo 裡（三圍推導與角色定位打架，見那一格的說明），
    //    所以它必須原封不動 —— 這一條同時是「appliesTo 真的被讀了」的守衛。
    expect(cfg.appliesTo).not.toContain("mr");
    expect(got.mr).toBe(99);
  });

  it("legacy 模式原樣返回 —— 這就是「不用部署就能回滾」的意思", () => {
    cover("stat-normalization");
    const legacy = statNormalizationFromDoc({
      schema: "config.stat-normalization@1",
      mode: "legacy",
      appliesTo: ["ms", "mr"],
    });
    const out = resolveChampionStats(TANK as never, legacy) as { baseStats: Record<string, number> };
    expect(out.baseStats.ms).toBe(99);
    expect(out.baseStats.mr).toBe(99);
  });

  it("appliesTo 沒列到的屬性一格都不動 —— 這一版只開了兩項", () => {
    cover("stat-normalization");
    const onlyMs = statNormalizationFromDoc({
      schema: "config.stat-normalization@1",
      mode: "normalized",
      appliesTo: ["ms"],
    });
    const out = resolveChampionStats(TANK as never, onlyMs) as { baseStats: Record<string, number> };
    expect(out.baseStats.mr).toBe(99); // 魔抗沒被開，原封不動
    expect(out.baseStats.ms).not.toBe(99);
  });

  it("英雄卡填了 archetype 就以它為準（推導只是預設值）", () => {
    cover("stat-normalization");
    expect(archetypeOf({ ...TANK, archetype: "mage" })).toBe("mage");
    expect(archetypeOf(TANK)).toBe("tank");
  });

  it("四個角色定位在兩項上都指得到一個存在的格子", () => {
    cover("stat-normalization");
    const cfg = DEFAULT_STAT_NORMALIZATION;
    for (const key of ["ms", "mr"] as const) {
      for (const arc of ARCHETYPES) {
        expect(cfg.bands[key][cfg.byArchetype[key][arc]], `${key}/${arc}`).toBeTypeOf("number");
      }
    }
  });
});

/**
 * 🔴 迴歸守衛：v0.14.0 真的出貨過這兩個缺陷，兩個都是對抗複驗抓到的。
 *
 * ① 級距的三個數字是「等級 1 的**最終值**」，不是 `baseStats` 的欄位值。
 *    魔抗有三圍來源（智慧 ×0.6），直接寫進 `baseStats.mr` 會讓智慧被**加兩次** ——
 *    而且方向剛好相反：莉娜因巴斯（智慧 127）的魔抗會變成全場最高，
 *    但設計說法師最弱。
 * ② 三圍的成長住在 `attributes.strGrowth`，**不是** `growth.str`。
 *    讀錯欄位不會報錯，只會讓 lv10 權重整個變成 no-op。
 *
 * 突變：把 `resolveChampionStats` 的 `- attrPart` 拿掉 → ① 那條紅。
 */
describe("有三圍來源的屬性被擋在門口（v0.14.0 的真缺陷）", () => {
  it("⭐ HAS_ATTRIBUTE_SOURCE 與引擎的 ATTR_STAT_SOURCE 逐格一致 —— 說謊就紅", () => {
    cover("stat-normalization");
    // ⚠️ 那份鏡射是為了避開 content/ → sim/stats/ 的模組初始化循環而存在的，
    //    所以它一定要有一條對照守衛，否則它就是一份會過期的手寫表（第〇·五守則）。
    expect(HAS_ATTRIBUTE_SOURCE.ms).toBe(ATTR_STAT_SOURCE[Stat.MoveSpeed] !== undefined);
    expect(HAS_ATTRIBUTE_SOURCE.mr).toBe(ATTR_STAT_SOURCE[Stat.MagicResist] !== undefined);
  });

  it("⭐ 就算 appliesTo 誤開了魔抗，它也不會被寫壞 —— 只會沒反應", () => {
    cover("stat-normalization");
    const cfg = DEFAULT_STAT_NORMALIZATION;
    const withMr = { ...cfg, appliesTo: ["ms", "mr"] as const };
    const out = resolveChampionStats(TANK as never, withMr) as { baseStats: Record<string, number> };
    expect(out.baseStats.mr).toBe(99); // 原封不動
    expect(out.baseStats.ms).toBeCloseTo(cfg.bands.ms[cfg.byArchetype.ms.tank], 6);
  });

  it("出貨的 appliesTo 沒有把魔抗開起來", () => {
    cover("stat-normalization");
    expect(DEFAULT_STAT_NORMALIZATION.appliesTo).not.toContain("mr");
  });
});
