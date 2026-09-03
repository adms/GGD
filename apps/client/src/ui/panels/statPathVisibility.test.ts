/**
 * ⭐⭐ **玩家看得到「連續 20 次會有特殊加成」**（GH#972）。
 *
 * owner 2026-09-02（逐字）：
 * > 「隨機能力三選一那邊 **似乎沒有足夠提示 連續20次會有特殊加成**」
 *
 * ⭐ **前提回驗**（先做，⛔ 不抄票文）：`statStacks` **早就在線上**
 * （`net/snapshot.ts` → `SeatView.statStacks`）⇒ ⛔ 這不是失敗形態②。
 * 缺的是：①三選一那一頁一個字都沒有 ②歸零警告只活在 `title=`（手把／觸控
 * 沒有 hover ⇒ 對它們**不存在**）③分母寫死 20，而 `statTickTarget` 今天是後台一格。
 *
 * ⚠️ ⭐ 這一支跑的是**真的 sim**（`buyStatUpgrade` / `resetStatPath`），
 * ⛔ 不自己造一份 payload 餵給 readout（失敗形態⑤：那會量到一個虛構通道）。
 *
 * ── 突變紀錄（實跑，`scripts/edit-or-die.py` 改壞 → 紅 → 還原）─────────────
 * M1 `statPathReadout.ts` 的 `statPathView(…, rules.statTickTarget)`
 *    → `statPathView(input.stacks, input.capstonePct)`（＝退回寫死的 20）
 *    → 🔴 ②「分母沒有跟著設定走 —— owner 調成 5 而畫面照樣寫 20」
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
import type { ChampionId } from "@ggd/shared/ids";
import { statPathReadout } from "./statPathReadout";
import { computeStatBlock, computeBaseStatBlock } from "./statPreview";
import { StatPanel } from "./MerchantShop";

const PANEL = readFileSync(join(__dirname, "AugmentDraftPanel.tsx"), "utf8");
const CHAMP = "thorne";

beforeAll(() => registerSkeletonContent());

/** 真的 sim + 真的英雄組件；⛔ 內容登錄表無關（`buyStatUpgrade` 只吃 `world.rng`）。 */
function worldWithChampion(gold: number) {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const id = world.spawn();
  world.champion.set(id, {
    championId: "probe" as ChampionId,
    level: 1, xp: 0, gold, items: [], augments: [],
    statStacks: 0, attrBonus: zeroAttrBonus(), statCapstonePct: 0,
    pendingOrbSlots: 0, undoStack: [],
  });
  return { world, id };
}

/** 商店屬性面板的出貨渲染路徑（同 `shopStatVisibility.test.ts`）。 */
function renderShop(statStacks: number): string {
  const ctx = { championId: CHAMP, level: 5, abilityRanks: [1, 0, 0, 0], items: ["", "", "", "", "", ""], augments: [], statCapstonePct: 0 };
  return renderToStaticMarkup(
    createElement(StatPanel, {
      block: computeStatBlock(ctx) ?? zeroStats(), base: computeBaseStatBlock(ctx),
      preview: null, exact: true, authMaxHp: 0, authMaxMana: 0, level: 5,
      statStacks, capstonePct: 0, championId: CHAMP,
    }),
  );
}

/** ⭐ 把每一個 `title="…"` 拔掉 —— 剩下的才是**玩家不用 hover 就讀得到**的字。 */
const visibleOnly = (html: string): string => html.replace(/ title="[^"]*"/g, "");

describe("⭐ 連續屬性強化：玩家看得到進度與歸零規則（GH#972）", () => {
  it("★★ ⭐ 真的買三次 ⇒ 畫面讀得出 3 次、還差幾次、以及「買道具會歸零」", () => {
    const { world, id } = worldWithChampion(10_000);
    for (let i = 0; i < 3; i++) expect(buyStatUpgrade(world, id).result).toBe("ok");
    const stacks = world.champion.get(id)!.statStacks;
    expect(stacks, "儀器：真的 sim 有在數").toBe(3);

    const r = statPathReadout({ stacks, capstonePct: 0, rules: normalizeEconomyRules({}) });
    expect(r.progress, "⛔ 進度沒有印出來 ⇒ 玩家不知道自己在追什麼").toBe("3 / 20");
    expect(r.goal, "⛔ 沒有說『集滿會發生什麼』⇒ 那條路線等於不存在").toContain("還差 17 次");
    expect(
      r.resetWarning,
      "⛔⛔ 累積了 3 次卻沒有歸零警告 ⇒ 玩家會在不知情的狀況下把它按掉",
    ).toContain("3");
  });

  it("★★ ⭐⭐ 分母**跟著設定走** ⇒ owner 調 5 就印 5（⛔ 不是永遠寫死 20）", () => {
    const { world, id } = worldWithChampion(10_000);
    for (let i = 0; i < 3; i++) buyStatUpgrade(world, id);
    const stacks = world.champion.get(id)!.statStacks;
    const five = statPathReadout({ stacks, capstonePct: 0, rules: normalizeEconomyRules({ statTickTarget: 5 }) });
    expect(
      five.progress,
      "⛔⛔ `statTickTarget` 是後台一格 —— 分母寫死 ⇒ owner 調完之後畫面在說謊",
    ).toBe("3 / 5");
    // 回合閘同理：它也是設定，⛔ 不是文案裡的 6
    const gate9 = statPathReadout({ stacks, capstonePct: 0, round: 3, rules: normalizeEconomyRules({ capstoneRoundGate: 9 }) });
    expect(gate9.gateNote, "⛔ 解鎖回合寫死了").toContain("第 9 回合");
    expect(gate9.gateNote, "現在第幾回合也要說 —— 否則玩家不知道還要等多久").toContain("現在第 3 回合");
  });

  it("★★ ⭐ 真的買一件道具 ⇒ 歸零，而警告**跟著消失**（沒有東西可以被毀掉了）", () => {
    const { world, id } = worldWithChampion(10_000);
    for (let i = 0; i < 3; i++) buyStatUpgrade(world, id);
    resetStatPath(world, id, "test-item");
    const stacks = world.champion.get(id)!.statStacks;
    expect(stacks, "儀器：出貨的歸零規則真的跑了").toBe(0);
    const r = statPathReadout({ stacks, capstonePct: 0, rules: normalizeEconomyRules({}) });
    expect(r.resetWarning, "⛔ 0 層還在喊歸零 ⇒ 那句警告會被學成噪音").toBeNull();
    expect(r.progress).toBe("0 / 20");
  });

  it("★★ ⭐⭐ 商店的歸零警告是**看得見的字**，⛔ 不是 `title=`（手把／觸控沒有 hover）", () => {
    const visible = visibleOnly(renderShop(19));
    expect(
      visible,
      "⛔⛔ 拔掉 `title=` 之後那句話就不見了 ⇒ 它只對滑鼠存在，\n" +
        "  ⭐ 而按下購買是不可逆的（手把與觸控玩家永遠讀不到它）。",
    ).toContain("歸零");
    // 0 層時不該有 —— 沒有東西會被毀掉
    expect(visibleOnly(renderShop(0))).not.toContain("次歸零");
  });

  it("★ ⭐ 三選一那一頁**真的掛上**了（⛔ 寫了元件而沒掛 = 它不存在）＋ 那格開關真的被問", () => {
    expect(PANEL.includes("<StatPathProgress />"), "⛔ 元件沒掛進面板 ⇒ 玩家一樣看不到").toBe(true);
    const fn = PANEL.slice(PANEL.indexOf("function StatPathProgress"), PANEL.indexOf("export function AugmentDraftPanel"));
    expect(fn.length, "⛔ 找不到 `StatPathProgress`").toBeGreaterThan(50);
    expect(fn.includes("useHud("), "⛔ 沒有讀伺服器狀態 ⇒ 重連就消失").toBe(true);
    expect(fn.includes("uiCues().draftShowStatPath"), "⛔ 沒問開關 ⇒ 後台關掉場上沒反應（失敗形態⑧）").toBe(true);
    const cues = JSON.parse(readFileSync(join(__dirname, "../../../../../content/config/ui-cues.json"), "utf8")) as { draftShowStatPath?: boolean };
    expect(cues.draftShowStatPath, "⛔ 出貨預設是關的 —— owner 抱怨的就是「看不到」").toBe(true);
  });
});
