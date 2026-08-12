/**
 * 出身 × 路線 在選角畫面上的守衛。
 *
 * 驗的是**機制**，⛔ 不是數字：
 *   ① 文案真的從**內容**（`config.origin-routes@1`）來 —— 這是承重的那一條線。
 *      owner 改一個路線名不應該要一次部署（第一守則），而「改成讀寫死常數」
 *      這個退化**在畫面上長得一模一樣**（出貨文案就是那份常數）。
 *   ② 三圍缺席 → 不畫，⛔ 不是捏一個「坦克」出來（`originOf` 對全 0 的卡會安靜地
 *      回坦克 —— 那個謊今天看不見，因為出貨的 78 位都有三圍）。
 *
 * ⛔ 這裡不斷言「坦克有 4 條路線」「tagline 是哪一句」之類的出貨值 ——
 * 那些住在 `content/config/origin-routes.json` 且 owner 隨時會改（第零守則）。
 *
 * 突變紀錄：
 *   · `originBadge.ts` 的 `contentOriginRoutes()` 改成 `return DEFAULT_ORIGIN_ROUTES`
 *     （＝整個後台文案通道消失、退回寫死常數）→ 紅：
 *     `expected '站得住的那一種 —— 血厚甲厚，跑得慢。' to be '後台改過的一句話。'`
 */
import { describe, it, expect, afterEach } from "vitest";
import { Configs } from "@ggd/shared/content";
import { ORIGIN_ROUTES_DOC_ID } from "@ggd/shared/content/originRoutes";
import { originBadgeForChampion, originBadgeFrom, contentOriginRoutes } from "./originBadge";

/** 力量主 · 近戰 = 坦克（`originOf` 用 lv10 權重＝初始 + 成長×9）。 */
const tankish = { attackType: "melee", attributes: { str: 30, agi: 10, int: 8 } };

const restore = Configs.tryGet(ORIGIN_ROUTES_DOC_ID);

afterEach(() => {
  // ⚠️ 沒有 restore 時**不能什麼都不做** —— 上一條註冊的假文案會留著。
  //    空文件（schema 不符）→ `originRoutesFromDoc` 整份退回出貨值。
  Configs.register(restore ?? ({ id: ORIGIN_ROUTES_DOC_ID, schema: "none" } as never));
});

describe("選角畫面的出身 × 路線", () => {
  it("⭐ 出身名／一句話／路線清單全部從內容讀 —— ⛔ 不是客戶端常數", () => {
    Configs.register({
      id: ORIGIN_ROUTES_DOC_ID,
      schema: "config.origin-routes@1",
      origins: {
        坦克: {
          rule: "力量主 · 近戰",
          tagline: "後台改過的一句話。",
          routes: [
            { name: "龜殼", summary: "s", gain: "g", lose: "l" },
            { name: "反噬", summary: "s", gain: "g", lose: "l" },
          ],
        },
      },
    } as never);

    const badge = originBadgeForChampion(tankish);
    expect(badge?.origin).toBe("坦克");
    expect(badge?.tagline).toBe("後台改過的一句話。");
    expect(badge?.routesLine).toBe("龜殼 · 反噬");
    // 夾具前提：這兩個值不等於出貨文案，否則對「讀寫死常數」的實作也會過。
    expect(contentOriginRoutes().坦克.routes[0]?.name).not.toBe("鐵壁");
  });

  it("沒被覆蓋的出身仍拿得到文案 —— ⛔ 半份覆蓋層不會把其餘 9 格清空", () => {
    const badge = originBadgeForChampion({ attackType: "ranged", attributes: { str: 8, agi: 10, int: 30 } });
    expect(badge?.origin).toBe("法師");
    expect(badge?.tagline.length).toBeGreaterThan(0);
    expect(badge?.routeNames.length).toBeGreaterThan(0);
  });

  it("⛔ 三圍缺席就不畫，不捏一個出身出來", () => {
    const routes = contentOriginRoutes();
    expect(originBadgeFrom({ attackType: "melee" }, routes)).toBeNull();
    expect(originBadgeFrom({ attackType: "melee", attributes: {} }, routes)).toBeNull();
    // ⚠️ 這一條的反面：拿掉 hasAttributes 的話上面兩個會變成「坦克」。
    expect(originBadgeFrom(tankish, routes)?.origin).toBe("坦克");
  });
});
