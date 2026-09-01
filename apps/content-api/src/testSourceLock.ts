/**
 * ⭐⭐ **同一份真實檔案的互斥鎖** —— 給那兩支會寫 `tools/skill-remake/heroes/*.py`
 * 的測試用（`editorSourceRoutes.test.ts` ⑤ 與 `editorSourceSurvivesSync.test.ts`）。
 *
 * ── ⛔ 為什麼需要它 ────────────────────────────────────────────────────────
 * 兩支測試**寫同一個真實 repo 檔**。vitest 預設**跨檔平行** ⇒
 * ⚠️ 一支剛寫進去、另一支的 CAS 讀到的就是對方的位元組 ⇒ 409。
 * ⭐ 而它**只在兩支一起跑時**發生：各自單跑永遠是綠的（2026-09-02 實測）——
 * ⛔ 那是最糟的一種紅：它看起來像隨機失敗。
 *
 * ⇒ ⭐ 與這個 repo 對 `pnpm skills:sync` 的做法同構：**一把全域鎖**，
 * ⛔ 不是「排程時記得不要讓它們同時跑」。
 */
import { existsSync, mkdirSync, openSync, closeSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK = join(tmpdir(), "ggd-skill-source.lock");

/** ⭐ 阻塞式取鎖。⛔ 逾時就擲例外（一把拿不到的鎖要**說出來**，不是靜靜地跑下去）。 */
export async function withSourceLock<T>(fn: () => Promise<T> | T, timeoutMs = 15 * 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      // `wx` = 只在檔案不存在時建立 ⇒ 原子的 test-and-set。
      mkdirSync(tmpdir(), { recursive: true });
      closeSync(openSync(LOCK, "wx"));
      break;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(
          `⛔ 等 ${LOCK} 超過 ${Math.round(timeoutMs / 1000)}s —— ` +
            `⭐ 上一支測試可能沒有釋放它（手動刪掉那個檔）。`,
        );
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    return await fn();
  } finally {
    // ⭐ **一定要**釋放 —— ⛔ 一把沒釋放的鎖會讓下一輪整批卡住。
    if (existsSync(LOCK)) rmSync(LOCK, { force: true });
  }
}
