/**
 * 📣 GH#1109 —— 「被 commit 提到」⛔ 不等於「這一版改了它」。
 *
 * ## ⛔ 缺陷
 *
 * `release-note-players.sh` 判斷「這一版有沒有玩家看得到的票」時，
 * `IN=named` 的意思只是**票號出現在這一段的某一則 commit 訊息裡**（`Refs #NNN`）。
 * ⇒ 一個**純驗收／協作／記帳**的版本必然會提到一堆票，於是它們被判成
 * 「有玩家看得到的改動而沒人寫玩家那一句」——
 * ⭐ 而正確答案是**第三個**：這一版沒有改它們。
 *
 * ⚠️ 連續三版撞到（v0.40.3 · v0.40.8 · v0.41.0），每一次都要人手動
 * `GGD_PLAYERNOTE_NO_GH=1` 繞過去 —— ⛔ 而一個要人記得繞過的閘，
 * **下一次就會被繞過在它該說話的時候**。
 *
 * ## ⭐ 修法：`named` 收得進，⛔ 但要求不了
 *
 * · `landed`（進度標記的 commit 落在 `SINCE..NOW`）⇒ 有資格要求一句
 * · `named` ＋ 標記的 commit **不在**這一段 ⇒ ⛔ 這一版沒改它，跳過
 * · `named` ＋ **完全沒有標記** ⇒ ⭐ **仍然要求** —— 那可能是一次真的落地
 *   而沒人寫標記，⛔ 正是這條閘的用途
 *
 * ## 這一條驗什麼（⭐ 驗那三個分支都還在，⛔ 不是驗某一版的輸出）
 *
 * ⚠️ 輸出會隨 git 歷史與 GitHub 上的票狀態變 —— ⛔ 把某一版的結果釘進斷言
 * 就是「數字住進測試」（第二守則）。⇒ 驗的是**腳本裡那三個分支的存在與形狀**。
 *
 * 突變驗證（2026-09-09）：把 `! in_range "$SHA"` 改成 `true` → 第 2 條紅。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SH = readFileSync(join(__dirname, "..", "..", "..", "..", "scripts", "release-note-players.sh"), "utf-8");

describe("玩家公告：提到 ≠ 改了（GH#1109）", () => {
  it("① `named` 仍然是一個獨立的狀態（⛔ 沒有被整個拿掉）", () => {
    expect(SH, "IN=named 消失了 —— 那會讓有寫玩家句的票也收不進公告").toContain("IN=named");
  });

  it("② `named` ＋ 標記不在這一段 ⇒ 跳過（⭐ 這是這張票的修法）", () => {
    // ⭐ 三個條件缺一不可：是 named · 有 sha · 而 sha 不在範圍。
    // ⚠️ ⭐ `${IN:-}` 而不是 `$IN` —— 這支腳本是 `set -u`，而 `IN` 只在 `SCOPE=commits`
    //   那一段被賦值。裸的 `$IN` 會讓 `SCOPE=updated`（舊行為）在第一張票就死。
    expect(SH, '缺「IN = named」那一半').toMatch(/\[ "\$\{IN:-\}" = named \]/);
    expect(SH, "⛔ 用了裸的 `$IN` —— set -u 會讓 updated scope 整支死掉").not.toMatch(/\[ "\$IN" = named \]/);
    expect(SH, "缺「有 sha」那一半 —— 沒有它會把「完全沒有標記」的票也跳過").toMatch(/\[ -n "\$SHA" \]/);
    expect(SH, "缺「不在這一段」那一半 —— 沒有它就退回原本的缺陷").toMatch(/! in_range "\$SHA"/);
  });

  it("③ ⭐ 反方向：`named` ＋ **完全沒有標記** 仍然要求一句", () => {
    // ⛔ 如果條件寫成 `[ -z "$SHA" ]`（第一版我就寫錯了），一次沒寫標記的真落地
    //   會被靜靜跳過 —— ⭐ 而那正是這條閘存在的理由。
    expect(SH, "⛔ 條件寫成「沒有 sha 就跳過」——那會放掉真正的漏寫").not.toMatch(
      /= named \] && \[ -z "\$SHA" \]/,
    );
  });

  it("④ 第三條路仍在：真的沒有玩家可見的票 ⇒ 發系統優化更新", () => {
    expect(SH, "owner 2026-08-30 的常設指令：出貨就要說").toContain("系統優化更新");
    expect(SH, "⛔ 有票沒寫句子時發它是假話 —— 那一條 exit 1 要留著").toMatch(/這時候發「系統優化更新」是\*\*假話\*\*/);
  });
});
