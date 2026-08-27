/**
 * 🎫 **接手相交掃描**（GH#808 Scope 2）—— `scripts/ticket-lint.sh --dupes`。
 *
 * 2026-08-26 有兩種接手切法同時在跑，造出**四對重複票** ——⚠️ 而五件規格檢查
 * 對它們**全綠**：每張票的標題都自己成立、body 都自己完整。
 * ⭐ 判準不在單張票裡，只在**票與票的關係**裡。
 *
 * ⭐ 兩個方向（⛔ 只驗「抓得到」就會養出一支對什麼都喊的工具）：
 *   ① **該抓的抓得到** —— 真的相交（含 `接手 #14＋#20` 這種 `＋` 分隔寫法）
 *   ② **該放的放得過** —— 一張在**描述**重複的票（表格列 / `「…」` / `` `…` `` 裡的引用）
 *      ⛔ 不可以被當成宣告（#808 自己就是那張票，第一版實測誤報）
 *
 * ⛔ 不碰網路：`GGD_TICKET_DUPES_JSON` 換掉「issue 從哪來」，
 * ⭐ 跑的仍然是**出貨的**那支腳本與出貨的抽取／分組（⛔ 不是測試自造一條通道）。
 *
 * 突變紀錄（2026-08-27 實跑）：拿掉 `--dupes` 剝 `「…」` 的那一行
 * → ② 紅（誤報的 #900 被列進相交組）。改回來。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const dir = mkdtempSync(join(tmpdir(), "laneY-dupes-"));

function scan(issues: unknown[]): { code: number; out: string } {
  const f = join(dir, `fx-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(f, JSON.stringify(issues));
  try {
    const out = execFileSync("bash", ["scripts/ticket-lint.sh", "--dupes"], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, GGD_TICKET_DUPES_JSON: f },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describe("接手相交掃描：判準在票與票的關係裡", () => {
  it("① 該抓的抓得到 —— 含 `＋` 分隔（#727 的寫法就是它）", () => {
    const { code, out } = scan([
      { number: 900, title: "[一般][fix] 合併票 接手 #14＋#20", body: "" },
      { number: 901, title: "[一般][fix] 逐張票", body: "接手 #20" },
      { number: 902, title: "[一般][fix] 無關票", body: "沒有宣告任何接手" },
    ]);
    expect(code, "找到相交要回非零 —— 它是報表也是閘").toBe(1);
    expect(out).toContain("#900");
    expect(out).toContain("#901");
    expect(out, "`＋` 分隔沒讀到 #20 ⇒ 整組相交會消失（第一版就是這樣漏掉 #727 的）")
      .toMatch(/全組共有：\[20\]/);
    expect(out, "沒宣告接手的票不該出現在相交組裡").not.toContain("#902");
  });

  it("② 該放的放得過 —— 表格列 / 「」/ `` ` `` 裡的是**引用**，⛔ 不是宣告", () => {
    const { code, out } = scan([
      { number: 903, title: "[一般][fix] 真的接手", body: "接手 #55" },
      {
        number: 904,
        title: "[重要][infra] 在描述重複的那張票",
        body: [
          "| #903（接手 #55） | #910（#55） |",
          "- [x] 造一個「接手 #55」的假開票 ⇒ 喊出 `#903（也接手 [55]）`",
        ].join("\n"),
      },
    ]);
    expect(out, "表格列與引號裡的接手被當成宣告 ⇒ 描述重複的票自己變成誤報").toContain("0 對");
    expect(code, "沒有真的相交就要回 0").toBe(0);
  });

  it("③ 詞彙表只有一個住處 —— 兩個消費端都讀它", () => {
    for (const f of ["scripts/ticket-lint.sh", "scripts/preserve-before-overwrite.py"]) {
      expect(
        readFileSync(join(REPO, f), "utf8"),
        `${f} 沒有引用 takeover-vocab.json ⇒ 它的抽取會與另一支漂開（GH#707 的形狀）`,
      ).toContain("takeover-vocab.json");
    }
  });
});
