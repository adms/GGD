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

  // ⭐⭐ GH#976 —— **反方向**（2026-09-04 補）。
  //
  // owner 逐字：「discord 不要老是 系統優化更新⋯明明每個版本都有些對玩家的影響
  //              例如 tab 鍵可以看到全部角色狀態了 之類 你為何會退化成都沒有更新訊息」
  //
  // ⚠️ ⭐ 上面那一條驗的是「**不會是空的**」，⛔ 而它對「**永遠只發那一句**」是瞎的 ——
  //   ⭐ 因為 fallback 那一行**本身就滿足**它。
  //   ⇒ 一條只往一個方向走的閘，會在它最需要說話的時候沉默（CLAUDE.md 形態⑫）。
  //
  // ⭐ 根因（量到的）：玩家那一句只從 `ticket-progress.sh … --player` 寫進票的
  //   「🧭 進度標記」，⛔ 而**每一條實際的關票路徑**（`gh issue close --comment`）
  //   都不經過它 ⇒ 寫入端存在而**沒有人走**（失敗形態⑧），
  //   於是 fallback 每一版都成立 ⇒ ⭐ 讀起來像「這個專案沒在動」。
  //
  // ⇒ 這一條釘住的是那個**分辨**：腳本要能分開
  //   (a) 真的沒有玩家可見的票 ⇒ ⭐ 發系統優化更新（owner 2026-08-30 的常設指令）
  //   (b) **有**玩家可見的票而沒人寫那一句 ⇒ ⛔ 那句話是**假話** ⇒ 不發、指名它們
  it("★★ ⭐ 有玩家可見的票卻一句都沒寫時，⛔ 它**不可以**照發「系統優化更新」", () => {
    const src = readFileSync(join(REPO, "scripts/release-note-players.sh"), "utf8");

    // ⭐ 判準：fallback 那一段的**前面**要先問 `$MISSING`。
    //   ⛔ 不掃「有沒有出現 MISSING 這個字」—— 它在別處（警告區）本來就有。
    const fallbackAt = src.indexOf("系統優化更新：穩定性與速度的例行維護");
    expect(fallbackAt, "⛔ 找不到 fallback 那一行 —— 量尺壞了，⛔ 不是腳本改好了").toBeGreaterThan(0);

    // fallback 之前 400 字元內要有一個「$MISSING 非空就 exit」的判斷
    const before = src.slice(Math.max(0, fallbackAt - 1600), fallbackAt);
    expect(
      /if\s+\[\s+-n\s+"\$MISSING"\s+\]/.test(before) && /exit 1/.test(before),
      [
        "⛔⛔ fallback 直接發「系統優化更新」，⛔ 而**沒有先問** `$MISSING`。",
        "",
        "⚠️ ⭐ 這一版有 N 張 feature/fix/improve 的票，而沒有一張寫了玩家那一句",
        "   ⇒ 發「例行維護」是一句**假話**（第一·五守則：⛔ 不放任何無效說明）。",
        "",
        "⚠️ 同一支腳本對「玩家句裡有**實作細節**」是 `exit 1` **不發** ——",
        "   ⭐ 兩個失敗要同一個待遇，⛔ 而被放過的那個產出的才是假話。",
        "",
        "⭐ 修法：在 fallback 之前加",
        '   `if [ -n "$MISSING" ]; then … exit 1; fi`，並逐張指名那些票。',
      ].join("\n"),
    ).toBe(true);
  });
});
