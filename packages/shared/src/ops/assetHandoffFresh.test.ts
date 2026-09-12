/**
 * 🧾 **素材缺口交接單不可以過期** —— `docs/素材缺口交接單.md`。
 *
 * owner 2026-09-12（逐字）：
 * > 「你應該要 commit 加上日期 讓別的工作流可以讀到 **但又不會讓日後的工作流誤會**」
 *
 * ## ⛔ 為什麼「加一個日期」不夠
 *
 * 一個日期是**散文** —— 它在過期之後長得跟沒過期**一模一樣**，
 * 而這個 repo 已經記錄過五次「一句活過保存期限的散文，而沒有任何東西變紅」。
 * ⇒ ⭐ 交接單的頭上記著一枚**資料指紋**（哪些英雄缺哪一軸），這條閘逐次重算並比對它。
 *
 * ⚠️ 指紋**刻意不含日期與 commit** —— 隨時鐘變動的欄位會讓比對永遠不相等，
 * 於是 `--check` 只能被放寬成模糊比對，⭐ 而一條被放寬的閘等於沒有閘
 * （同 `skillSpecFresh` / `caps:export` 刻意不放產生日期的理由）。
 *
 * 它紅了**不要改這條測試**，重產一份：
 *   `python3 tools/hero-intake/make-asset-handoff.py --out docs/素材缺口交接單.md`
 *
 * ── 突變紀錄 ───────────────────────────────────────────────────────
 *  · 在 MANIFEST 裡假裝 `godie-e00s` 有了語音包 → 指紋 4145e5ec… → 39068b51…，
 *    `--check` exit 2 並指名兩個指紋；還原後回綠。實測過。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "../../../..");

describe("素材缺口交接單 (docs/素材缺口交接單.md)", () => {
  it("⭐ 文件裡的缺口清單與**今天的 repo** 一致", () => {
    const r = spawnSync("python3", ["tools/hero-intake/make-asset-handoff.py", "--check"], {
      cwd: REPO, encoding: "utf8", timeout: 180_000,
    });
    expect(
      r.status,
      `${r.stdout}${r.stderr}\n` +
        "⇒ 交接單描述的缺口已經不是現況了。⛔ 不要改這條測試，重產一份：\n" +
        "   python3 tools/hero-intake/make-asset-handoff.py --out docs/素材缺口交接單.md",
    ).toBe(0);
  });
});
