/**
 * ⭐【速度成長五級距 —— 級別要真的變成成長，而原值不可以在旁邊說另一句話】
 *
 * owner 2026-08-21：「請你給我**移動速度及攻擊速度 每級成長五級距**」。
 *
 * ⚠️ **2026-08-21 改寫過一次，理由要記著**：這一條原本斷言「解析後與卡上原值
 * 逐位元相同」，並且把那件事叫做「**這一版零平衡改動**」。當天下午 owner 的架構
 * 裁決（「廢掉三屬性 純用十出身的五級距表來代表每級屬性成長」）把 49 位的
 * `growth.as` 重推導了，於是那條斷言紅了。
 *
 * ⛔ 而「前提沒了所以放寬它」是**錯的解法** —— owner 逐字說過「**我沒這樣說過**」：
 * 他要的是一次**架構**改動，那些 ±80% 是它的**後果**，⛔ 不是他點的菜。
 * ⇒ 正確的形狀是把它從「斷言零差異」換成「**如實報告差異**」：
 * 每一處差異都要有一條具名的軸（{@link SPEED_GROWTH_PARITY_DRIFT}）帶著理由，
 * 而差異本身會被**逐位印出來拿給 owner 看**。⛔ 沒有具名的差異一筆都不准。
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
 *   · `registries.ts` 拿掉 `resolveSpeedGrowthTiers(…)` 那一層 → ①②**都**紅
 *     （改寫之後 ① 也讀註冊表，所以接縫斷掉不再只有 ② 抓得到）。
 *   · 把 `SPEED_GROWTH_PARITY_DRIFT` 的 `as` 那一筆刪掉 → ① 紅並逐位列出 49 位。
 *   · 把 `ms` 的漂移做出來（改一位的 `msGrowthTier`）→ ① 紅，因為 `ms` 不在清單上。
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
  SPEED_GROWTH_PARITY_DRIFT,
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
  it("① 出貨 49 位都填了級別，而且原值與級別的每一處差異都具名列出來", () => {
    const ids = balancePopulationIds(REPO);
    const cards = balancePopulationDocs(REPO);
    expect(ids.length, "母體讀壞了 —— 下面的迴圈會空轉成綠").toBeGreaterThan(0);

    /** 具名清單上那幾條軸，每一條真的漂了幾位（反向斷言用）。 */
    const drifted: Record<string, string[]> = {};
    /** ⛔ 沒有具名的漂移 —— 一筆都不准。 */
    const unlisted: string[] = [];

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
        // ⭐ 承重的那一半：註冊表上跑的**就是級別**（出貨的那條路，⛔ 不是模組的
        //    單元測試）。它與下面的漂移報告無關 —— 漂移是「原值說了另一句話」，
        //    這一條是「引擎跑的是哪一句」，⛔ 任何情況下都不放寬。
        expect(
          growthOf(id)[axis] ?? 0,
          `${id} 的 growth.${axis} 不是級別解析出來的值 —— registries.ts 的接縫斷了`,
        ).toBe(table[axis][tier!]);

        if (!shipped.requireAuthoredParity) continue;
        const raw = authored[axis] ?? 0;
        const resolved = table[axis][tier!];
        if (raw === resolved) continue;
        const pct = raw === 0 ? "∞" : `${(((resolved - raw) / raw) * 100).toFixed(1)}%`;
        const line = `${id}：卡上 ${raw} → 級別「${tier}」${resolved}（${pct}）`;
        if (SPEED_GROWTH_PARITY_DRIFT[axis] === undefined) unlisted.push(`${axis} · ${line}`);
        else (drifted[axis] ??= []).push(line);
      }
    }

    // ⭐ ① 沒有具名理由的漂移一筆都不准。⛔ 修法不是把它加進清單了事 ——
    //    清單上的每一筆都要能被反駁，而且它是**拿給 owner 看**的東西。
    expect(
      unlisted,
      "有軸的原值與級別說了兩句話，而它不在 SPEED_GROWTH_PARITY_DRIFT 上。\n" +
        "⛔ 不要改這條測試、⛔ 不要關掉 requireAuthoredParity —— 要嘛把值收回來，\n" +
        "要嘛把那條軸連同**一個能被反駁的理由**寫進 speedGrowthTiers.ts 的具名清單。",
    ).toEqual([]);

    // ⭐ ② 反向：清單上的軸必須**真的還在漂**。收乾淨了就要刪掉那一筆，
    //    ⛔ 不可以留著變成一條沒有人讀的豁免。
    for (const [axis, why] of Object.entries(SPEED_GROWTH_PARITY_DRIFT)) {
      expect(
        (drifted[axis] ?? []).length,
        `SPEED_GROWTH_PARITY_DRIFT 上的「${axis}」已經不漂了 —— 刪掉那一筆。理由欄寫著：\n${why}`,
      ).toBeGreaterThan(0);
    }

    // ⭐ ③ 把差異**逐位印出來**。這不是除錯輸出 —— 這份清單存在的唯一理由就是
    //    讓 owner 看得到那幾個百分比，然後由他決定要不要。
    for (const [axis, lines] of Object.entries(drifted)) {
      // eslint-disable-next-line no-console
      console.warn(
        `\n[速度成長級距] ⚠️ 「${axis}」有 ${lines.length} 位的原值與級別不同（具名待裁決）：\n` +
          `  理由：${SPEED_GROWTH_PARITY_DRIFT[axis]}\n` +
          lines.map((l) => `    · ${l}`).join("\n"),
      );
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
