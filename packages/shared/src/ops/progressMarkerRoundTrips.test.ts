import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **寫入端與消費端對同一個格式的想像不一樣 —— 而兩邊看起來都正常。**
 *
 * ⭐ 2026-08-30 同一天量到**兩次**：
 *
 * | # | 寫入端寫的 | 消費端找的 | 後果 |
 * |---|---|---|---|
 * | ① | `\| **狀態** \| \`完成\` \|`（表格）| `狀態:` | ⭐ 戰情版 **70 格進度欄全印 `—`** |
 * | ② | `\| **commit** \| fe252e8aa \|`（⛔ 沒有反引號）| 要**反引號** | ⭐ **每一張票**都被判成「定位不到版本」⇒ 玩家公告永遠空的 |
 *
 * ⚠️ ⭐ 兩次都**看起來完全正常**：正則沒錯、欄位在、標記也寫進去了 ——
 * ⛔ 錯的只有**兩端之間**那個沒有人驗過的約定。
 *
 * ⇒ ⭐ 這條閘釘住的是**一個往返**（round-trip），⛔ 不是任何一端：
 * 「`ticket-progress.sh` 寫出來的那一段，`release-note-players.sh` 讀得回來嗎？」
 *
 * ⚠️ ⭐ 它刻意**不打 gh**（那要 2 分鐘且會 timeout ⇒ 一條會 timeout 的閘等於永遠會過）。
 * ⇒ 改成比對**兩支腳本的原始碼**：寫入端的樣板必須被消費端的正則吃得下去。
 */

const REPO = join(import.meta.dirname, "../../../..");
const W = join(REPO, "scripts/ticket-progress.sh");
const R = join(REPO, "scripts/release-note-players.sh");

/** 寫入端第 N 行的樣板，把 `${VAR}` 換成一個真的值。 */
const renderTemplate = (line: string, vars: Record<string, string>): string =>
  line.replace(/\$\{(\w+)(?::-[^}]*)?\}/g, (_m, k: string) => vars[k] ?? "X");

describe("進度標記寫得出來、就要讀得回來（owner 2026-08-30 的玩家公告）", () => {
  it("⭐ 量尺先自證：兩支腳本都讀得到，而且抓得到那兩行", () => {
    const w = readFileSync(W, "utf8");
    const r = readFileSync(R, "utf8");
    expect(w.includes("**commit**"), "寫入端找不到 commit 那一行 —— 樣板改了").toBe(true);
    expect(r.includes("**commit**"), "消費端找不到 commit 的抽取 —— 正則改了").toBe(true);
  });

  it("★ 寫入端寫的 `commit` 那一行，消費端的正則吃得下去", () => {
    const w = readFileSync(W, "utf8").split("\n");
    const tmpl = w.find((l) => l.includes("**commit**"));
    expect(tmpl, "寫入端沒有 commit 那一行").toBeDefined();

    const sha = "fe252e8aa";
    const rendered = renderTemplate(tmpl ?? "", { SHA: sha });

    // ⭐ 用**消費端自己的正則**去吃寫入端**自己的樣板** —— ⛔ 不是我另外寫一個
    const r = readFileSync(R, "utf8");
    const m = /grep -m1 -oE '([^']+)'\s*\|\s*grep -oE '\[0-9a-f\]\{7,40\}'/.exec(r);
    expect(m, "消費端的 SHA 抽取換寫法了 —— 這條閘要跟著更新").not.toBeNull();

    // ⛔⛔ **⛔ 不要經過 shell** —— 這個 pattern 裡有**反引號**，
    //   用 `bash -c "…"` 傳它會觸發命令替換（⭐ 我第一版就是這樣，測試自己壞掉）。
    // ⇒ ⭐ grep -E 與 JS RegExp 的語法在這裡等價（`\|` `\*` `?` `{n,m}` `[…]`），
    //   直接用 JS 跑，⛔ 零 shell。
    const pattern = m?.[1] ?? "";
    const re = new RegExp(pattern);
    const hit = re.exec(rendered);
    const got = hit === null ? "" : (/[0-9a-f]{7,40}/.exec(hit[0])?.[0] ?? "");

    expect(
      got,
      [
        "⛔⛔ **寫入端寫出來的那一行，消費端讀不回來。**",
        `   寫入端樣板：${tmpl}`,
        `   算出來的那一行：${rendered}`,
        `   消費端的正則：${pattern}`,
        "",
        "⚠️ ⭐ 這一族的缺陷**看起來完全正常**：兩邊各自的程式碼都對，",
        "   ⛔ 錯的只有它們之間那個沒有人驗過的約定。",
        "   ⇒ ⭐ 2026-08-30 同一天中了兩次（狀態欄的表格 vs `狀態:`；commit 的反引號）。",
      ].join("\n"),
    ).toBe(sha);
  });
});
