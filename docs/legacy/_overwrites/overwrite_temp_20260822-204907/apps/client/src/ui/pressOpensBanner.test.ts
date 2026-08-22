/**
 * ⭐ owner 2026-08-22（他標為**最高優先**）：
 * 「**天生QWEREX 按按鈕施放時不要一直跳出說明 很亂**」
 *
 * 按下技能鈕以前無條件走 `setHeldAbility(slot)`（intent 預設 `"full"`），
 * 而 `"full"` 會把 `AbilityDescriptionOverlay` 那條說明橫幅拉到畫面頂端 ——
 * 連招時一秒閃好幾下，蓋住上半個畫面。
 *
 * ⇒ 現在按下走 `"aim"`（只留範圍圈），由 `config.range-guide@1.pressOpensBanner`
 *   決定要不要開橫幅（出貨 false）。⚠️ **被動例外**：owner 2026-08-13
 *   「被動技的按鈕應該不能被按下」—— 說明是玩家唯一能對被動做的事。
 *
 * ⚠️ 驗的是**機制**（按下之後橫幅開不開），⛔ 不是任何一個出貨數值。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { applyRangeGuideDoc, rangeGuide } from "./rangeGuideConfig";
import { getDescribedAbility, getHeldAbility, setHeldAbility } from "./abilityHold";

/** `AbilityBar`／`TouchControls` 按下時逐字用的那一行 —— ⛔ 不是複製一份判斷。 */
const pressIntent = (passive: boolean): "full" | "aim" =>
  passive || rangeGuide().pressOpensBanner ? "full" : "aim";

describe("按技能鈕不開說明橫幅 (owner 2026-08-22)", () => {
  beforeEach(() => {
    applyRangeGuideDoc(null);
    setHeldAbility(null);
  });

  it("出貨設定下，按主動技只留範圍圈 —— ⛔ 不開頂端說明橫幅", () => {
    expect(rangeGuide().pressOpensBanner, "出貨要是關的").toBe(false);
    setHeldAbility("Q", pressIntent(false));
    expect(getHeldAbility(), "範圍圈還是要出（瞄準要用）").toBe("Q");
    // ⭐ `getDescribedAbility()` **就是**說明橫幅的資料來源 —— 它回 null = 橫幅不開。
    expect(getDescribedAbility(), "⛔ 按下不可以開說明橫幅").toBeNull();
  });

  it("⭐ 被動不受這一格影響 —— 說明是玩家唯一能對它做的事", () => {
    setHeldAbility("PASSIVE", pressIntent(true));
    expect(getDescribedAbility()).toBe("PASSIVE");
  });

  it("後台把它打開 → 按下就開橫幅（第一守則：這是一格下拉，⛔ 不是一次部署）", () => {
    applyRangeGuideDoc({ pressOpensBanner: true } as never);
    setHeldAbility("Q", pressIntent(false));
    expect(getDescribedAbility()).toBe("Q");
  });
});

/**
 * ⭐⭐ **每一個「按下技能」的入口都要走同一格開關。**
 *
 * ── 為什麼這一條存在（2026-08-22 同一個缺陷回報**兩次**）────────────────────
 * 第一次修的時候我 grep 了 `setHeldAbility` 的呼叫點，⛔ **而我加了 `head -10`** ——
 * 輸出被截斷在 TouchControls 那一堆，於是我看不到
 * `input/InputCapture.ts`（**鍵盤 QWER**）與 `input/GamepadInput.ts`（手把），
 * 就下了「鍵盤沒有走這條路」的結論。⭐ owner 用的正是鍵盤，所以他再回報了一次。
 *
 * ⇒ 這條守衛把「我記得哪幾個檔」換成「**數出全部**」：
 *   任何一個呼叫 `setHeldAbility(slot)` 而**沒有帶 intent** 的地方都會紅，
 *   ⛔ 不管它在哪個檔、⛔ 不管誰記不記得它。
 *
 * ⚠️ 它掃原始碼，而那通常是失敗形態⑥。⭐ 這裡是對的，因為它問的**就是**
 *   一個原始碼層級的性質（「有沒有人漏了第二個參數」）—— ⛔ 不是行為的替身。
 */
describe("每一個按下入口都帶 intent (owner 2026-08-22，回報兩次)", () => {
  it("⛔ 沒有任何 `setHeldAbility(x)` 是不帶 intent 的（清 null 除外）", () => {
    // ⭐ 掃**整個 client 原始碼樹**，⛔ 不是「我記得的那幾個資料夾」——
    //    那正是 2026-08-22 漏掉 input/ 的原因。
    const ROOT = join(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(e.name) || e.name.includes(".test.")) continue;
        if (p.endsWith("abilityHold.ts")) continue; // 定義處
        const src = readFileSync(p, "utf-8");
        for (const m of src.matchAll(/setHeldAbility\(([^)]*)\)/g)) {
          const args = m[1] ?? "";
          // `null` 是「收起來」，本來就不需要 intent
          if (args.trim() === "null") continue;
          if (!args.includes(",")) {
            offenders.push(`${p.slice(ROOT.length + 1)}: setHeldAbility(${args})`);
          }
        }
      }
    };
    walk(ROOT);
    expect(
      offenders,
      "⛔ 這幾處按下技能會用預設 intent `\"full\"` ⇒ **頂端說明橫幅蓋住戰鬥畫面**。\n" +
        "  ⭐ 修法：帶上 `rangeGuide().pressOpensBanner ? \"full\" : \"aim\"`，\n" +
        "  ⛔ 不是把這條測試改掉。",
    ).toEqual([]);
  });
});
