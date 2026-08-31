/**
 * ⭐⭐ GH#751 —— 第二形態的球體附掛，**最終世界尺寸**要落在同一級。
 *
 * ── ⭐ 這條守衛驗的是「兩個名詞的關係」，⛔ 不是任何一格數字 ────────────
 * 一個掛件的實際大小是**三個數字的乘積**：
 *   `model@1.scale` × `attachment@1.scale` × glb 高度
 * ⇒ ⛔ 分別檢查每一格**永遠是綠的**（CLAUDE.md 的配對式後置條件）——
 *   而 GH#432 記過的災難正是「預設 1 會讓翅膀有角色的 4.6 倍大」。
 *
 * ⚠️ ⭐ 而它為什麼**不是**釘死一個數字（第二守則：驗機制⛔ 不驗數字）：
 * 這裡釘的是**一個區間**，而區間的兩端各自回答一件事 ——
 *   下界：⛔ 小到看不見（等於沒掛）
 *   上界：⛔ 大到蓋住角色（GH#432 的形狀）
 * ⇒ 兩邊都要有（CLAUDE.md：「欄位要有上界，不是只有下界」）。
 *
 * ── 2026-08-31 量到的五筆 ────────────────────────────────────────────────
 *   godie-e00x 0.729 · godie-u01u 0.715 · godie-o00x 0.707（**出貨三筆**）
 *   godie-ntin 1.076 · godie-o02w 0.726（本輪新增）
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把 `attach.godie-o02w.1hswd-01` 的 scale 改成 1（GH#432 的預設）→ 紅
 *   · 把 `imported.1hswd-01` 的 model scale 改成 1 → 紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const read = (p: string): Record<string, never> =>
  JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

/** glb 高度的來源 —— ⭐ 轉檔器的報告，⛔ 不是我抄一份。 */
function heights(): Record<string, number> {
  const r = read("tools/w3x-import/out/GoDieEX22s/models_report.json") as unknown;
  const rows = (Array.isArray(r) ? r : (r as { models?: unknown[] }).models ?? []) as {
    name?: string;
    height?: number;
  }[];
  const out: Record<string, number> = {};
  for (const x of rows) if (x.name && typeof x.height === "number") out[x.name.toLowerCase()] = x.height;
  return out;
}

describe("GH#751 球體附掛的最終尺寸", () => {
  const amb = read("content/config/ambient-vfx.json") as unknown as {
    bindings: Record<string, { vfx: string }[]>;
  };
  const H = heights();
  const rows = Object.entries(amb.bindings).flatMap(([cid, bs]) =>
    bs.filter((b) => b.vfx.startsWith("attach.")).map((b) => ({ cid, vfx: b.vfx })),
  );

  it("量尺先自證：讀得到掛件、model doc 與高度（⛔ 讀不到會讓下面空過）", () => {
    expect(rows.length, "⛔ 一筆 attach.* 都沒有").toBeGreaterThanOrEqual(5);
    expect(Object.keys(H).length, "⛔ 高度表是空的").toBeGreaterThan(50);
  });

  it("★ ⭐ **每一筆的最終世界尺寸都在 0.3–1.6 u**（⛔ 不是分別檢查三格）", () => {
    const bad: string[] = [];
    for (const { cid, vfx } of rows) {
      const a = read(`content/vfx/${vfx}.json`) as unknown as { modelKey: string; scale: number };
      const mp = `content/models/${a.modelKey}.json`;
      expect(existsSync(resolve(ROOT, mp)), `⛔ ${vfx} 指到不存在的 ${a.modelKey}`).toBe(true);
      const m = read(mp) as unknown as { scale: number };
      const h = H[a.modelKey.split(".").slice(1).join(".").toLowerCase()];
      expect(h, `⛔ ${a.modelKey} 在轉檔報告裡沒有高度`).toBeGreaterThan(0);
      const final = m.scale * a.scale * h!;
      if (!(final >= 0.3 && final <= 1.6)) bad.push(`${cid} ${vfx} ⇒ ${final.toFixed(3)}u`);
    }
    expect(
      bad,
      "⛔ 下界＝小到看不見（等於沒掛）；上界＝大到蓋住角色（GH#432：預設 1 讓翅膀有角色的 4.6 倍大）",
    ).toEqual([]);
  });

  it("⭐ 每一份掛件的 `note` 都寫得出 scale 的**出處**（⛔ 不是挑的）", () => {
    for (const { vfx } of rows) {
      const a = read(`content/vfx/${vfx}.json`) as unknown as { note?: string };
      expect(a.note ?? "", `⛔ ${vfx} 的 scale 沒有出處 —— 那就是一個推測`).toMatch(/\d\.\d+\s*\/\s*\d\.\d+|models_report/);
    }
  });
});
