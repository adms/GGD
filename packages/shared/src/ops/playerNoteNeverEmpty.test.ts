import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **一個沒有玩家公告的版本，讓玩家以為專案停擺了。**
 *
 * owner 2026-08-30（逐字，⭐ 常設指令）：
 *
 * > 「如果沒有對玩家有差別的改版你還是要發 **系統優化更新**」
 *
 * ⚠️ ⭐ 為什麼這條是必要的：**不發 ＝ 讓玩家以為沒動靜**。
 *   一個持續在更新的專案，如果只在「有新東西」那幾天出聲，
 *   ⛔ 其餘每一天看起來都像停擺 —— 而那與**真的停擺**長得一模一樣。
 *
 * ⇒ ⭐ 判準不是「這一版有沒有新東西」，是「**這一版有沒有出貨**」。出貨就要說。
 *
 * ⚠️ ⭐ 這條閘擋的是**我上一次的判斷**：v0.32.8 / v0.32.9 我**刻意跳過**了公告，
 *   理由寫得很有道理（「把上一版的八行再貼一次是噪音」）——
 *   ⛔ 而那個理由只解釋了「不要重複發舊的」，**沒有解釋為什麼可以什麼都不發**。
 *   ⇒ ⭐ 一個聽起來合理的理由，⛔ 不等於一個對的決定。
 */

const REPO = join(import.meta.dirname, "../../../..");
const SCRIPT = join(REPO, "scripts/release-note-players.sh");

describe("玩家公告永遠不會是空的（owner 2026-08-30 常設指令）", () => {
  it("⭐ 量尺先自證：真的讀得到那支腳本", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src.length, "讀不到 release-note-players.sh —— 它搬家了").toBeGreaterThan(500);
    // ⭐ 反方向：一個不存在的字樣⛔不可以被當成命中
    expect(src.includes("這一行不存在於任何版本")).toBe(false);
  });

  it("★ 沒有任何票寫玩家那一句時，它仍然產出**一行**公告", () => {
    // ⭐ 真的把腳本跑起來，⛔ 不是掃原始碼字串（失敗形態⑥）
    // ⛔⛔ **第一版在這裡永遠會過** —— 2026-08-30 實測到的：
    //   它真的打 gh（300 張票），耗時 **120005ms ＝ 正好撞到 120 秒 timeout**
    //   ⇒ `catch` 每一次都被觸發 ⇒ `return` ⇒ ⭐ **突變（把退回那一行刪掉）照樣綠**。
    //   ⚠️ 而我寫那個 `catch` 的理由是對的（「gh 連不上要說出來，⛔ 不是安靜地綠」）——
    //     ⭐ 錯的是它同時變成了**唯一**會走到的分支。
    //   ⇒ ⭐ **一條會 timeout 的閘 ＝ 一條永遠會過的閘**（失敗形態⑨）。
    //
    // ⭐ 改成走 `GGD_PLAYERNOTE_NO_GH=1`：跳過那個 2 分鐘的 I/O，
    //   ⛔ 而 fallback 那一段是**同一份出貨程式碼**（⛔ 不是為了測試造的第二條路）。
    let out: string;
    try {
      out = execFileSync("bash", [SCRIPT], {
        cwd: REPO,
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, GGD_PLAYERNOTE_NO_GH: "1" },
      });
    } catch (e) {
      // ⭐ 跑不起來就是**紅**，⛔ 不是 return —— 見上面那段。
      expect.fail(
        "⛔ release-note-players.sh 在 GGD_PLAYERNOTE_NO_GH=1 下跑不起來 ——\n" +
          "   ⭐ 那條路不碰網路，所以這不是「連不上」，是腳本壞了。\n" +
          `   ${String(e).slice(0, 400)}`,
      );
    }

    // ⭐ 公告行 ＝ 以 "- " 開頭且**不在**「定位不到版本」那一欄裡（那一欄用 "  · " 前綴）
    const lines = out.split("\n").filter((l) => /^- \S/.test(l));

    expect(
      lines.length,
      [
        "⛔⛔ 這一版的玩家公告**是空的** —— owner 2026-08-30（逐字）：",
        "   「如果沒有對玩家有差別的改版你還是要發 **系統優化更新**」",
        "",
        "⚠️ ⭐ **不發 ＝ 讓玩家以為沒動靜。**",
        "   一個持續在更新的專案，只在「有新東西」那幾天出聲，",
        "   ⛔ 其餘每一天看起來都像停擺 —— 而那與真的停擺長得一模一樣。",
        "",
        "⭐ 修法：`scripts/release-note-players.sh` 在 `$LINES` 為空時要退回一行",
        "   「系統優化更新」，⛔ 不是印一句「這一版沒有玩家可見的改動」就結束。",
        "",
        `實際輸出：\n${out.slice(0, 800)}`,
      ].join("\n"),
    ).toBeGreaterThan(0);
  });
});
