/**
 * ⭐【速度成長五級距 —— 級別要真的變成成長，而這一版**一格平衡都沒動**】
 *
 * owner 2026-08-21：「請你給我**移動速度及攻擊速度 每級成長五級距**」。
 *
 * ⚠️ 斷言讀的是 **`registerAll` 之後的註冊表**，⛔ 不是直接呼叫
 * `resolveSpeedGrowthTiers` —— 後者對「模組寫對了但沒有人接上去」是綠的
 *（失敗形態⑤：被測的不是出貨的那個）。註冊表是選人畫面／商店／後台／文件
 * 產生器共同讀的那一份，所以它綠 = 玩家真的拿得到。
 *
 * ⚠️ 級距值從 `DEFAULT_SPEED_GROWTH_TIERS` 推導，⛔ 不抄字面值也不從
 * `content/config/` 讀（那樣會變成「產生器跟它自己比對」）。
 *
 * 突變紀錄（承重的那一條）：
 *   · `registries.ts` 拿掉 `resolveSpeedGrowthTiers(…)` 那一層 → ① 紅，49 位全中。
 *   · 把 `godie-e001.json` 的 `asGrowthTier` 改成「極大」→ ② 紅並指名它
 *     （級別解析出 0.05，卡上原值是 0.02 ⇒ 那是一次平衡改動，
 *      而這一版 `requireAuthoredParity` 宣告了零改動）。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { registerAll } from "./registries";
import { Champions } from "../sim/content/registry";
import { balancePopulationDocs, balancePopulationIds } from "../../testkit/balancePopulation";
import {
  DEFAULT_SPEED_GROWTH_TIERS,
  SPEED_GROWTH_AXES,
  SPEED_GROWTH_TIER_FIELD,
  resolveSpeedGrowthTiers,
  speedGrowthTableOf,
  speedGrowthTiersFromDoc,
  type SpeedGrowthTierName,
} from "./speedGrowthTiers";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(REPO, "content");

describe("速度成長五級距（owner 2026-08-21）", () => {
  it("① 級別解析成級距表的值，而且 ② 出貨 49 位解析後與卡上原值逐位元相同", async () => {
    const loaded = await new ContentLoader(new FsContentSource(CONTENT)).load();
    registerAll(loaded.store);

    // ⚠️ 出貨那一份文件決定「哪一把梯子生效」與「這一版有沒有宣告零改動」，
    //    但**數字**仍然從 DEFAULT_* 拿 —— 兩者之間另有 drift 測試在守。
    const shipped = speedGrowthTiersFromDoc(loaded.store.get("config", "speed-growth-tiers"));
    const table = speedGrowthTableOf({ ...shipped, growth: DEFAULT_SPEED_GROWTH_TIERS.growth });

    const ids = balancePopulationIds(REPO);
    const cards = balancePopulationDocs(REPO);
    // 守衛的守衛：一位都沒填的話下面兩條會**空轉成綠**。
    expect(ids.length, "母體讀壞了").toBeGreaterThan(0);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const card = cards[i] as Record<string, unknown>;
      const authored = (card["growth"] ?? {}) as Record<string, number>;
      const live = Champions.get(id as never) as unknown as { growth?: Record<string, number> };

      for (const axis of SPEED_GROWTH_AXES) {
        const tier = card[SPEED_GROWTH_TIER_FIELD[axis]] as SpeedGrowthTierName | undefined;
        expect(tier, `${id} 沒有填 ${SPEED_GROWTH_TIER_FIELD[axis]} —— 跑 pnpm speedtiers:build`).
          toBeTruthy();

        // ① 註冊表上的成長 = 級距表的值（⛔ 不是卡上的原值也不是 0）。
        expect(
          live.growth?.[axis] ?? 0,
          `${id}.growth.${axis} 沒有被級別蓋過去 —— registries.ts 的接縫斷了`,
        ).toBe(table[axis][tier!]);

        // ② 零平衡改動的證明（有宣告才驗，見 requireAuthoredParity 的欄位說明）。
        if (shipped.requireAuthoredParity) {
          expect(
            table[axis][tier!],
            `${id} 的「${tier}」解析出 ${table[axis][tier!]}，卡上原值是 ${authored[axis] ?? 0}` +
              ` —— 那是一次平衡改動，而這一版宣告了零改動。要嘛改回來，` +
              `要嘛把 config.speed-growth-tiers@1 的 requireAuthoredParity 關掉。⛔ 不要改這條測試。`,
          ).toBe(authored[axis] ?? 0);
        }
      }
    }
  });

  it("③ 總開關關掉 = 一鍵回到卡上的原值（rollback 真的走得通）", () => {
    const card = { growth: { ms: 0, as: 0.02 }, msGrowthTier: "極大", asGrowthTier: "極大" };
    const on = speedGrowthTableOf(DEFAULT_SPEED_GROWTH_TIERS);
    expect(
      resolveSpeedGrowthTiers(card, { ...DEFAULT_SPEED_GROWTH_TIERS, enabled: false }).growth,
    ).toEqual({ ms: 0, as: 0.02 });
    // 開著就會蓋過去 —— ⛔ 沒有這一半，上面那條對「機制整個沒接上」也是綠的。
    expect(resolveSpeedGrowthTiers(card, DEFAULT_SPEED_GROWTH_TIERS).growth).toEqual({
      ms: on.ms["極大"],
      as: on.as["極大"],
    });
    expect(on.ms["極大"]).toBeGreaterThan(0);
  });
});
