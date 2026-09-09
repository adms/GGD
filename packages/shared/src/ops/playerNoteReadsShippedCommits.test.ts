import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **一支只讀「票說了什麼」的腳本，答不出「這一版出貨了什麼」。**
 *
 * owner 2026-09-09（逐字）：
 *   「逐版重讀 commit 挖真內容 => 動畫更順拉 網路更快響應阿 編輯器多支援某功能
 *     哪些角色已經設計正在上架審查 哪些已經上架成功 哪些角色更換造型 等 都是
 *     根本就一堆 你怎麼可以這麼偷懶 都不寫」
 *
 * ⭐ 根因鏈（三環，全部量到）：
 *   ① 這支腳本的**整個宇宙是票的進度標記** ⇒ 沒有人寫 ⇒ 它以為沒事發生。
 *   ② 被擋住時它給兩個出口（寫一句／答「無」）⇒ ⭐ 最便宜的是「無」——
 *      我一次答了 13 張。**那道閘把人訓練成發罐頭。**
 *   ③ ⭐ 帳本本身是窄的：117 列 63 列罐頭；54 句真內容裡介面 14 · 戰鬥 13，
 *      ⛔ 而「角色上架／造型」只有 **1** 句。⇒ 讀著它長大的人學到的
 *      「玩家看得到」＝「戰鬥或按鈕」。
 *
 * ⭐ 代價量到了：**v0.41.5 有 26 顆玩家面向的 commit，發出去的是「系統優化更新」。**
 *
 * ⇒ 這條守的是**第二個資料來源**：出貨程式碼動了而沒有人寫一句 ⇒ ⛔ 擋下。
 */

const REPO = join(import.meta.dirname, "../../../..");
const SCRIPT = join(REPO, "scripts/release-note-players.sh");

/** ⭐ 假 gh（票庫全空）—— 這樣唯一的訊號就只剩 commit。 */
function run(since: string, until: string): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "ggd-sc-"));
  writeFileSync(join(dir, "gh"), `#!/bin/sh\ncase "$*" in\n  *"issue list"*) : ;;\nesac\n`);
  chmodSync(join(dir, "gh"), 0o755);
  const ledger = join(dir, "_announced.tsv");
  writeFileSync(ledger, "");
  try {
    return {
      code: 0,
      out: execFileSync("bash", [SCRIPT, "--since", since, "--until", until], {
        cwd: REPO, encoding: "utf8", timeout: 120_000,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
               GGD_PLAYERNOTE_CACHE: "", GGD_ANNOUNCE_LEDGER: ledger },
      }),
    };
  } catch (e) {
    const x = e as { status?: number; stdout?: string };
    return { code: x.status ?? -1, out: x.stdout ?? "" };
  }
}

describe("玩家公告要讀**這一版出貨了什麼**，⛔ 不只是票說了什麼", () => {
  it("① 有玩家面向的 commit 而沒有一句 ⇒ ⛔ 擋下，⭐ 並把那幾行印出來", () => {
    const { code, out } = run("v0.41.4", "v0.41.5"); // ⭐ 26 顆，而它發過罐頭
    expect(code, `⛔ 26 顆 commit 的一版被發成罐頭了\n${out.slice(0, 400)}`).toBe(1);
    expect(out).toMatch(/玩家面向的 commit/);
    expect(out, "⛔ 只說「有幾顆」不夠 —— 要看得見是哪幾顆").toMatch(/feat\(|fix\(/);
  });

  it("② ⭐ 擋下時要把**六個類別**列出來（⛔ 不是讓人自己想）", () => {
    const { out } = run("v0.41.4", "v0.41.5");
    for (const k of ["動畫", "網路", "編輯器", "審查", "上架", "造型"]) {
      expect(out, `⛔ 沒提示「${k}」這一類 —— 而帳本的偏見正是這樣傳染的`).toContain(k);
    }
  });

  it("③ 真的沒有玩家面向 commit 的一版 ⇒ ⭐ 照常發（⛔ 證明①不是一律擋）", () => {
    const { code, out } = run("v0.41.2", "v0.41.3"); // ⭐ 0 顆
    expect(code, `⛔ 一版純文件的也被擋 ⇒ 那條閘沒用\n${out.slice(0, 300)}`).toBe(0);
    expect(out).toContain("系統優化更新");
  });
});
