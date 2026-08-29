/**
 * 選人畫面的每一個可點的東西，**手把焦點都走得到**（GH#502 的「選人」那一段）。
 *
 * ---------------------------------------------------------------------------
 * owner 2026-08-21/22（逐字）
 * ---------------------------------------------------------------------------
 * > 「這整個遊戲 從登入、大廳、**選人**、戰鬥回合、結算、回大廳 等操作
 * >  都要可以支援手把直接操作到底」
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 為什麼是這一支
 * ---------------------------------------------------------------------------
 * 2026-08-29 量到：22 支手把測試裡**沒有任何一支**的標題提到選人
 * （`padSixStageCoverage.test.ts` 收緊判準之後當場指名這一段）。
 *
 * ⭐ 而**功能是好的** —— 我一開始以為它壞了（`grep -c data-pad-focusable` = 0），
 * ⛔ 那是量錯了：`SfxButton` 畫的是**真的 `<button>`**，而
 * `PadFocusNav.FOCUSABLE_SELECTOR` 的第二條就是 `"button"`。
 * ⇒ ⭐ 缺的是**守衛**，⛔ 不是功能 —— 而沒有守衛的功能會靜靜地退化。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 它驗什麼
 * ---------------------------------------------------------------------------
 * `ChampSelectPanel.tsx` 裡每一個 `onClick=` 都必須掛在**焦點走得到**的元素上：
 * `<button>` / `<SfxButton>` / `<Btn>` / `[data-pad-focusable]` / `[tabIndex]`。
 * ⛔ **裸 `<div onClick>` 對 `FOCUSABLE_SELECTOR` 不存在** —— 那正是 #516／MerchantShop
 * 檔頭記載的那個缺陷（「純手把玩家⋯永遠看不到」）。
 *
 * 突變紀錄：把某個 `<SfxButton onClick=` 換成 `<div onClick=` ⇒ 紅並指名行號。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PANEL = join(HERE, "ChampSelectPanel.tsx");
const NAV = join(HERE, "../PadFocusNav.tsx");

/** 焦點走得到的開頭標籤（⭐ 與 `FOCUSABLE_SELECTOR` 對得起來，見下面那條斷言）。 */
const REACHABLE = /^<(?:button|SfxButton|Btn|a|input|select|textarea)\b/;

describe("選人畫面手把走得到（GH#502）", () => {
  const src = readFileSync(PANEL, "utf-8");
  const lines = src.split("\n");

  it("⭐ 每一個 onClick 都在焦點看得見的元素上（⛔ 不是裸 div）", () => {
    const bad: string[] = [];
    lines.forEach((ln, i) => {
      if (!/\bonClick\s*=/.test(ln)) return;
      // 往回找這個屬性所屬的開頭標籤（JSX 常常把屬性換行寫）
      let tag = "";
      for (let k = i; k >= 0 && i - k < 14; k--) {
        const m = /<([A-Za-z][\w.]*)/.exec(lines[k]!.trim());
        if (m && lines[k]!.trim().startsWith("<")) {
          tag = `<${m[1]}`;
          break;
        }
      }
      if (tag === "") return; // 內嵌在物件裡的 handler（⛔ 不是 JSX 元素）
      if (!REACHABLE.test(tag)) bad.push(`${i + 1}: ${tag} onClick —— 焦點走不到`);
    });
    expect(
      bad,
      "⛔ 這些可點的東西**手把焦點走不到**（`FOCUSABLE_SELECTOR` 看不見裸 div）：\n" +
        bad.map((b) => `  · ChampSelectPanel.tsx:${b}`).join("\n") +
        "\n⭐ 修法：`data-pad-focusable` ＋ `tabIndex={0}` ＋ `role=\"button\"`（#516 的契約），" +
        "或直接用 `<SfxButton>`。",
    ).toEqual([]);
  });

  it("GUARD THE GUARD：判準與出貨的 FOCUSABLE_SELECTOR 對得起來", () => {
    const nav = readFileSync(NAV, "utf-8");
    // ⭐ 兩個方向：`button` 真的在選擇器裡（⛔ 否則我的白名單是幻想）
    expect(nav, "⛔ FOCUSABLE_SELECTOR 不再收 `button` —— 這條守衛的前提消失了").toMatch(/"button"/);
    // ⭐ 而且真的掃到了一批 onClick（⛔ 掃空會靜默全過）
    expect(lines.filter((l) => /\bonClick\s*=/.test(l)).length).toBeGreaterThan(3);
  });
});
