import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **「磁碟上還有幾張舊畫風」問的是名詞，⛔ 而該問的是關係。**
 *
 * GH#1129 的 AC③ 逐字寫「掃 `content/assets/icons/**\/*.method`，斷言沒有 `twopass-v1`」。
 * 2026-09-09 照著量：**117 張還是 v1** ⇒ 看起來重畫只做了一半。
 *
 * ⭐ 而逐張查下去，**117 張全部是孤兒** —— 它們的文件在 owner 2026-08-13
 *   («沒開放的英雄…預設不要再被讀取到了») 就被搬進 `content/_legacy/` 了，
 *   ⛔ 而那些 legacy 文件**仍然引用著這些圖**（抽驗 6/6 命中）。
 *   ⇒ ⛔ 搬走它們＝把 legacy 文件的引用打斷（GH#1137 就是這樣錯的），
 *     ⛔ 重畫它們＝畫沒有人看得到的東西。
 *
 * ⇒ ⭐ 真正要問的是：**出貨的文件，它的圖是不是舊畫風畫的？**
 *   （量的是 doc → icon → sidecar 這條**關係**，⛔ 不是目錄裡的檔案數。）
 */

const REPO = join(import.meta.dirname, "../../../..");
const CONTENT = join(REPO, "content");
const OBSOLETE = "twopass-v1";

function stampOf(icon: string): string | null {
  const m = join(CONTENT, icon.replace(/^\/+/, "")) + ".method";
  if (!existsSync(m)) return null; // ⭐ 手繪 .png 原畫本來就沒有 sidecar
  const raw = readFileSync(m, "utf8").trim();
  try {
    return String((JSON.parse(raw) as { method?: string }).method ?? raw);
  } catch {
    return raw;
  }
}

function shippedIcons(): { doc: string; icon: string; stamp: string | null }[] {
  const out: { doc: string; icon: string; stamp: string | null }[] = [];
  for (const fam of ["champions", "abilities", "items"]) {
    const dir = join(CONTENT, fam);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { icon?: string };
      const icon = (doc.icon ?? "").trim();
      if (icon) out.push({ doc: `${fam}/${f}`, icon, stamp: stampOf(icon) });
    }
  }
  return out;
}

describe("出貨文件的圖示不是舊畫風畫的（GH#1129 AC③ 的**關係**版）", () => {
  it("⭐ 量尺先自證：真的掃到了一批出貨圖示", () => {
    const rows = shippedIcons();
    expect(rows.length, "⛔ 一張都沒掃到 —— 這把尺是瞎的").toBeGreaterThan(400);
    // ⭐ 反方向：一個不存在的戳記⛔不可以被當成命中
    expect(rows.some((r) => r.stamp === "twopass-v999")).toBe(false);
  });

  it(`⭐ 沒有任何**出貨**文件的圖示帶著 ${OBSOLETE}`, () => {
    const bad = shippedIcons().filter((r) => r.stamp?.startsWith(OBSOLETE));
    expect(
      bad.map((r) => `${r.doc} → ${r.icon}`),
      `⛔ 這幾份出貨文件還用著舊畫風的圖 ⇒ 重畫它們：\n` +
        `   cd tools/icon-gen && .venv/bin/python local/batch.py --only <id…>\n` +
        `⚠️ ⛔ 而 content/_legacy/ 底下的**不算** —— 那些英雄今天不出貨，\n` +
        `   而它們的圖仍被 legacy 文件引用著（⛔ 搬走會打斷引用，見 GH#1137）。`,
    ).toEqual([]);
  });
});
