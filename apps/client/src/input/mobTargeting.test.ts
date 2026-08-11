/**
 * 🔴 GH#315 —— 殭屍點得到，而且不會搶走手把的瞄準。
 *
 * owner 2026-08-11 線上實測：「我無法點選敵方單位攻擊，然後固定會一直攻擊
 * （並沒有顯示嘲諷或混亂、暴走等改變攻擊目標的狀態）嚴重影響遊戲!!!」
 *
 * 根因：`GameApp.enemyUnitsFor` 的過濾器只列了 KIND_CHAMPION / GUARDIAN / FLOWER
 * —— #215 的殭屍波是在它之後才上架的。三條輸入路徑（滑鼠 pickEnemyAt、
 * 手把 pickNearestUnit、觸控自動取得）**共用**那一份清單，所以任何裝置都指不到殭屍。
 *
 * ⚠️ 這裡驗的是**選取數學**（`Picking.ts`），不是 GameApp 的那一行過濾器 ——
 * GameApp 要 Babylon 才起得來。過濾器那一行由 `apps/client` 的既有整合測試與
 * typecheck 守著；這裡守的是「加了 priority 之後，兩種選取各自還是對的」，
 * 也就是那一行改對了之後**行為真的是我要的**（失敗形態④：斷言方向要對得上缺陷）。
 *
 * 突變紀錄：
 *   · `pickNearestUnit` 的 `score += (u.priority ?? 0) * MOB_AIM_ASSIST_PENALTY`
 *     拿掉 → 「手把瞄準讓路給英雄」那條紅
 *   · `pickUnit` 改成也讀 priority → 「滑鼠點殭屍就是殭屍」那條紅
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MOB_AIM_ASSIST_PENALTY, pickNearestUnit, pickUnit } from "./Picking";

const HERO = { id: 1, x: 10, z: 0, radius: 0.6, priority: 0 };
/** 殭屍：比英雄近，但只近一點點 —— 少於 MOB_AIM_ASSIST_PENALTY。 */
const MOB_NEAR = { id: 2, x: 8, z: 0, radius: 0.6, priority: 1 };
/** 貼臉的殭屍：近到超過懲罰值，該搶得走瞄準。 */
const MOB_ONTOP = { id: 3, x: 1, z: 0, radius: 0.6, priority: 1 };

describe("殭屍可以被指定攻擊（GH#315）", () => {
  it("⭐ 滑鼠直接點殭屍 = 打那隻殭屍 —— priority 一格都不准參與", () => {
    cover("mob-manual-target");
    // 點在殭屍身上：英雄也在清單裡，但游標壓的是殭屍。
    expect(pickUnit({ x: 8, z: 0 }, [HERO, MOB_NEAR])).toBe(MOB_NEAR.id);
    // ⚠️ 反向也要成立，否則「永遠回殭屍」的實作也會過（失敗形態④）。
    expect(pickUnit({ x: 10, z: 0 }, [HERO, MOB_NEAR])).toBe(HERO.id);
  });

  it("⭐ 手把的自動瞄準讓路給英雄 —— 除非殭屍真的貼臉", () => {
    cover("mob-manual-target");
    const from = { x: 0, z: 0 };
    // 殭屍近 2 個單位，但懲罰是 6 → 英雄贏。
    expect(pickNearestUnit(from, [HERO, MOB_NEAR], 99)).toBe(HERO.id);
    // 貼臉的殭屍近了 9 個單位 → 它贏，否則玩家會打不到腳邊的東西。
    expect(pickNearestUnit(from, [HERO, MOB_ONTOP], 99)).toBe(MOB_ONTOP.id);
  });

  it("夾具前提：懲罰值真的落在這兩個距離之間，否則上面那條驗不到東西", () => {
    cover("mob-manual-target");
    expect(MOB_AIM_ASSIST_PENALTY).toBeGreaterThan(10 - 8);
    expect(MOB_AIM_ASSIST_PENALTY).toBeLessThan(10 - 1);
  });
});
