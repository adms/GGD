/**
 * 🎒 **背包滿時，三選一的道具卡要事先看得出來**（GH#1110 A3）。
 *
 * > owner 2026-09-06：「隨機選寶具的時候 **道具欄已滿 怎麼辦**」→「**A ＋ B 開票**」
 *
 * ── ⭐ 這條守衛守的是哪一段 ────────────────────────────────────────────────
 * A1／A2（伺服器拒絕 ＋ 客戶端顯示）**已經做完**：
 * `sim/economy/draft.ts` 發 `itemPickRejected` → `eventFanout.ts:354` 放行 →
 * `RoomStore.ts` 映成 `buyRejected` → `shopFeedback` 的「道具欄已滿（先賣掉一件）」。
 * ⛔ 而那全部是**點下去之後**才發生的 —— A3 要的是**點之前**。
 *
 * ⭐ 這裡驗兩件**純函式**能驗的事（⛔ 不模擬 React）：
 *   ① `isItemChoice` 只對**道具**回 true —— 增益卡／技能卡⛔ 不吃背包格
 *   ② 卡面那句話與商店那句話是**同一個字串**（⛔ 不是抄第二份）
 * ⚠️ 「壓暗／不送」那一段是 JSX，⭐ 由 `AugmentDraftPanel.tsx` 裡 `noSlot` 的三個用點
 *   （cursor／opacity／onClick 早退）守著；⛔ 這條守衛不假裝驗得到它。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { registerAll } from "@ggd/shared/content/registries";
import { Items } from "@ggd/shared/sim/content/registry";
import { CARD_BAG_FULL_TEXT, isItemChoice } from "./draftCardStyle";
import { REJECT_TEXT } from "./shopFeedback";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

beforeAll(async () => {
  const loaded = await new ContentLoader(shippedContentSource(join(REPO, "content"))).load();
  registerAll(loaded.store);
});

describe("🎒 三選一的道具卡：背包滿要事先看得出來（GH#1110 A3）", () => {
  it("⭐ 量尺自證：內容真的載進來了（⛔ 不是在量空集合）", () => {
    expect(Items.ids().length, "⛔ 道具註冊表是空的").toBeGreaterThan(0);
  });

  it("★ ⭐ `isItemChoice` 只對**道具**回 true —— 增益卡⛔ 不吃背包格", () => {
    const anItem = Items.ids()[0]!;
    expect(isItemChoice(anItem), `⛔ ${anItem} 是道具卻回 false`).toBe(true);
    // ⭐ 探針用**不存在的 id**（⛔ 不挑一個具體的增益 id —— 那會在增益改名時假紅）
    expect(isItemChoice("zz-not-a-real-choice"), "⛔ 非道具回了 true ⇒ 增益卡會被誤判成滿").toBe(false);
  });

  /**
   * ⚠️ ⭐ **這一條在 GH#1271 被推翻了一半**，留著更正的理由（⛔ 不要再改回去）：
   *
   * 舊規則是「卡面那句話與商店那句話要是**同一個字串**」（第〇·四守則，一個值一個住處）。
   * ⇒ 而 owner 回報的症狀正是它造成的：卡片開著時商店被**遮罩擋住**，
   *   ⭐ 卡上卻寫著「道具欄已滿（**先賣掉一件**）」—— ⛔ 一件玩家當下**做不到**的事。
   *
   * ⇒ 更正：它們**不是同一個值**（回答的是不同的問題），所以是兩個字串：
   *   · 商店（賣得掉）＝ `REJECT_TEXT["no-slot"]` —— ⛔ 一個字都不動
   *   · 卡面（賣不掉）＝ `CARD_BAG_FULL_TEXT`（`draftCardStyle.ts`，理由寫在那個常數上）
   * ⭐ 而這一條守衛現在守的是**那條界線**：卡面⛔ 不可以再借商店那一句。
   */
  it("★★ ⭐ 卡面⛔ 不再借商店那句「先賣掉一件」，而商店那句照舊（GH#1271）", () => {
    const src = readFileSync(
      join(REPO, "apps/client/src/ui/panels/AugmentDraftPanel.tsx"),
      "utf8",
    );
    expect(
      src,
      "⛔ 卡面又借回商店那句了 —— 卡片開著時商店被遮罩擋住，「先賣掉一件」是玩家做不到的事（GH#1271）。",
    ).not.toContain('REJECT_TEXT["no-slot"]');
    expect(src, "⛔ 卡面沒有用 `CARD_BAG_FULL_TEXT` ⇒ 它自己寫了第三份文案").toContain("CARD_BAG_FULL_TEXT");
    expect(CARD_BAG_FULL_TEXT, "⛔ 卡面那句混進了「賣」這個動作").not.toContain("賣");
    expect(CARD_BAG_FULL_TEXT).toContain("道具欄已滿");
    // ⭐ 商店那一句**不動**：在商店裡「先賣掉一件」是真的做得到的。
    expect(REJECT_TEXT["no-slot"], "⛔ 商店那句被順手改掉了（它沒有錯）").toContain("先賣掉一件");
    // ⭐ GH#1271 AC6 —— 逾時代選撞上滿背包是**作廢**，⛔ 不是「先賣掉一件」。
    expect(REJECT_TEXT.voided, "⛔ 代選作廢那一句不見了 ⇒ 玩家又會看到叫他去賣東西").toContain("作廢");
  });

  it("★★ ⭐ `noSlot` 真的接上三個用點（游標／壓暗／⛔ 不送）", () => {
    const src = readFileSync(
      join(REPO, "apps/client/src/ui/panels/AugmentDraftPanel.tsx"),
      "utf8",
    );
    for (const [what, needle] of [
      ["游標", 'cursor: noSlot ? "not-allowed" : "pointer"'],
      ["壓暗", "faceUp ? (noSlot ? 0.45 : 1) : 0"],
      ["⛔ 不送", "if (noSlot) return;"],
    ] as const) {
      expect(src, `⛔ ${what} 那一段不見了 —— 卡片會回到「點了沒反應」`).toContain(needle);
    }
  });
});
