/**
 * 狀態頁的閘：**兩種「對不上」要分開**，⛔ 而且不可以叫人跑會毀資料的指令（GH#870）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼（2026-08-29 量到）
 * ---------------------------------------------------------------------------
 * 任務帳本住 `~/.claude/tasks/<session-id>/` —— ⭐ 它是 **session 專屬且會自我刪除**的。
 * `docs/requirements-status.md` 於 2026-08-28 21:17 由 `1fc1e42e-…`（**286 筆**）產生，
 * 而那個目錄 23:48 就被清掉了；今天整台機器只剩 `c1013162-…`（**5 筆**，08-16）。
 *
 * ⇒ ⭐ 這道閘**結構上不可能再綠**（失敗形態⑨），
 * ⚠️ 而它的訊息逐字叫人 `re-run the generator` —— 照做會把 **281 列砍掉**。
 * CLAUDE.md 記過同一族：「錯誤訊息**指著錯方向**，於是每個人都以為是自己的環境壞了」。
 *
 * ⚠️⚠️ **改之前先查那一份是誰的**：`bash scripts/genguard.sh docs/requirements-status.md`
 *   · 產生器的產物 ⇒ 改**來源**（`tools/status/gen_status.py`）再
 *     `bash scripts/genrun.sh docs:status`。
 *     ⛔ 直接手改那份 md 會被下一次 sync 打回來（`docs:status` 就在 `skills:sync` 鏈上），
 *     而那個「又紅了」看起來像**新的**錯。
 *   ⭐ ⚠️ **而這一支正是那條修法的例外**：來源（任務帳本）本身**已經消失**
 *     ⇒ 這一次 ⛔ 不要重跑產生器（會砍掉 281 列），⛔ 也不要手改它 —— 見下面②。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 這條守衛驗**三個方向**（⛔ 一把只驗單邊的尺不算自證過）
 * ---------------------------------------------------------------------------
 * ① ledger **比頁面多** ⇒ 真漂移 ⇒ **仍然非零**（⛔ 沒有被放寬）
 * ② ledger **比頁面少** ⇒ 來源已消失 ⇒ **放行**，⭐ 而且訊息要說「⛔ 不要重跑」
 * ③ `GGD_STATUS_STRICT=1` ⇒ ②也非零（⭐ 一鍵回到舊行為 ＝ owner 的 rollback 開關）
 *
 * 突變紀錄：把 `res["total"] > page_total` 改回無條件 `!=` ⇒ ② 紅。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const run = (env: NodeJS.ProcessEnv): { code: number; out: string } => {
  const r = spawnSync("python3", ["tools/status/gen_status.py", "--check"], {
    cwd: REPO,
    encoding: "utf-8",
    env: { ...process.env, ...env },
    timeout: 120_000,
  });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

/** 造一個有 n 筆任務的帳本目錄。 */
function ledgerWith(n: number): string {
  const d = mkdtempSync(join(tmpdir(), "ggd-ledger-"));
  for (let i = 1; i <= n; i++)
    writeFileSync(join(d, `${i}.json`), JSON.stringify({ id: i, status: "completed", subject: "x" }));
  return d;
}

describe("狀態頁的閘不會叫你毀資料（GH#870）", () => {
  it("① ledger 比頁面**多** ⇒ 真漂移 ⇒ 仍然非零（⛔ 沒有被放寬）", () => {
    const r = run({ GGD_TASK_LEDGER: ledgerWith(400) });
    expect(r.code, `⛔ 真的漂移了卻放行 —— 這條閘被放寬了：\n${r.out}`).not.toBe(0);
    expect(r.out).toContain("UNDERCOUNTS");
  });

  it("② ledger 比頁面**少** ⇒ 放行，⭐ 而且明說「⛔ 不要重跑」", () => {
    const r = run({ GGD_TASK_LEDGER: ledgerWith(3) });
    expect(r.code, `⛔ 一個永遠不會綠的閘（失敗形態⑨）：\n${r.out}`).toBe(0);
    expect(r.out, "⛔ 放行了卻沒說為什麼 —— 靜默的 fail-open 才是缺陷").toContain("不要");
  });

  it("③ GGD_STATUS_STRICT=1 ⇒ ②也非零（⭐ owner 的一鍵 rollback）", () => {
    const r = run({ GGD_TASK_LEDGER: ledgerWith(3), GGD_STATUS_STRICT: "1" });
    expect(r.code, `⛔ 逃生口沒有效 —— 那就不是一個開關：\n${r.out}`).not.toBe(0);
  });
});
