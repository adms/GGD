import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ 這一條驗的是**兩個名詞的關係**，⛔ 不是任何一個名詞自己
 * （第二守則：只驗名詞的守衛在相容性故障面前必然是綠的）：
 *
 *   `TargetProfile` **型別宣告的必填欄位**  ↔  `content/editor-target-profile.json` **實際的鍵**
 *
 * ⚠️ 為什麼沒有現成的東西在管這一對：
 * · `skillremake:json --check` 逐位元組比對**產物 vs 產生器** ⇒ 它看不到型別
 * · `tsc` 看得到型別 ⇒ ⛔ **它看不到那份 JSON**（那是執行期讀進來的資料，⛔ 不是 import）
 * ⇒ ⭐ 兩邊各自有閘，⛔ 而**接縫沒有** —— 失敗形態⑪（兩條對的守衛，組合是空的）。
 *
 * ⭐ 實際踩到的：`generatedAt` 在型別裡是**必填**，而出貨的 17 個鍵裡**沒有它**
 * （GH#389 刻意拿掉：留著的話每跑一次 build 產物就髒一次）。
 * ⇒ 把那份檔當 `TargetProfile` 讀的人拿到 `undefined`，⚠️ 而 tsc **不會說**。
 */
describe("TargetProfile 型別 ↔ 出貨產物", () => {
  const root = resolve(__dirname, "../../../../..");
  const shipped = JSON.parse(
    readFileSync(resolve(root, "content/editor-target-profile.json"), "utf8"),
  ) as Record<string, unknown>;
  const src = readFileSync(resolve(__dirname, "targetProfile.ts"), "utf8");

  /** `export interface TargetProfile { … }` 裡**沒有** `?` 的那些欄位名。 */
  const requiredFields = ((): string[] => {
    const body = src.split("export interface TargetProfile {")[1]?.split("\n}")[0] ?? "";
    return [...body.matchAll(/^\s{2}readonly (\w+)(\??):/gm)]
      .filter((m) => m[2] !== "?")
      .map((m) => m[1]!);
  })();

  it("解析得到欄位（⚠️ 自我校準：解析壞掉時上面那條會空過）", () => {
    expect(requiredFields.length).toBeGreaterThanOrEqual(5);
    expect(requiredFields).toContain("schema");
  });

  it("⭐ 型別說必填的，出貨產物**每一格都在**", () => {
    const missing = requiredFields.filter((f) => !(f in shipped));
    expect(missing, `型別宣告必填但產物沒有：${missing.join(", ")}`).toEqual([]);
  });
});
