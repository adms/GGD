/**
 * ⭐⭐【`LICENSE` 宣稱的數字要與**磁碟上的東西**對得上】(GH#1233)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 抓到的：對外唯一的權利聲明**少報了我們自己的作品**
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-11 量到，`LICENSE` 有兩個**量得出來是錯的**數字：
 *
 * | 它說 | 實測 |
 * |---|---|
 * | 「All **eleven** background-music tracks … **no audio file read as input**」 | **37** 支，⭐ 而那句絕對句對其中 **13** 支是**假的**（逐場地曲用了 MuseScore_General 音色庫與 WC3 環境音） |
 * | 効果音ラボ「**40 clips**」 | `CREDITS.md` 逐字寫 **54**（46 SFX ＋ 8 段日語配音） |
 *
 * ⭐ `CREDITS.md` **已經是對的** —— ⛔ 是 `LICENSE` 沒有跟上。
 * ⇒ 同一批位元組，兩份文件各說一套。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 形狀：**一句在它到期之後還活著的散文，而沒有任何東西變紅**
 * ═══════════════════════════════════════════════════════════════════════════
 * 與 CLAUDE.md 記過的「`ENTITY_FLAG` 剩幾格」一模一樣：
 * 文件寫的時候是對的 → 世界動了 → 文件沒動 → **零個紅燈**。
 * ⇒ 判準（「加 BGM 時記得改 LICENSE」）治不了，⛔ 要閘。
 *
 * ⚠️ ⛔ 這條閘**不**把 `LICENSE` 變成產物 —— 它是法律文字，該由人寫。
 * ⭐ 它只問「你宣稱的那個數字，跟磁碟上的實際數量一樣嗎」。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const LICENSE = readFileSync(join(ROOT, "LICENSE"), "utf8");
const CREDITS = readFileSync(join(ROOT, "content", "assets", "CREDITS.md"), "utf8");
const BGM_DIR = join(ROOT, "content", "assets", "audio", "bgm");

function bgm(): { total: number; perArena: number; scene: number } {
  const files = readdirSync(BGM_DIR).filter((f) => f.endsWith(".mp3"));
  const perArena = files.filter((f) => f.startsWith("map.")).length;
  return { total: files.length, perArena, scene: files.length - perArena };
}

describe("LICENSE 的數字 vs 磁碟上的實際數量（GH#1233）", () => {
  const counts = bgm();

  it("⭐ 量尺自證：真的數到檔案，而且兩類都非空", () => {
    // ⛔ 沒有這一條，一個回 0 的 readdir 會讓下面每一條**結構上永遠綠**。
    expect(counts.total, "⛔ 一支 BGM 都沒數到 —— 路徑錯了").toBeGreaterThan(20);
    expect(counts.perArena, "⛔ 零支逐場地曲 ⇒ `map.` 前綴的假設壞了").toBeGreaterThan(0);
    expect(counts.scene, "⛔ 零支場景曲 ⇒ 分類壞了").toBeGreaterThan(0);
    expect(CREDITS.length, "⛔ CREDITS.md 讀成空的").toBeGreaterThan(1000);
  });

  it("⛔ 那兩個過期的字樣不可以回來", () => {
    expect(
      /All eleven background-music/.test(LICENSE),
      "⛔ 「All eleven background-music tracks」回來了 —— ⭐ 實際是 " + counts.total + " 支。",
    ).toBe(false);
    expect(
      /効果音ラボ[\s\S]{0,120}?— 40 clips/.test(LICENSE),
      "⛔ 効果音ラボ「40 clips」回來了 —— ⭐ CREDITS.md 說 54。",
    ).toBe(false);
  });

  it("⭐ LICENSE 講的 BGM 支數 ＝ 磁碟上真的有幾支", () => {
    for (const [label, want] of [["總數", counts.total], ["逐場地", counts.perArena], ["場景", counts.scene]] as const) {
      expect(
        LICENSE.includes(String(want)),
        `⛔⛔ LICENSE 裡找不到${label} **${want}** 這個數字 —— ⭐ 而磁碟上就是這麼多。\n` +
          "⇒ 有人加／刪了 BGM 而沒有更新那份對外的權利聲明。\n" +
          "⛔ 不要改這條測試，去改 LICENSE（⭐ 逐支清單留在 CREDITS.md，⛔ 不要抄第三份進 LICENSE）。",
      ).toBe(true);
    }
  });

  it("⭐ 効果音ラボ 的數字 ＝ CREDITS.md 宣告的那個（⛔ 不是抄一個字面值）", () => {
    const m = /\*\*(\d+) real recordings — (\d+) SFX \+ (\d+) Japanese voice clips\*\*/.exec(CREDITS);
    expect(m, "⛔ CREDITS.md 的那句宣告找不到 —— ⭐ 它是這條閘的來源，⛔ 不要當成「沒問題」").not.toBeNull();
    const [total, sfx, voice] = [Number(m![1]), Number(m![2]), Number(m![3])];
    expect(sfx + voice, "⛔ CREDITS.md 自己的算術不成立").toBe(total);
    expect(
      LICENSE.includes(`— ${total} clips`),
      `⛔⛔ LICENSE 說的効果音ラボ 數量與 CREDITS.md 的 **${total}** 對不上。\n` +
        "⭐ CREDITS.md 是逐支列出來的那一份 ⇒ 它是來源，⛔ LICENSE 要跟上它。",
    ).toBe(true);
  });
});
