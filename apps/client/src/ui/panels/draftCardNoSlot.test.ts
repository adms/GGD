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
import { isItemChoice } from "./draftCardStyle";
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

  it("★★ ⭐ 卡面那句話與商店那句話是**同一個字串**（⛔ 不是第二份文案）", () => {
    const src = readFileSync(
      join(REPO, "apps/client/src/ui/panels/AugmentDraftPanel.tsx"),
      "utf8",
    );
    expect(
      src,
      '⛔ 卡面自己寫了一句「背包已滿」而不是引用 `REJECT_TEXT["no-slot"]`。\n' +
        "⭐ 兩份文案會漂，⛔ 而漂掉時沒有東西會紅（第〇·四守則：一個值一個住處）。",
    ).toContain('REJECT_TEXT["no-slot"]');
    expect(REJECT_TEXT["no-slot"]).toContain("道具欄已滿");
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
