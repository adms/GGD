/**
 * ⭐⭐ 發成功就**自己記帳** —— ⛔ 不是靠我記得手打一列。
 *
 * ── 這條守衛為什麼存在（2026-09-01 量到的，⛔ 不是假設）──────────────────
 * `everyTagAnnounced.test.ts` 讀 `docs/_release/_announced.tsv` 判斷「這個版號
 * 公告過了嗎」。⭐ 而在這一天之前，**沒有任何程式寫那個檔** ——
 *   · `release-note-players.sh` 真的發得出去（HTTP 204）        ✅
 *   · `everyTagAnnounced` 真的讀得到帳本                        ✅
 *   ⇒ ⛔ 而兩者之間**沒有人站** ⇒ 閘只能靠人手打滿足。
 *
 * ⇒ ⭐ 那是**失敗形態⑪**（兩條對的守衛，組合是空的），而它的症狀是：
 *   Discord 發成功之後閘**仍然紅**，於是下一輪會**重發同一則公告**。
 *
 * ⚠️ 這條刻意跑**真的那一支腳本**（假 webhook 收 204），⛔ 不是 grep 原始碼
 *   —— 失敗形態⑥：掃字串證明得了「那一行在」，⛔ 證明不了「它會跑」。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 20* 分支裡的 `>> "$LEDGER"` 兩行拿掉 → 🔴（帳本沒長出那兩列）
 */
import { describe, it, expect } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

/**
 * ⭐ **非同步**跑那支腳本 —— ⛔ 不是 `execFileSync`。
 *
 * ⚠️ 這不是風格：假 webhook 伺服器住在**同一個 node 行程**裡，而 `execFileSync`
 * 會把事件迴圈整個鎖住 ⇒ ⭐ 那個連線**永遠不會被接受**，curl 一路等到自己逾時。
 * ⇒ 症狀是「腳本超級慢」，⛔ 而真相是「我的量尺自己把被量的東西卡住了」。
 */
const run = promisify(execFile);

describe("Discord 公告發成功就要記帳（owner 2026-09-01：每個版本號都不能跳過）", () => {
  it("★ ⭐ 跑真的那一支：發成功 ⇒ `_announced.tsv` 長出這一版（⛔ 不是掃字串）", async () => {
    const srv = createServer((_q, s) => s.writeHead(204).end());
    await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
    const port = (srv.address() as { port: number }).port;

    // ⭐ 在**真的 repo** 上跑真的那一支（腳本要 git tag），
    // ⛔ 而帳本指到暫存檔 —— 測試不可以動到出貨的那一份。
    const dir = mkdtempSync(join(tmpdir(), "ggd-announce-"));
    const ledger = join(dir, "_announced.tsv");
    writeFileSync(ledger, "版號\t日期\t一句\n");

    // ⭐ `gh` 換成假的 —— ⛔ 不是為了「不碰網路」這種潔癖：
    // 量到 **180 秒 → 1 秒**（那一支要逐張票撈玩家句）。
    // ⚠️ 而被測的**仍然是真的那一支腳本** —— 換掉的是它的**外部依賴**，
    //   ⛔ 不是它的邏輯（失敗形態⑤：被測的不是出貨的那個）。
    const stub = join(dir, "bin");
    mkdirSync(stub, { recursive: true });
    writeFileSync(join(stub, "gh"), '#!/bin/sh\ncase "$*" in *--json*) echo "[]";; *) echo "";; esac\n');
    chmodSync(join(stub, "gh"), 0o755);

    const tags = execFileSync("git", ["tag", "--sort=-v:refname"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").filter(Boolean);
    const now = tags[0]!;

    try {
      await run("bash", ["scripts/release-note-players.sh", "--post", "--since", tags[2]!], {
        cwd: ROOT, encoding: "utf8", timeout: 60_000,
        env: {
          ...process.env,
          GGD_DISCORD_WEBHOOK: `http://127.0.0.1:${port}/hook`,
          GGD_ANNOUNCE_LEDGER: ledger,
          PATH: `${stub}:${process.env.PATH ?? ""}`,
        },
      });
    } catch {
      /* 沒有玩家句時腳本會非零離開 —— 那與這條守衛無關，下面的斷言自己會說話 */
    } finally {
      srv.close();
    }

    const after = readFileSync(ledger, "utf8");
    expect(
      after.includes(`${now}\t`),
      `⛔⛔ Discord 發成功了，而 \`_announced.tsv\` **沒有** ${now} 這一列\n` +
        `⇒ 閘 (everyTagAnnounced) 會一直紅，而下一輪會**重發同一則公告**。\n` +
        `⭐ 修在**發送端**（\`release-note-players.sh\` 的 20* 分支），⛔ 不是手打一列。\n` +
        `帳本現況:\n${after}`,
    ).toBe(true);
  }, 90_000);

  /**
   * ⭐⭐ 反方向 —— 而它是 **GH#907** 的那一半。
   *
   * ⚠️ 上面那一條證明「發成功會記帳」。⛔ 它證明不了「記過帳就不再發」——
   *   ⭐ 而 BMPNDD **自己就呼叫這支腳本兩次**（1/4 push 那一段 + 3/4 公告那一段），
   *   ⇒ 2026-09-01 玩家在 Discord 上收到**同一則**「系統優化更新」兩則，
   *   ⛔ 而兩次都回 HTTP 204 ——「成功」在這裡不是任何東西的證據。
   *
   * ⭐ 量的是**伺服器收到幾個請求**，⛔ 不是腳本印了什麼
   *   （失敗形態⑦：掃屬性代替掃行為 —— 印出「不重複發」與「真的沒送」是兩件事）。
   *
   * MUTATION LOG（落地前跑過）：
   *   · 把 `grep -q "^${NOW}\t"` 前置檢查整段拿掉 → 🔴（hits 1，⛔ 不是 0）
   */
  it("★ ⭐ 帳本上已經有這一版 ⇒ **一個請求都不送**（GH#907：BMPNDD 呼叫它兩次）", async () => {
    let hits = 0;
    const srv = createServer((_q, s) => { hits += 1; s.writeHead(204).end(); });
    await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
    const port = (srv.address() as { port: number }).port;

    const dir = mkdtempSync(join(tmpdir(), "ggd-announce-dup-"));
    const ledger = join(dir, "_announced.tsv");
    const stub = join(dir, "bin");
    mkdirSync(stub, { recursive: true });
    writeFileSync(join(stub, "gh"), '#!/bin/sh\ncase "$*" in *--json*) echo "[]";; *) echo "";; esac\n');
    chmodSync(join(stub, "gh"), 0o755);

    const tags = execFileSync("git", ["tag", "--sort=-v:refname"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").filter(Boolean);
    const now = tags[0]!;
    // ⭐ 帳本上**已經有**這一版 —— 也就是「第一次已經發過了」的世界。
    writeFileSync(ledger, `版號\t日期\t一句\n${now}\t2026-09-01\t（上一次發過了）\n`);

    try {
      await run("bash", ["scripts/release-note-players.sh", "--post", "--since", tags[2]!], {
        cwd: ROOT, encoding: "utf8", timeout: 60_000,
        env: {
          ...process.env,
          GGD_DISCORD_WEBHOOK: `http://127.0.0.1:${port}/hook`,
          GGD_ANNOUNCE_LEDGER: ledger,
          PATH: `${stub}:${process.env.PATH ?? ""}`,
        },
      });
    } catch {
      /* 同上：非零離開與這條守衛無關 */
    } finally {
      srv.close();
    }

    expect(
      hits,
      `⛔⛔ ${now} 帳本上已經有了，而這支腳本**還是送了 ${hits} 個請求**\n` +
        `⇒ 玩家會在 Discord 收到重複公告（GH#907）。\n` +
        `⭐ 修在**發送端**的帳本前置檢查，⛔ 不是叫呼叫端少呼叫一次 ——\n` +
        `   BMPNDD 那兩次呼叫各有各的理由，而「這一版發過了嗎」只有帳本答得出來。`,
    ).toBe(0);
  }, 90_000);
});
