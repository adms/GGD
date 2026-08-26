/**
 * 🧑‍⚖️ **每一個對照/設定頁都要有批核區** —— owner 2026-08-27（逐字）：
 * > 「我提醒你以下這些設定頁面 **都會有批核頁面的部分**喔」（隨後列出 13 頁）
 *
 * ## 這條閘在問什麼
 * ⛔ 不是「ReviewStrip 這個元件存在嗎」（那是**名詞**）——
 * 是「**LIVE_ROUTES 裡的每一頁，它的元件檔真的掛了 ReviewStrip 嗎**」（**關係**）。
 * ⭐ 母體從 `live/index.tsx` 的 `LIVE_ROUTES` **推導**：⛔ 不是一張手寫的 13 頁清單
 * （手寫的表會過期，而且第 14 頁加進來時不會有東西紅 —— 那正是 owner 這次提醒的形狀）。
 *
 * ⚠️ 這一條刻意用**掃原始碼**：它問的是「接線在不在」而不是行為 ——
 * 失敗形態⑥（用掃字串代替行為）管的是**行為**斷言，接線存在性本來就只能這樣問。
 * 行為那一半由 `ReviewStrip` 自己的資料路徑負責（它 fetch 的是與批核頁**同一份** `/__review/features`）。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────
 *  · 從任一頁（例 SfxMapPage.tsx）拿掉 `<ReviewStrip …/>` → 這一條紅並逐頁指名。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const LIVE = join(REPO, "apps/admin/src/ui/live");

/** 從 LIVE_ROUTES 推導「哪些元件是一頁」—— ⛔ 不手寫清單。 */
function routeComponents(): string[] {
  const idx = readFileSync(join(LIVE, "index.tsx"), "utf8");
  return [...idx.matchAll(/Component:\s*([A-Za-z0-9_]+)\s*[},]/g)].map((m) => m[1]!);
}

describe("批核區覆蓋率 (review-strip-coverage)", () => {
  it("⭐ LIVE_ROUTES 的每一頁都掛了 ReviewStrip（owner:「都會有批核頁面的部分」）", () => {
    const comps = routeComponents();
    expect(comps.length, "LIVE_ROUTES 解析不到任何元件 —— 母體推導壞了").toBeGreaterThanOrEqual(13);
    const missing: string[] = [];
    for (const c of comps) {
      const f = join(LIVE, `${c}.tsx`);
      if (!existsSync(f)) {
        missing.push(`${c} —— 檔案不存在`);
        continue;
      }
      const src = readFileSync(f, "utf8");
      if (!src.includes("<ReviewStrip")) missing.push(`${c} —— 沒有掛 <ReviewStrip>`);
    }
    expect(
      missing.join("\n"),
      "⛔ 這些對照/設定頁沒有批核區。owner 2026-08-27:「這些設定頁面**都會有批核頁面的部分**」。\n" +
        "⭐ 修法是一行（⛔ 不是各寫一塊 UI）：\n" +
        '   import { ReviewStrip } from "./ReviewStrip";\n' +
        '   <ReviewStrip family={["<這一頁負責的批次家族關鍵字>"]} title="<顯示名>" />\n' +
        "⚠️ family 要挑得出這一頁真的負責的批次 —— 挑錯會顯示別頁的批次，比沒有更糟。",
    ).toBe("");
  });

  it("ReviewStrip 自己吃的是與批核頁**同一份**帳本（⛔ 不是第二個住處）", () => {
    const strip = readFileSync(join(LIVE, "ReviewStrip.tsx"), "utf8");
    expect(strip.includes("/__review/features"), "批核區沒讀共用帳本 —— 那就是第二份真相").toBe(true);
    expect(
      strip.includes("/__review/feature-verdict"),
      "批核區不能寫裁決 ⇒ 它只是一張圖，⛔ 不是 owner 說的「一鍵否決還原」",
    ).toBe(true);
    // ⭐ owner 的第三條性質：否決必填原因。
    expect(strip.includes("必填"), "否決沒有必填原因 —— owner 的定義是「追加原因的 HITL」").toBe(true);
  });
});
