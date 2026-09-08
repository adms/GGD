/**
 * 🧾 GH#1077 —— 沙盒解鎖 `ensureUserWritable()` 的薄守衛（體驗層一條，⛔ 不開對抗輪）。
 *
 * CI 上紅的形狀：`chmod -R u+w` 走到 `.git/objects/` 時 bucket 被 git 的背景維護 rmdir ⇒ ENOENT ⇒ 整條測試紅。
 * 這裡把那個「走到一半消失」用注入的 lstat **確定性地**造出來（真的競態造不出來），
 * 並且把 444 檔、555 目錄、dangling symlink、`.git` 裡的 444 loose object 放在同一棵假沙盒上。
 *
 * 突變（落地前跑過）：把 `ensureUserWritable` 裡 `if (isEnoent(e)) { out.vanished++; continue; }` 拿掉
 *   ⇒ 紅（注入的 ENOENT 直接擲出，訊息「沙盒解鎖失敗於 …/content/gone.json」）。
 */
import { describe, expect, it } from "vitest";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUserWritable } from "./testSourceSandbox";

const writable = (p: string): boolean => (statSync(p).mode & 0o200) !== 0;

describe("GH#1077 沙盒解鎖：逐檔、容錯、⛔ 不進 .git", () => {
  it("444 檔＋555 目錄解鎖、dangling symlink 與 .git 不碰、走到一半消失的檔略過 —— 全程不擲", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-unlock-1077-"));
    const abilities = join(root, "content/abilities");
    try {
      const product = join(abilities, "x.json");
      const gitObj = join(root, ".git/objects/01/deadbeef");
      const dangling = join(root, "content/dangling.json");
      mkdirSync(abilities, { recursive: true });
      mkdirSync(join(root, ".git/objects/01"), { recursive: true });
      writeFileSync(product, "{}"); chmodSync(product, 0o444);
      writeFileSync(gitObj, "o"); chmodSync(gitObj, 0o444); // loose object 本來就是 444
      writeFileSync(join(root, "content/gone.json"), "g"); // 「走到一半消失」：下面的 lstat 對它注入 ENOENT
      symlinkSync(join(root, "content/nowhere.json"), dangling);
      chmodSync(abilities, 0o555);
      const enoent = (p: string): never => { const e = new Error(`ENOENT ${p}`) as NodeJS.ErrnoException; e.code = "ENOENT"; throw e; };
      const r = ensureUserWritable(root, (p) => (p.endsWith("gone.json") ? enoent(p) : lstatSync(p)));
      expect(writable(product), "444 產物沒解鎖").toBe(true);
      expect(writable(abilities), "555 目錄沒解鎖").toBe(true);
      expect(writable(gitObj), ".git 被動了 —— 那正是 CI 上與 git 背景維護撞車的地方").toBe(false);
      expect(lstatSync(dangling).isSymbolicLink(), "dangling symlink 被動了").toBe(true);
      expect(r, "計數：解鎖 2（檔＋目錄）、消失 1").toEqual({ unlocked: 2, vanished: 1 });
    } finally {
      chmodSync(abilities, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
