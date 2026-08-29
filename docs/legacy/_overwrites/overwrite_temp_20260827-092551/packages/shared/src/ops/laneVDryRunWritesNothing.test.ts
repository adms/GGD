/**
 * GH#769 —— `--dry-run` 不可以留下「看起來已安裝」的轉檔紀錄。
 *
 * 缺陷不住在紀錄裡、也不住在 `.glb` 裡，住在**兩者對不上**：紀錄寫著
 * `verdict: "ok"`，而磁碟上一個位元組都沒動。分別檢查每一半都是綠的 ——
 * 而它已經在 main 上活過一次（`convert-tornadoelemental.json` 與 `.glb` 同一個
 * commit 進來，紀錄卻是 dry-run 的產物）。
 *
 * 兩條斷言各釘一個驗收條件，⛔ 不是同一件事的兩個角度：
 *   ① `--dry-run` 之後那兩個目錄**逐位元組**不變（＝票上的 `git status` 空的）
 *   ② `--check` 綠：每一筆紀錄都對得上一顆**真的在磁碟上**的 `.glb`
 *
 * ⚠️ ① 刻意**不看離開碼**：沒有 retail MPQ 的機器上轉檔會失敗，而「失敗了也不准
 * 寫檔」正是這條要守的東西 —— 綁上離開碼會讓這條在最需要它的環境裡消失。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const SCRIPT = join(REPO, "tools", "w3x-import", "convert_stock_model.py");
const WATCHED = [
  join(REPO, "tools", "w3x-import", "out", "stock"),
  join(REPO, "content", "assets", "models", "imported"),
];

function findPython(): string | null {
  for (const c of ["python3", "/usr/local/bin/python3", "/opt/homebrew/bin/python3", "/usr/bin/python3"]) {
    try {
      execFileSync(c, ["-c", "import json"], { stdio: "pipe" });
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}
const PY = findPython();
const why = PY === null ? "沒有 python3" : !existsSync(SCRIPT) ? "找不到轉檔腳本" : "";
// ⛔ fail-open 沒錯，**靜默**才是缺陷。
if (why) console.warn(`⚠️ laneVDryRunWritesNothing 沒驗到：${why}`);

/** dir -> "name:size:sha256" 一行一個檔。⛔ 不比 mtime（乾淨簽出會把它全部重設）。 */
function snapshot(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => {
      const b = readFileSync(join(dir, f));
      return `${f}:${b.length}:${createHash("sha256").update(b).digest("hex").slice(0, 16)}`;
    });
}

describe.skipIf(why !== "")("GH#769 · 轉檔鏈的 --dry-run 與紀錄對帳", () => {
  it("★ --dry-run 跑完，紀錄目錄與模型目錄逐位元組不變", () => {
    const before = WATCHED.map(snapshot);
    try {
      execFileSync(PY!, [SCRIPT, "tornadoelemental", "--dry-run"], {
        cwd: REPO,
        stdio: "pipe",
        timeout: 180_000,
      });
    } catch {
      // 轉檔本身失敗（多半是沒有 retail MPQ）⇒ 更要驗它沒有寫檔。
    }
    WATCHED.forEach((dir, i) => {
      expect(
        snapshot(dir),
        `⛔ --dry-run 動了 ${dir.slice(REPO.length + 1)} —— 一筆沒發生過的事實正在被寫進紀錄`,
      ).toEqual(before[i]);
    });
  }, 200_000);

  it("★ --check：每一筆轉檔紀錄都對得上一顆磁碟上真的存在的 .glb", () => {
    let out = "";
    let code = 0;
    try {
      out = execFileSync(PY!, [SCRIPT, "--check"], { cwd: REPO, encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    }
    expect(out, out).toContain("轉檔紀錄");
    expect(code, out).toBe(0);
  }, 60_000);
});
