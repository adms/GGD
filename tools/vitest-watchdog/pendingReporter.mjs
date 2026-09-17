/**
 * ⏲️ GH#1257 —— **只記錄**「還沒跑完的測試檔」，⛔ 不判死。
 *
 * 09-13 那次卡了 4 小時 48 分，log 的最後幾行是一條**通過了**的 345 秒測試 ——
 * ⭐ 卡死的當下沒有任何東西印得出「還沒跑完的是哪幾個檔」，於是連根因票都開不出來。
 * ⇒ 這支在主行程裡持續把清單寫進一個檔，看門狗（`scripts/watchdog.sh --attach`，
 *   判死準則的唯一住處）開火時把它印出來。
 *
 * ⚠️ 它是**設定裡的 reporter** ⇒ CLI 的 `--reporter` 會整份蓋掉它。那時看門狗照樣開火，
 *   只是會明說「沒有未結束檔清單」（⛔ 不是安靜地少一段）。
 */
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

/** 清單落點 —— globalSetup（交給看門狗）與這支（寫入）共用同一個公式。 */
export const pendingFileFor = (pid) => join(tmpdir(), `ggd-vitest-pending-${pid}.txt`);

const FINISHED = new Set(["pass", "fail", "skip", "todo"]);

export default class PendingReporter {
  onInit(ctx) {
    this.ctx = ctx;
    this.file = pendingFileFor(process.pid);
    this.queued = new Set();
    this.running = new Set();
  }

  onPathsCollected(paths = []) {
    for (const p of paths) this.queued.add(p);
    this.flush();
  }

  /** 收集完的檔：收集就失敗的（import 炸掉）直接算結束，其餘進「執行中」。 */
  onCollected(files = []) {
    for (const f of files) this.mark(f.filepath, f.result?.state ?? "run");
    this.flush();
  }

  onTaskUpdate(packs = []) {
    for (const [id, result] of packs) {
      const task = this.ctx?.state.idMap.get(id);
      if (task && "filepath" in task) this.mark(task.filepath, result?.state);
    }
    this.flush();
  }

  /** 全部回報完之後還卡住 ＝ 卡在收尾（teardown／pool.close）—— 清單要說這句，⛔ 不是變成空的。 */
  onFinished() {
    clearTimeout(this.timer);
    this.timer = undefined;
    // 沒有看門狗掛著（OFF／watch）⇒ 沒有人會收這個檔，自己收
    if (process.env.GGD_VITEST_WATCHDOG_PID !== String(process.pid)) return rmSync(this.file, { force: true });
    try {
      writeFileSync(this.file, "（每個測試檔都已回報結束 —— 卡在收尾：globalSetup teardown／pool.close）\n");
    } catch {
      // 同 flush
    }
  }

  mark(path, state) {
    if (!path) return;
    this.queued.delete(path);
    if (FINISHED.has(state)) this.running.delete(path);
    else this.running.add(path);
  }

  /** 最多每 200ms 寫一次；計時器 unref ⇒ ⛔ 不會替主行程續命。 */
  flush() {
    if (this.timer || this.ctx?.config.watch) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const root = this.ctx?.config.root ?? process.cwd();
      const lines = [
        ...[...this.running].map((p) => `執行中  ${relative(root, p)}`),
        ...[...this.queued].slice(0, 20).map((p) => `未開始  ${relative(root, p)}`),
        ...(this.queued.size > 20 ? [`未開始  …另外 ${this.queued.size - 20} 個`] : []),
      ];
      try {
        writeFileSync(this.file, lines.length ? `${lines.join("\n")}\n` : "");
      } catch {
        // ⚠️ 寫不進 tmpdir ⇒ 看門狗會說「沒有清單」，⛔ 不讓一份清單弄壞一整跑測試
      }
    }, 200);
    this.timer.unref?.();
  }
}
