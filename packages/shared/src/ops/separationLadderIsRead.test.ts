/**
 * ⭐⭐ GH#756 AC2+AC4 —— 分離度門檻**只有一個住處**（`_separation-qc-gate.json`）。
 *
 * 在此之前 `tools/voice-gen/build_voice_audition.py` 寫死著 n=1 那一列
 * （0.50 / 0.40），而閘的階梯有 **7 列**（n=1…8）。⇒ 語料長到每人 8 段之後，
 * 這支工具仍拿 n=1 的門檻在判 —— ⚠️ ⭐ 而**門檻隨 n 變嚴**
 * （confusable 0.50 → 0.85）⇒ 拿鬆的去判嚴的材料 ⇒ ⭐ **幾乎什麼都不會被標記**，
 * 而報告讀起來跟「全部通過」一模一樣（第二守則的 🟢 假綠燈第⑩型）。
 *
 * ⭐ 同時是 AC2：在此之前 `separation-qc-gate` 這個名字**一個程式檔都沒有引用**。
 *
 * MUTATION LOG：把 python 裡 `LADDER.update(...)` 那一行刪掉 → ①紅（LADDER 空）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PY = join(REPO, "tools/voice-gen/build_voice_audition.py");
const GATE = join(REPO, "content/assets/audio/voices/_separation-qc-gate.json");

describe("GH#756 分離度門檻讀自閘，⛔ 不是字面常數", () => {
  const src = readFileSync(PY, "utf8");

  it("★ ⭐ 那三個字面常數**不在了**（AC4）", () => {
    for (const dead of ["CAMPPLUS_CONFUSABLE = ", "CAMPPLUS_TARGET = "]) {
      expect(src, `⛔ ${dead} 還在 —— 那是門檻的第二個住處`).not.toContain(dead);
    }
  });

  it("★ ⭐ 這支程式**真的引用**了閘（AC2：在此之前零執行者）", () => {
    expect(src).toContain("_separation-qc-gate.json");
    expect(src, "⛔ 讀了檔卻沒有把值裝進去 —— 那是失敗形態⑧").toContain("LADDER.update(");
  });

  it("★ ⭐ 階梯**往下取**：n=7 要用 n=6 那一列（⛔ 不外插、⛔ 不往上取）", () => {
    // ⚠️ 往上取會用到更嚴的門檻 ⇒ 該標記的對子靜默消失。
    expect(src).toContain("<= max(1, clips_per_champion)");
    expect(src).toContain('max(usable, key=lambda r: int(r["clipsPerChampion"]))');
  });

  it("⭐ 閘自己的 n=8 列就是票文點名的那組數字（⛔ 不抄字面值進斷言）", () => {
    const rows = (JSON.parse(readFileSync(GATE, "utf8")) as {
      thresholdLadder: { rows: { clipsPerChampion: number }[] };
    }).thresholdLadder.rows;
    const n8 = rows.find((r) => r.clipsPerChampion === 8);
    expect(n8, "⛔ 閘沒有 n=8 那一列 —— 階梯本身漂了").toBeDefined();
    // ⭐ 只斷言「比 n=1 嚴」這個**關係**，⛔ 不釘死 0.85（第零守則：不測數值）
    const n1 = rows.find((r) => r.clipsPerChampion === 1)!;
    const g = (r: unknown, k: string): number => (r as Record<string, number>)[k]!;
    expect(g(n8, "confusableAdopted")).toBeGreaterThan(g(n1, "confusableAdopted"));
  });

  it("⭐ 每人幾段取 **min**，⛔ 不是平均（一位只有 1 段的英雄要能把整批拉回 n=1）", () => {
    expect(src).toContain("min(per.values())");
  });
});
