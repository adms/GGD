/**
 * AoE 四級距 —— 「填級別」真的會變成「打得到那麼遠」。
 *
 * ⚠️ 驗的是**機制**不是數字（第二守則）：斷言不抄 3/4.5/6/8，
 * 而是從 `DEFAULT_AOE_TIERS` 推導。那四個數字已經有三個住處
 * （content/config + Zod DEFAULT + admin SHIPPED）與 drift 測試在守，
 * 抄進來就是第四個住處，必過期而且用錯誤的訊息紅。
 *
 * 突變紀錄（承重那一條）：
 *   · `registries.ts` 的 `withRadiusTier(...)` 拆掉（回到只 `expandIfTemplated`）
 *     → 「註冊之後 radius 真的變成級距值」那條紅。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { AOE_TIER_NAMES, DEFAULT_AOE_TIERS, aoeTiersFromDoc, resolveRadiusTier } from "./aoeTiers";
import { Abilities } from "../sim/content/registry";
import { registerAll } from "./registries";
import type { ContentStore } from "./store";

/** 一支只填級別、不填數字的技能 —— 這正是 owner 要的寫法。 */
const TIERED = {
  id: "t.aoe",
  schema: "ability@1",
  name: "級距技",
  slot: "Q",
  castType: "ground",
  maxRank: 1,
  cooldown: [10],
  manaCost: [10],
  range: 5,
  radiusTier: "中",
  effects: [],
} as const;

function storeOf(docs: Record<string, unknown[]>): ContentStore {
  return { all: (c: string) => docs[c] ?? [] } as unknown as ContentStore;
}

describe("AoE 四級距", () => {
  it("⭐ 註冊之後 radius 真的變成級距表裡的值 —— 而且不是我自己算的", () => {
    cover("aoe-tiers");
    Abilities.clear();
    registerAll(storeOf({ abilities: [TIERED] }));
    // 期望值從出貨表推導，⛔ 不抄字面值。
    expect(Abilities.tryGet("t.aoe" as never)?.radius).toBe(DEFAULT_AOE_TIERS.radius["中"]);
  });

  it("後台把「中」調大，同一支技能就跟著變 —— 這就是它只有一個住處的意思", () => {
    cover("aoe-tiers");
    const bigger = DEFAULT_AOE_TIERS.radius["中"] + 2;
    Abilities.clear();
    registerAll(
      storeOf({
        abilities: [TIERED],
        config: [
          {
            id: "aoe-tiers",
            schema: "config.aoe-tiers@1",
            enabled: true,
            radius: { ...DEFAULT_AOE_TIERS.radius, 中: bigger },
          },
        ],
      }),
    );
    expect(Abilities.tryGet("t.aoe" as never)?.radius).toBe(bigger);
  });

  it("級別贏過手寫 radius —— 反過來的話這個機制會對那支技能靜默失效", () => {
    cover("aoe-tiers");
    const out = resolveRadiusTier({ radius: 99, radiusTier: "小" }, DEFAULT_AOE_TIERS);
    expect(out.radius).toBe(DEFAULT_AOE_TIERS.radius["小"]);
  });

  it("止血閥關掉 = 級別不解析；沒填級別的技能一格都不動", () => {
    cover("aoe-tiers");
    const off = aoeTiersFromDoc({ schema: "config.aoe-tiers@1", enabled: false });
    expect(resolveRadiusTier({ radius: 99, radiusTier: "小" }, off).radius).toBe(99);
    expect(resolveRadiusTier({ radius: 99 }, DEFAULT_AOE_TIERS).radius).toBe(99);
  });

  it("四個級別由小到大 —— 一把尺的刻度不可以亂序", () => {
    cover("aoe-tiers");
    const r = AOE_TIER_NAMES.map((n) => DEFAULT_AOE_TIERS.radius[n]);
    expect(r).toEqual([...r].sort((a, b) => a - b));
    expect(new Set(r).size).toBe(r.length);
  });
});
