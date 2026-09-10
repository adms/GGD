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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync, rmSync } from "node:fs";
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

// 這條量的是發送後記帳。固定 Git／票庫輸入，避免最新版本的真玩家改動
// 在 post 前正確觸發「缺玩家句」閘，卻被誤報為發送成功後漏記帳。
const SINCE = "v0.0.0";
const MIDDLE = "v0.0.1";
const NOW = "v0.0.2";
function stubReleaseInputs(dir: string): string {
  const stub = join(dir, "bin");
  mkdirSync(stub);
  writeFileSync(join(stub, "gh"), "#!/bin/sh\nexit 0\n"); // issue list -q：零張票
  writeFileSync(join(stub, "git"), `#!/bin/sh
case "$*" in
  "tag --sort=v:refname") printf '%s\\n' '${SINCE}' '${MIDDLE}' '${NOW}' ;;
  "log -1 --format=%cI ${SINCE}") printf '%s\\n' '2026-09-01T00:00:00+00:00' ;;
  "log --format=%s%n%b ${SINCE}..${NOW}"|"log --format=%s ${SINCE}..${NOW}") : ;;
  *) echo "Unexpected Git fixture call: $*" >&2; exit 2 ;;
esac
`);
  chmodSync(join(stub, "gh"), 0o755);
  chmodSync(join(stub, "git"), 0o755);
  return stub;
}

describe("Discord 公告發成功就要記帳（owner 2026-09-01：每個版本號都不能跳過）", () => {
  it("★ ⭐ 跑真的那一支：發成功 ⇒ `_announced.tsv` 長出這一版（⛔ 不是掃字串）", async () => {
    let hits = 0;
    const srv = createServer((_q, s) => { hits += 1; s.writeHead(204).end(); });
    await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
    const port = (srv.address() as { port: number }).port;

    // 跑出貨腳本與帳本合併器；只有 Git、票庫和 HTTP 是 fixture。
    // 帳本指到暫存檔，測試不可以動到出貨的那一份。
    const dir = mkdtempSync(join(tmpdir(), "ggd-announce-"));
    const ledger = join(dir, "_announced.tsv");
    writeFileSync(ledger, "版號\t日期\t一句\n");

    const stub = stubReleaseInputs(dir);
    const now = NOW;

    try {
      await run("bash", ["scripts/release-note-players.sh", "--post", "--since", SINCE, "--until", now], {
        cwd: ROOT, encoding: "utf8", timeout: 60_000,
        env: {
          GGD_DISCORD_WEBHOOK: `http://127.0.0.1:${port}/hook`,
          GGD_ANNOUNCE_LEDGER: ledger,
          PATH: `${stub}:${process.env.PATH ?? ""}`,
        },
      });
      expect(hits, "必須真的收到一次 HTTP 請求，才能宣稱發送成功").toBe(1);
      const after = readFileSync(ledger, "utf8");
      expect(
        after.includes(`${now}\t`),
        `⛔⛔ Discord 發成功了，而 \`_announced.tsv\` **沒有** ${now} 這一列\n` +
          `⇒ 閘 (everyTagAnnounced) 會一直紅，而下一輪會**重發同一則公告**。\n` +
          `⭐ 修在**發送端**（\`release-note-players.sh\` 的 20* 分支），⛔ 不是手打一列。\n` +
          `帳本現況:\n${after}`,
      ).toBe(true);
      expect(after, "補發涵蓋的中間版本也必須記帳").toContain(`${MIDDLE}\t`);
      expect(after, "區間起點不在本次公告內").not.toContain(`${SINCE}\t`);
    } finally {
      await new Promise<void>((ok, fail) => srv.close((err) => err ? fail(err) : ok()));
      rmSync(dir, { recursive: true, force: true });
    }
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
    const stub = stubReleaseInputs(dir);
    const now = NOW;
    // ⭐ 帳本上**已經有**這一版 —— 也就是「第一次已經發過了」的世界。
    writeFileSync(ledger, `版號\t日期\t一句\n${now}\t2026-09-01\t（上一次發過了）\n`);

    try {
      await run("bash", ["scripts/release-note-players.sh", "--post", "--since", SINCE, "--until", now], {
        cwd: ROOT, encoding: "utf8", timeout: 60_000,
        env: {
          GGD_DISCORD_WEBHOOK: `http://127.0.0.1:${port}/hook`,
          GGD_ANNOUNCE_LEDGER: ledger,
          PATH: `${stub}:${process.env.PATH ?? ""}`,
        },
      });
    } finally {
      await new Promise<void>((ok, fail) => srv.close((err) => err ? fail(err) : ok()));
      rmSync(dir, { recursive: true, force: true });
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
