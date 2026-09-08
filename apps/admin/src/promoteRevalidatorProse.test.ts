/**
 * ⭐ 「promote 一律 503」這句話與 **Go 那一側**不可以打架（GH#1025 段 A 的量測）。
 *
 * ── 為什麼有這一條 ────────────────────────────────────────────────────────
 * `apps/admin/src/api.ts` 的 `promoteSubmission()` 檔頭在 2026-09-07 之前逐字寫著
 * 「今天這條路線**一律回 503 `revalidator_missing`**」。⭐ 而那句話從 2026-09-02
 * （GH#1022）起就是假的：`apps/platform` 的 `submissionPromoteDeps()` 已經從
 * `GGD_CONTENT_API_URL` 造出真的重驗鉤子。
 *
 * ⇒ ⚠️ 這正是第三守則記過的形狀：**一句在它到期之後還活著的散文，⛔ 而沒有任何
 * 東西會紅**。它的代價是量得到的 —— GH#1025 的段 A 因此被讀成「上線路徑還沒做」，
 * ⛔ 而真相是「它做好了，只是那個環境變數沒設」。兩者的下一步完全不同。
 *
 * ── 它驗的是**兩個名詞的關係**，⛔ 不是各自的存在 ────────────────────────
 * · Go 那一側**有沒有**把鉤子接到環境變數上（`ContentAPIRevalidator(contentAPI`）
 * · TS 這一側**有沒有**還在宣稱「一律 503」
 * 兩者同時為真 ⇒ 紅，並指名那兩行。
 *
 * ⛔ 這一條刻意**不**去驗 HTTP 行為（那是 Go 側 `playercontent_digest_test.go` 的事，
 * 它已經雙向釘死：沒設環境變數 ⇒ 鉤子必須是 nil；設了 ⇒ 鉤子不可以是 nil）。
 * ⭐ 這裡只擋「散文再說一次謊」。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const API_TS = join(ROOT, "apps/admin/src/api.ts");
const PLAYER_CONTENT_GO = join(ROOT, "apps/platform/internal/server/playercontent.go");

/** ⭐ 「這條路線一律 503」的宣稱長什麼樣（⛔ 不是「提到 503」——那是說明它什麼時候發生）。 */
const UNCONDITIONAL_503 = /一律回?\s*503/;

/**
 * ⭐ 先剝掉 `「…」`，⛔ 再判斷。
 *
 * 理由與 CLAUDE.md 第〇·六守則那一條同構（「」裡面是**引用**不是主張）：
 * 這一段檔頭**必須**引得出那句已經作廢的話（第一·五守則：另存，⛔ 不是壓縮取代），
 * 而一個只會 grep 字串的閘會把那句引言讀成「它又在說謊」。
 */
const withoutQuotes = (s: string): string => s.replace(/「[\s\S]*?」/g, "");

describe("promote 重驗鉤子的散文 (gh1025-promote-revalidator-prose)", () => {
  it("⭐ Go 側接上了重驗鉤子 ⇒ TS 側不可以還在說「一律 503」", () => {
    const go = readFileSync(PLAYER_CONTENT_GO, "utf8");
    const ts = readFileSync(API_TS, "utf8");
    // ⚠️ 母體不可以塌掉：檔案讀空了對任何宣稱都是綠的（失敗形態⑥）。
    expect(go.length).toBeGreaterThan(1000);
    expect(ts.length).toBeGreaterThan(1000);

    // ① Go 那一側今天到底有沒有接？—— 讀**出貨原始碼**，⛔ 不是讀註解。
    const wired = go.includes("Revalidate: submissions.ContentAPIRevalidator(contentAPI");
    expect(
      wired,
      "⛔ `submissionPromoteDeps()` 不再從 GGD_CONTENT_API_URL 造重驗鉤子了？" +
        "那 api.ts 的檔頭要跟著改回去 —— 這一條在意的是兩邊一致，⛔ 不是哪一邊贏",
    ).toBe(true);

    // ② TS 這一側的宣稱。只看 `promoteSubmission` 的那一段（⛔ 不是整個檔）。
    const at = ts.indexOf("export function promoteSubmission");
    expect(at).toBeGreaterThan(0);
    const block = withoutQuotes(ts.slice(Math.max(0, at - 2600), at));
    // ⚠️ 剝完之後母體不可以塌成空字串（那樣什麼宣稱都測不到）。
    expect(block.length).toBeGreaterThan(400);
    const lying = UNCONDITIONAL_503.test(block);
    expect(
      lying,
      "⛔ `apps/admin/src/api.ts` 的 promoteSubmission 檔頭又在說「promote 一律回 503」，" +
        "而 `apps/platform/internal/server/playercontent.go` 已經把重驗鉤子接到 " +
        "GGD_CONTENT_API_URL 上（2026-09-02 / GH#1022）。⭐ 503 是「那個環境變數沒設」的樣子，" +
        "⛔ 不是「這條路線還沒做」—— 兩者的下一步完全不同（GH#1025 段 A 就是被這句話讀歪的）。",
    ).toBe(false);
  });
});
