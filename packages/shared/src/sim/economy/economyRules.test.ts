/**
 * ⭐⭐ 商店與頂點路線的四個量值 —— ⛔ 在此之前**只有改程式碰得到**。
 *
 * ⚠️ 這一族在 CLAUDE.md 裡是**被逐字點名的寫死前科**：
 *   > `CAPSTONE_ROUND_GATE = 6` ⇒ 實打每場只有 5–6 回合 → #82 的 7,500 金頂點
 *   > 路線**永遠開不了**；`STAT_TICK_TARGET = 20` ⇒ 兩個常數乘起來變成不可能。
 *
 * ⭐ 所以這條守衛問的**正是那件事**：把回合閘調成 0，第 1 回合就開得了嗎？
 * ⛔ 不是「那個欄位存在嗎」（失敗形態⑦）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `statPath.ts` 的 `world.round >= economyRules(world).capstoneRoundGate`
 *     改回 `>= 6` → 🔴（①：閘調成 0 而第 1 回合仍然關著）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { capstoneRoundReached, statPathView } from "./statPath";
import { DEFAULT_ECONOMY, normalizeEconomyRules } from "./economyRules";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIPPED = JSON.parse(
  readFileSync(join(HERE, "../../../../../content/config/config.match.json"), "utf8"),
) as { economy?: unknown };

describe("⭐ 商店與頂點路線住在設定裡（⛔ 不是模組層常數）", () => {
  it("★ ⭐ 回合閘調成 0 ⇒ **第 1 回合就解得開**（CLAUDE.md 逐字點名的前科）", () => {
    const shut = new SimWorld(SKELETON_ARENA, 1);
    shut.round = 1;
    expect(
      capstoneRoundReached(shut),
      "出貨閘是 6，第 1 回合本來就該是關著的（儀器：⛔ 這條先證明它真的會關）",
    ).toBe(false);

    const open = new SimWorld(SKELETON_ARENA, 1);
    open.round = 1;
    open.economy = normalizeEconomyRules({ capstoneRoundGate: 0 });
    expect(
      capstoneRoundReached(open),
      "⛔⛔ 回合閘設成 0 而第 1 回合**還是關著**\n" +
        "⇒ ⭐ `economy.capstoneRoundGate` **沒有真的接到** `capstoneRoundReached()` 上\n" +
        "⇒ 那一格在後台改得到、存得起來、⛔ 而遊戲裡什麼都不會變。",
    ).toBe(true);
  });

  it("★ ⭐ 目標次數調小 ⇒ **面板上的分母跟著變**（⛔ 不是永遠印 20）", () => {
    expect(statPathView(0, 0).target, "缺席 ⇒ 出貨值").toBe(DEFAULT_ECONOMY.statTickTarget);
    const v = statPathView(3, 0, 5);
    expect(v.target, "⛔ 分母沒有跟著設定走").toBe(5);
    expect(v.remaining, "剩餘 = 目標 − 已買").toBe(2);
  });

  it("⭐ 出貨值**逐位元不變** —— 搬的是住處，⛔ 不是行為", () => {
    expect(
      normalizeEconomyRules(SHIPPED.economy),
      "⛔ 出貨 JSON 解析出來的四格與 `DEFAULT_ECONOMY` 不一樣 ⇒ 這一次搬家改到了行為",
    ).toEqual(DEFAULT_ECONOMY);
  });

  it("⭐ 上下界擋得住誤打 —— ⛔ 0 次精粹不是「便宜」，是機制消失", () => {
    expect(normalizeEconomyRules({ statTickTarget: 0 }).statTickTarget).toBe(1);
    expect(normalizeEconomyRules({ capstoneRoundGate: -5 }).capstoneRoundGate).toBe(0);
    expect(normalizeEconomyRules({ statTickPrice: "375" }).statTickPrice).toBe(
      DEFAULT_ECONOMY.statTickPrice,
    );
  });
});
