/**
 * ⭐⭐ **玩家看得到「連續 20 次會有特殊加成」**（GH#972）。owner 2026-09-02 逐字：
 * > 「隨機能力三選一那邊 **似乎沒有足夠提示 連續20次會有特殊加成**」
 *
 * ⭐ 前提回驗：`statStacks` **早就在線上**（`net/snapshot.ts:318`）⇒ ⛔ 不是失敗形態②。
 * 缺的是**畫**：①三選一那頁一個字都沒有 ②歸零警告只活在 `title=`（手把／觸控沒有
 * hover ⇒ 對它們不存在）③分母寫死 20，而 `statTickTarget` 今天是後台一格。
 * ⚠️ 這裡跑**真的 sim**，⛔ 不自己造 payload 餵 readout（失敗形態⑤）。
 *
 * MUTATION LOG（`scripts/edit-or-die.py` 實跑，改壞 → 紅 → 還原）：
 * · M1 `statPathReadout.ts` 的 `statPathView(…, rules.statTickTarget)` 拿掉第三個參數
 *   （＝退回寫死 20）→ 🔴 **只有**「分母跟著設定走」紅
 * · M2 `MerchantShop.tsx` 的 `{readout.resetWarning && (` → `{false && …`
 *   → 🔴 **只有**「歸零警告是看得見的字」紅
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { zeroAttrBonus } from "@ggd/shared/sim/stats/attributes";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { buyStatUpgrade, resetStatPath } from "@ggd/shared/sim/economy/statPath";
import { normalizeEconomyRules } from "@ggd/shared/sim/economy/economyRules";
import type { ChampionId, EntityId } from "@ggd/shared/ids";
import { statPathReadout } from "./statPathReadout";
import { computeStatBlock, computeBaseStatBlock } from "./statPreview";
import { StatPanel } from "./MerchantShop";

const PANEL = readFileSync(join(__dirname, "AugmentDraftPanel.tsx"), "utf8");
const CHAMP = "thorne";
beforeAll(() => registerSkeletonContent());

/** 真的 sim ＋ 真的英雄組件（`buyStatUpgrade` 只吃 `world.rng`，⛔ 不碰登錄表）。 */
function boughtTicks(n: number): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const id = world.spawn();
  world.champion.set(id, {
    championId: "probe" as ChampionId, level: 1, xp: 0, gold: 10_000, items: [], augments: [],
    statStacks: 0, attrBonus: zeroAttrBonus(), statCapstonePct: 0, pendingOrbSlots: 0, undoStack: [],
  });
  for (let i = 0; i < n; i++) expect(buyStatUpgrade(world, id).result).toBe("ok");
  return { world, id };
}

/** 商店屬性面板的出貨渲染路徑（同 `shopStatVisibility.test.ts`）。 */
function renderShop(statStacks: number): string {
  const c = { championId: CHAMP, level: 5, abilityRanks: [1, 0, 0, 0], items: ["", "", "", "", "", ""], augments: [], statCapstonePct: 0 };
  return renderToStaticMarkup(createElement(StatPanel, {
    block: computeStatBlock(c) ?? zeroStats(), base: computeBaseStatBlock(c), preview: null,
    exact: true, authMaxHp: 0, authMaxMana: 0, level: 5, statStacks, capstonePct: 0, championId: CHAMP,
  }));
}

describe("⭐ 連續屬性強化：玩家看得到進度與歸零規則（GH#972）", () => {
  it("★★ ⭐ 真的買三次 ⇒ 讀得出進度／目標／歸零警告；⭐ 真的買一件道具 ⇒ 警告跟著消失", () => {
    const { world, id } = boughtTicks(3);
    expect(world.champion.get(id)!.statStacks, "儀器：真的 sim 有在數").toBe(3);
    const r = statPathReadout({ stacks: 3, capstonePct: 0, rules: normalizeEconomyRules({}) });
    expect(r.progress, "⛔ 進度沒印出來 ⇒ 玩家不知道自己在追什麼").toBe("3 / 20");
    expect(r.goal, "⛔ 沒說『集滿會發生什麼』⇒ 那條路線等於不存在").toContain("還差 17 次");
    expect(r.resetWarning, "⛔⛔ 有 3 次卻沒有歸零警告 ⇒ 玩家會在不知情下把它按掉").toContain("3");

    resetStatPath(world, id, "test-item");
    expect(world.champion.get(id)!.statStacks, "儀器：出貨的歸零規則真的跑了").toBe(0);
    expect(
      statPathReadout({ stacks: 0, capstonePct: 0, rules: normalizeEconomyRules({}) }).resetWarning,
      "⛔ 0 層還在喊歸零 ⇒ 那句警告會被學成噪音",
    ).toBeNull();
  });

  it("★★ ⭐⭐ 數字**跟著設定走** ⇒ owner 調 5 就印 5（⛔ 不是永遠寫死 20／6）", () => {
    const five = statPathReadout({ stacks: 3, capstonePct: 0, rules: normalizeEconomyRules({ statTickTarget: 5 }) });
    expect(five.progress, "⛔⛔ 分母寫死 ⇒ owner 調完之後畫面在說謊（第〇·四守則）").toBe("3 / 5");
    const gate9 = statPathReadout({ stacks: 3, capstonePct: 0, round: 3, rules: normalizeEconomyRules({ capstoneRoundGate: 9 }) });
    expect(gate9.gateNote, "⛔ 解鎖回合寫死了").toContain("第 9 回合");
    expect(gate9.gateNote, "⛔ 沒說現在第幾回合 ⇒ 玩家不知道還要等多久").toContain("現在第 3 回合");
  });

  it("★★ ⭐⭐ 商店的歸零警告是**看得見的字**，⛔ 不是 `title=`（手把／觸控沒有 hover）", () => {
    // ⭐ 拔掉每一個 `title="…"` —— 剩下的才是玩家**不用 hover** 就讀得到的字。
    const visible = (h: string): string => h.replace(/ title="[^"]*"/g, "");
    expect(visible(renderShop(19)), "⛔⛔ 拔掉 title 就不見了 ⇒ 它只對滑鼠存在，而購買不可逆").toContain("歸零");
    expect(visible(renderShop(0)), "0 層沒有東西會被毀掉").not.toContain("次歸零");
  });

  it("★ ⭐ 三選一那頁**真的掛上**了（⛔ 寫了元件而沒掛 = 它不存在）＋ 那格開關真的被問", () => {
    expect(PANEL.includes("<StatPathProgress />"), "⛔ 元件沒掛進面板 ⇒ 玩家一樣看不到").toBe(true);
    const fn = PANEL.slice(PANEL.indexOf("function StatPathProgress"), PANEL.indexOf("export function AugmentDraftPanel"));
    expect(fn.includes("useHud("), "⛔ 沒讀伺服器狀態 ⇒ 重連就消失").toBe(true);
    expect(fn.includes("uiCues().draftShowStatPath"), "⛔ 沒問開關 ⇒ 後台關掉場上沒反應（失敗形態⑧）").toBe(true);
    const cues = JSON.parse(readFileSync(join(__dirname, "../../../../../content/config/ui-cues.json"), "utf8")) as { draftShowStatPath?: boolean };
    expect(cues.draftShowStatPath, "⛔ 出貨預設是關的 —— owner 抱怨的就是「看不到」").toBe(true);
  });
});
