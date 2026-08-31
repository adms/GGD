/**
 * ⭐⭐ GH#841 Scope④ —— 出貨 `.glb` 的**後處理鏈**要說得出自己有幾層。
 *
 * ── ⭐ 這條閘回答的問題 ──────────────────────────────────────────────────────
 * 「重跑轉檔器為什麼會毀資料？」
 * ⛔ 答案不是「轉檔器有 bug」，是 ⭐ **出貨樹上疊著轉檔器不知道的四層後處理**：
 *   ① `strip_geoset_prims.py`  拿掉 GEOA 藏起來的特效 primitive（#59）
 *   ② `rebake_stripped.py`     重烘過特效 geoset 閘（#17/#32）
 *   ③ `rebake_textures.py`     換掉 8×8 灰色佔位貼圖（#33）
 *   ④ `flatten_root_float.py`  殺掉 root-motion 浮空（#162）
 *
 * ⇒ ⭐ **裸重跑 `convert_stock_model.py` ＝ 把這四層全部丟掉。**
 * 而 2026-08-31 量到的「重跑 129 份裡 **10 份掉 TeamGlow**」，掉的就是 ①② 的產物。
 *
 * ⚠️ ⭐ **沒有任何東西會紅** —— glb 仍然合法、載得進去、畫得出來，只是少了一層。
 *
 * ── ⭐ 所以這條閘守的是「那份清單存在且完整」──────────────────────────────
 * ⛔ 它**不**重跑產線（那要 blender/mdx，⛔ 不在一般 CI）。
 * ⭐ 它守的是：那四支腳本**都還在**，而且清單**逐支列到它們**。
 * ⇒ 有人加第五層後處理而沒寫進清單 ⇒ 紅（下一個重跑的人就會靜靜丟掉它）。
 *
 * MUTATION LOG：清單裡刪掉任一支 → ①紅並指名。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CHAIN = join(REPO, "tools/w3x-import/POSTPROCESS_CHAIN.md");

/**
 * ⭐ 每一支**會改寫出貨 glb** 的腳本。
 * ⚠️ 判準是「它寫不寫 `content/assets/models/`」，⛔ 不是「它叫什麼名字」。
 */
const POSTPROCESSORS = [
  "strip_geoset_prims.py",
  "rebake_stripped.py",
  "rebake_textures.py",
  "flatten_root_float.py",
];

describe("GH#841 Scope④ 出貨 glb 的後處理鏈", () => {
  it("★ ⭐ 那份鏈的說明**存在**（⛔ 沒有它，下一個人只會再裸重跑一次）", () => {
    expect(existsSync(CHAIN), "⛔ tools/w3x-import/POSTPROCESS_CHAIN.md 不見了").toBe(true);
  });

  it("★ ⭐ 四層後處理**逐支列在清單裡**（⛔ 漏一支＝下一次重跑靜靜丟掉它）", () => {
    const md = readFileSync(CHAIN, "utf8");
    const missing = POSTPROCESSORS.filter((s) => !md.includes(s));
    expect(
      missing,
      [
        "⛔ 這幾支後處理**不在鏈的說明裡**：",
        ...missing.map((s) => `  · ${s}`),
        "⭐ 它們會改寫出貨的 .glb，而轉檔器不知道它們存在。",
        "⇒ 補進 tools/w3x-import/POSTPROCESS_CHAIN.md 的表。",
      ].join("\n"),
    ).toEqual([]);
  });

  it("★ ⭐ 那四支腳本**都還在**（⛔ 清單指到不存在的檔＝一份說謊的說明）", () => {
    const gone = POSTPROCESSORS.filter((s) => !existsSync(join(REPO, "tools/w3x-import", s)));
    expect(gone, "⛔ 清單指到不存在的腳本").toEqual([]);
  });

  it("⭐ 清單說得出**為什麼**不可以裸重跑（⛔ 一張沒有理由的表沒有人會照做）", () => {
    const md = readFileSync(CHAIN, "utf8");
    expect(md, "⛔ 沒提 TeamGlow —— 那是無聲損失的唯一可量訊號").toContain("TeamGlow");
    expect(md).toContain("convert_stock_model.py");
  });
});
