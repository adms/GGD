/**
 * 🔒 產物隔離區（owner 2026-08-25：「產物…只能靠產生器去操作修改」）的**寫入端 API**。
 *
 * 隔離用檔案權限：出貨產物平時 `chmod 444` ⇒ 任何通道的直寫（含 python/node 檔案 API
 * ——genguard hook 看不見的那條、上百次事故的真正通道）都吃 `EACCES`。
 *
 * ⭐ 但**產生器對自己的產物**是合法寫入者。它們統一走這一支：先解鎖再寫。
 *
 * ⚠️ 為什麼不是「產生器跑之前整批 unlock」就夠：
 *   ① 產生器也在**沙盒複本**裡跑（測試把 `content/` `cpSync` 到 temp —— cp **保留**
 *      444 模式 ⇒ 複本一樣鎖著,而那個複本不在 `sync-io.json` 的戶籍裡,批次 unlock
 *      掃不到它）。2026-08-25 `generateFamilyContent` / `buildIndexes` 的沙盒測試就是
 *      這樣紅的。
 *   ② 一支產生器**新增**的檔第一次寫時還不存在 ⇒ 批次 unlock 當然也沒有它。
 * ⇒ 解鎖的責任跟著**寫的那一行**走,⛔ 不是跟著「跑之前」的那個時機走。
 */
import { chmodSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 寫一份產生器產物：已存在就先解鎖（⛔ 不改變它之後由隔離區重新上鎖的事實）。 */
export function writeProduct(path: string, body: string | Uint8Array): void {
  if (existsSync(path)) {
    try {
      chmodSync(path, 0o644);
    } catch {
      // 只讀檔案系統/別人的檔 —— 讓下面的 write 用它自己的錯誤說話,⛔ 不吞。
    }
  }
  writeFileSync(path, body);
}

/**
 * 把出貨產物**複製到沙盒**之後解除隔離（遞迴 chmod +w）。
 *
 * ⚠️ `cpSync` **保留模式** ⇒ 444 的產物複製過去還是 444，而沙盒是測試自己的工作區：
 * 它本來就該可寫（複本不在 `sync-io.json` 的戶籍裡，批次 unlock 掃不到它）。
 * ⛔ 這不是繞過隔離區 —— 隔離守的是 **repo 工作樹裡**那一份出貨產物。
 */
export function unlockSandbox(dir: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      unlockSandbox(p);
      continue;
    }
    try {
      chmodSync(p, 0o644);
    } catch {
      /* 不是我們的檔就跳過 */
    }
  }
}
