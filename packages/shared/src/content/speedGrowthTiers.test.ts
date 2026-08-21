/**
 * ⭐【速度成長五級距 —— 級別要真的變成成長，而這一版**一格平衡都沒動**】
 *
 * owner 2026-08-21：「請你給我**移動速度及攻擊速度 每級成長五級距**」。
 *
 * ⚠️ 斷言讀的是 **`registerAll` 之後的註冊表**，⛔ 不是直接呼叫
 * `resolveSpeedGrowthTiers` —— 後者對「模組寫對了但沒有人接上去」是綠的
 *（失敗形態⑤：被測的不是出貨的那個）。
 *
 * 🔴 **這裡有一個陷阱，而它是「零平衡改動」自己造成的**：
 * 出貨 49 位的級別解析出來**等於**他們卡上的原值，所以「接縫接上了」與
 * 「接縫斷了」在出貨內容上**看起來一模一樣** —— 只掃 49 張卡的斷言對
 * 「把 `registries.ts` 那一層拿掉」是**綠的**（實測，2026-08-21）。
 * ⇒ 所以第 ② 條**故意往 store 裡塞一位級別與原值不同的英雄**再跑一次註冊：
 * 那是唯一能分辨兩者的形狀，也是這一批真正承重的那條線。
 *
 * ⚠️ 級距值從 `DEFAULT_SPEED_GROWTH_TIERS` 推導，⛔ 不抄字面值也不從
 * `content/config/` 讀（那樣會變成「產生器跟它自己比對」）。
 *
 * 突變紀錄：
 *   · `registries.ts` 拿掉 `resolveSpeedGrowthTiers(…)` 那一層 → ② 紅
 *     （① 仍然綠 —— 見上面那一段，那正是它存在的理由）。
 *   · 把 `godie-e001.json` 的 `asGrowthTier` 改成「極大」→ ① 紅並指名它
 *     （解析出 0.05、卡上原值 0.02 ⇒ 一次平衡改動，而這一版宣告了零改動）。
 *     ⭐ `pnpm speedtiers:check` 同一個突變也非零離開。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { registerAll } from "./registries";
import { Champions } from "../sim/content/registry";
import type { ContentStore } from "./store";
import { balancePopulationDocs, balancePopulationIds } from "../../testkit/balancePopulation";
import {
  DEFAULT_SPEED_GROWTH_TIERS,
  SPEED_GROWTH_AXES,
  SPEED_GROWTH_TIER_NAMES,
  SPEED_GROWTH_TIER_FIELD,
  speedGrowthTableOf,
  speedGrowthTiersFromDoc,
  type SpeedGrowthTierName,
  type SpeedGrowthTiers,
} from "./speedGrowthTiers";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(REPO, "content");
const growthOf = (id: string): Record<string, number> =>
  (Champions.get(id as never) as unknown as { growth?: Record<string, number> }).growth ?? {};

let store: ContentStore;
let shipped: SpeedGrowthTiers;
/** ⚠️ 開關與梯子選擇讀出貨文件，**數字**讀 `DEFAULT_*` —— 兩者另有 drift 測試在守。 */
let table: ReturnType<typeof speedGrowthTableOf>;

beforeAll(async () => {
  store = (await new ContentLoader(new FsContentSource(CONTENT)).load()).store;
  registerAll(store);
  shipped = speedGrowthTiersFromDoc(store.get("config", "speed-growth-tiers"));
  table = speedGrowthTableOf({ ...shipped, growth: DEFAULT_SPEED_GROWTH_TIERS.growth });
});

describe("速度成長五級距（owner 2026-08-21）", () => {
  it("① 出貨 49 位都填了級別，而且解析後與卡上原值逐位元相同（零平衡改動）", () => {
    const ids = balancePopulationIds(REPO);
    const cards = balancePopulationDocs(REPO);
    expect(ids.length, "母體讀壞了 —— 下面的迴圈會空轉成綠").toBeGreaterThan(0);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const card = cards[i] as Record<string, unknown>;
      const authored = (card["growth"] ?? {}) as Record<string, number>;
      for (const axis of SPEED_GROWTH_AXES) {
        const tier = card[SPEED_GROWTH_TIER_FIELD[axis]] as SpeedGrowthTierName | undefined;
        expect(
          tier,
          `${id} 沒有填 ${SPEED_GROWTH_TIER_FIELD[axis]} —— 跑 \`pnpm speedtiers:build\``,
        ).toBeTruthy();
        if (!shipped.requireAuthoredParity) continue;
        expect(
          table[axis][tier!],
          `${id} 的「${tier}」解析出 ${table[axis][tier!]}，卡上原值是 ${authored[axis] ?? 0}` +
            ` —— 那是一次平衡改動，而這一版宣告了零改動。要嘛改回來，要嘛把` +
            ` config.speed-growth-tiers@1 的 requireAuthoredParity 關掉。⛔ 不要改這條測試。`,
        ).toBe(authored[axis] ?? 0);
        // 註冊表上就是這個值（出貨的那條路，⛔ 不是模組的單元測試）。
        expect(growthOf(id)[axis] ?? 0).toBe(table[axis][tier!]);
      }
    }
  });

  it("② 級別與原值不同的那一位，註冊表上跑的是**級別** —— 接縫真的接上了", () => {
    // ⛔ 出貨內容分辨不出「接縫斷了」（兩邊同值），所以這裡自己造一位。
    const top = SPEED_GROWTH_TIER_NAMES[SPEED_GROWTH_TIER_NAMES.length - 1]!;
    const seed = balancePopulationDocs(REPO)[0] as Record<string, unknown>;
    const probe = {
      ...seed,
      id: "godie-speedtier-probe",
      growth: { ...((seed["growth"] ?? {}) as Record<string, number>), ms: 0, as: 0 },
      [SPEED_GROWTH_TIER_FIELD.ms]: top,
      [SPEED_GROWTH_TIER_FIELD.as]: top,
    };
    store.add("champions", probe.id, probe);
    registerAll(store);

    for (const axis of SPEED_GROWTH_AXES) {
      expect(table[axis][top], "夾具前提：頂格必須與探針的原值 0 不同").toBeGreaterThan(0);
      expect(
        growthOf(probe.id)[axis] ?? 0,
        `growth.${axis} 沒有被級別蓋過去 —— registries.ts 的接縫斷了（級別欄位還在卡上、` +
          `後台還畫得出來、49 位還是綠的，而引擎跑的是原值）`,
      ).toBe(table[axis][top]);
    }
  });
});
