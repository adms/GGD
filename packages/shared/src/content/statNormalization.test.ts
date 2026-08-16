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
  ORIGINS,
  archetypeOf,
  deriveArchetype,
  resolveChampionStats,
  statNormalizationFromDoc,
} from "./statNormalization";
import { Champions } from "../sim/content/registry";
import { registerAll } from "./registries";
import type { ContentStore } from "./store";
import type { NormalizedStatKey } from "./statNormalization";

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
  baseStats: { ms: 99, mr: 99, armor: 99 },
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
    // ⚠️ 魔抗**有**在 appliesTo 裡，但它走 growth 通道，所以 `baseStats.mr`
    //    必須原封不動 —— 這一條同時是「channel 真的被讀了」的守衛。
    expect(cfg.channel.mr).toBe("growth");
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
describe("成長通道：定位驅動的東西寫 growth，個性留在 baseStats", () => {
  const cfg = DEFAULT_STAT_NORMALIZATION;

  it("⭐ 魔抗/裝甲走 growth，而且 L1 一格都不動 —— 那正是「初始＝個性」", () => {
    cover("stat-normalization");
    Champions.clear();
    registerAll(storeOf({ champions: [TANK] }));
    const got = Champions.tryGet("t.tank" as never) as unknown as {
      baseStats: Record<string, number>; growth: Record<string, number>;
    };
    // ⚠️ 走 growth 的兩項，`baseStats` 必須原封不動（作者填的個性）。
    for (const key of ["mr", "armor"] as const) {
      expect(cfg.channel[key], key).toBe("growth");
      expect(got.baseStats[key], key).toBe(99);
      expect(got.growth[key], key).toBeTypeOf("number");
    }
    // 走 baseStats 的那一項照舊被換掉。
    expect(cfg.channel.ms).toBe("baseStats");
    expect(got.baseStats.ms).not.toBe(99);
  });

  it("⭐ 反解真的把三圍那一項減掉了 —— 智慧翻倍，解出的魔抗成長就要變小", () => {
    cover("stat-normalization");
    // ⚠️ 這一條是承重的：少了反解，三圍會被加第二次（v0.14.0 的真缺陷），
    //    而那個版本在**任何**斷言下都長得跟正確的一樣，因為它不會報錯。
    const deps = {
      // 一個最小的假引擎：最終值 = baseStats + int × 0.6 + growth × (L−1)
      statAt: (def: unknown, key: NormalizedStatKey, level: number): number => {
        const d = def as { baseStats?: Record<string, number>; growth?: Record<string, number>; attributes?: Record<string, number> };
        const coef = key === "mr" ? 0.6 : 0;
        return (d.baseStats?.[key] ?? 0) + (d.attributes?.int ?? 0) * coef + (d.growth?.[key] ?? 0) * (level - 1);
      },
    };
    // ⚠️ 要看得到反解的方向就不能被 0 夾住 —— 這裡開 allowNegativeGrowth，
    //    那正是那一格欄位存在的理由（出貨 false 是**政策**，不是機制限制）。
    const openCfg = { ...cfg, allowNegativeGrowth: true };
    // ⚠️ 這一條只能動**一個**變因。智慧從 10 提到 200 會讓這張卡從坦克翻成法師，
    //    而出身換了級距也跟著換 —— 那樣測到的是「級距不同」不是「反解有沒有做」。
    //    ⭐ 所以把十個出身的魔抗全部釘成同一格，目標值就恆定，剩下的只有反解。
    //    （referenceLevel=18 時這條碰巧還是綠的，改成 99 之後才露出來。）
    const flat = {
      ...openCfg,
      byOrigin: { ...openCfg.byOrigin, mr: Object.fromEntries(ORIGINS.map((o) => [o, "中"])) },
    } as typeof openCfg;
    const solve = (int: number): number => {
      const doc = { ...TANK, attributes: { ...TANK.attributes, int } };
      const out = resolveChampionStats(doc as never, flat, deps) as { growth: Record<string, number> };
      return out.growth.mr!;
    };
    expect(solve(200)).toBeLessThan(solve(10));
  });

  it("🔴 雙尺屬性走哪一把尺由**出身**決定 —— ⛔ 不是卡上的 attackType", () => {
    cover("stat-normalization");
    // ⚠️ 這一條是這一批承重的那條線。缺陷形態是**第②號**：用 attackType 選尺，
    //    出貨資料裡 10/49 位會靜靜落在差 5 倍的量級上（藏馬 melee 卻該構 8.2、
    //    皮卡娘 ranged 卻只該打 1.4），而且不會有任何東西報錯。
    // ⭐ 所以每一格出身都用**相反**的 attackType 建卡 —— 尺標若改讀 attackType，
    //    十格會全部翻到另一把尺上，這條就紅。
    const N = DEFAULT_STAT_NORMALIZATION;
    for (const key of N.appliesTo) {
      const scales = N.scaleByOrigin[key];
      const ladders = N.bandsByScale[key];
      if (!scales || !ladders) continue; // 這一項不是雙尺 —— ⛔ 不寫死是哪一項
      expect(N.channel[key]).toBe("baseStats"); // 下面讀 baseStats 才有意義
      for (const org of ORIGINS) {
        const scale = scales[org];
        const band = N.byOrigin[key][org];
        if (!scale || !band) continue;
        const out = resolveChampionStats(
          { ...TANK, origin: org, attackType: scale === "melee" ? "ranged" : "melee" } as never,
          N,
        ) as { baseStats: Record<string, number> };
        expect(`${org}=${out.baseStats[key]}`).toBe(`${org}=${ladders[scale][band]}`);
      }
    }
  });

  it("沒注入 deps 時 growth 通道什麼都不做 —— fail-safe，⛔ 不猜", () => {
    cover("stat-normalization");
    const out = resolveChampionStats(TANK as never, cfg) as { growth: Record<string, number> };
    expect(out.growth?.mr).toBeUndefined();
  });
});
