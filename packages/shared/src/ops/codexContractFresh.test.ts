/**
 * ⭐【貼在 Codex 合約裡的能力指紋，必須等於引擎現在算出來的那一個】
 *
 * 症狀（2026-08-14 實測）：`docs/技能編輯器引擎須知` 的檔頭與第十章各貼了一次
 * `指紋 7f2a3d75`，而引擎當時已經走到 `8d30566f`。
 *
 * ⛔ 為什麼這件事特別危險：那份文件**明確叫外部作者「拿指紋 pin base，
 *    引擎一變你就知道」**。指紋過期 = 那句話變成謊話，而且是**最難發現**的一種 ——
 *    同一份文件裡的可讀數字（37 個 kind / 19 個 hook / 5 種條件葉 / 17 個模板家族）
 *    當時**全部還是對的**，所以逐項核對也看不出來。變的是 `knownBroken` 的內文
 *    （GH#296 的成因在 2026-08-09 換過一次），而那正是「哪些能力已知壞掉」——
 *    對方照著舊的走，會去繞一條早就不存在的路。
 *
 * ⚠️ 這是第〇·五守則那句話的第二次應驗：
 *    「a flag defended by prose outlives the prose's expiry date and **nothing goes red**」。
 *    第一次是 `SIM_CAPABILITIES` 撒的兩次謊，解法是**推導**；這一次推導本身沒問題，
 *    問題是**被抄進文件的那一份快照**沒有人對帳 —— 所以補這一條。
 *
 * ⭐ 這條測試不要求文件複製整張表（那會變成第二個真相來源）。
 *    它只要求**那一個指紋**是對的：指紋一致 ⇒ 整張表一致；指紋不一致 ⇒ 立刻知道。
 *
 * 突變紀錄：把文件裡任一處指紋改掉一個字元 → 這一條紅並印出正確值與行號。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityManifest } from "../content/editorCapabilities";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTRACT = join(REPO, "docs", "技能編輯器引擎須知 20260811.md");

describe("Codex 合約貼的能力指紋沒有過期", () => {
  it("⭐ 文件裡每一處指紋都等於 buildCapabilityManifest() 現在算出來的", () => {
    const expected = buildCapabilityManifest().fingerprint;
    expect(expected, "指紋不見了 —— manifest 的形狀變了？").toMatch(/^[0-9a-f]{8}$/);

    const text = readFileSync(CONTRACT, "utf8");
    const lines = text.split("\n");
    const found: { line: number; value: string }[] = [];
    lines.forEach((l, i) => {
      if (!l.includes("指紋")) return;
      for (const m of l.matchAll(/\b([0-9a-f]{8})\b/g)) found.push({ line: i + 1, value: m[1]! });
    });

    // ⛔ 零筆 = 有人把指紋從文件裡拿掉了。那不是「修好」，是把唯一的對帳點刪掉。
    expect(
      found.length,
      "合約文件裡一個指紋都找不到 —— 拿掉它等於拿掉外部作者唯一的 pin base 依據",
    ).toBeGreaterThan(0);

    const stale = found.filter((f) => f.value !== expected);
    expect(
      stale,
      `合約文件貼的指紋過期了。引擎現在是 \`${expected}\`。\n` +
        stale.map((f) => `  · 第 ${f.line} 行寫著 ${f.value}`).join("\n") +
        `\n\n修法：把上面那幾行改成 ${expected}，並且**順手看一眼 manifest 差在哪** ——\n` +
        `      指紋變了代表 effectKinds / hookEvents / conditionLeafKinds /\n` +
        `      templateFamilies / knownBroken 至少有一項變了，而 Codex 會照著抄。\n` +
        `      ⛔ 不要只改數字：如果變的是 knownBroken，文件的第十一章也要跟著更新。`,
    ).toEqual([]);
  });
});
