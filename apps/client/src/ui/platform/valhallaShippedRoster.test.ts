/**
 * 英靈殿 × 出貨內容 —— 對**出貨的** `valhallaRoster()` 實跑的名單閘（夾具：`valhallaShipped.testkit.ts`）。
 *
 * ── GH#1251 隱藏角色要上英靈殿 ─────────────────────────────────────────────
 * > owner 2026-09-14 02:20（逐字）：「隱藏角色要顯示 黑化Saber可以上架」
 * ⭐ 預設 `config.roster@1.hiddenInValhalla = "show"`；⛔ 只測預設那一邊（第〇·六守則）。
 * 突變紀錄（2026-09-15，接線那一行）：`valhalla.ts` 的 `valhallaExcludedHiddenIds()` 改回
 * `hiddenChampionIds()` ⇒ 第一條紅，逐位指名那 4 位隱藏英雄。改回 → 綠。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Champions } from "@ggd/shared/sim/content/registry";
import { hiddenChampionIds, retiredChampionIds } from "@ggd/shared/content/championRetirement";
import { __resetContentBoot } from "../../content/bootContent";
import { whitelistedChampionIds } from "../panels/champSelectFilter";
import { loadShippedValhalla, type ValhallaShipped } from "./valhallaShipped.testkit";

let shipped: ValhallaShipped;
beforeAll(async () => {
  shipped = await loadShippedValhalla();
}, 120_000);
afterAll(() => {
  vi.unstubAllGlobals();
  __resetContentBoot();
});

describe("GH#1251 英靈殿展示隱藏英雄（出貨 roster × 出貨 valhallaRoster）", () => {
  it("出貨隱藏名單裡、開放名單上的每一位都在英靈殿輪播裡", () => {
    const hidden = [...hiddenChampionIds()];
    expect(hidden.length, "⛔ 出貨隱藏名單是空的 ⇒ 這條在量空氣").toBeGreaterThan(0);
    const open = hidden.filter((id) => shipped.starter.champions.has(id));
    expect(open, "⛔ 隱藏英雄都不在 starter 白名單上 ⇒ 隱藏被做成下架了（#469 的病）").toEqual(hidden);
    const missing = open.filter((id) => !shipped.roster.includes(id));
    expect(missing, "⛔ 這幾位隱藏英雄沒有出現在英靈殿（owner 2026-09-14「隱藏角色要顯示」）").toEqual([]);
  });

  it("⛔ 選人畫面照舊排除隱藏英雄（修法沒有碰共用的 resolveToPickable）", () => {
    const pickable = whitelistedChampionIds(Champions.ids(), shipped.starter, retiredChampionIds(), hiddenChampionIds());
    expect([...hiddenChampionIds()].filter((id) => pickable.includes(id))).toEqual([]);
  });
});
