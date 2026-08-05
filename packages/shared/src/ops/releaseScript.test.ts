/**
 * releaseScript.test.ts —— 版號守衛必須真的擋得住「忘記翻頁」。
 *
 * ── 這條守衛在守什麼（2026-08-05）──────────────────────────────────────────
 *
 * owner 的規則是**每天一個次版號**。而它被破壞了整整 10 天：
 * `v0.9` 從 2026-07-27 撐到 2026-08-05，打了 **45 個 patch**，中間跨了 10 個
 * 日曆日。照規則那期間應該走到 v0.18。
 *
 * ⚠️ 根因不是「忘記」，是**規則只被寫下來一半**。CLAUDE.md 記的是：
 *
 *     「git push + GitHub release note（同一天只 bump 第三段）」
 *
 * 「同一天怎麼做」寫了，「跨天怎麼做」沒寫。於是 45 次 bump **每一次單獨看
 * 都合規**，而合起來是錯的 —— 沒有任何一次的當下有東西會響。
 *
 * ⛔ 補散文治不了它（同一份 CLAUDE.md 在部署協定那一段已經證明過兩次）。
 * `scripts/release.sh` 是那支會自己驗證的程式，這一檔是它的守衛。
 *
 * ── ⭐ 為什麼這一條**真的跑腳本**，而隔壁 hostDeployScript.test.ts 只掃字串 ──
 * 那一條的取捨是 `host-deploy.sh` 真要跑起來需要 docker + 一台配置好的主機，
 * 在 CI 裡跑它等於測 CI 的 docker。
 * **`release.sh` 沒有那個問題** —— 它只需要 `git`。所以這裡在 tmp 目錄造一個
 * 真的 repo、用 `GIT_COMMITTER_DATE` 造出指定日期的 tag、再把腳本跑起來讀它的
 * stdout 與離開碼。掃字串會對一個「字串都在、邏輯寫反」的版本照樣綠
 *（失敗形態 ⑥：用掃原始碼代替行為）。
 *
 * ── ⚠️ 刻意只有三條 ────────────────────────────────────────────────────────
 * 第一版我寫了 8 條（--check 三種錯法、--tag 真的寫入、空 repo、掃 CLAUDE.md）。
 * 那是過度測試：被測的是一支**版號算術**的 bash 工具，不是靈魂層。
 * owner 2026-08-05：「花了大部分的 token 跟時間都是做測試」。
 * 留下的三條各對應一個**真的發生過或真的會發生**的錯：同天算錯、跨天沒翻頁
 *（就是那 10 天）、以及錯的號沒有被擋下來。其餘刪掉。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "../../../..");
const SCRIPT = join(REPO, "scripts/release.sh");

/** ⛔ 一律寫 /private/tmp，不要留在 repo（CLAUDE.md 硬性約束）。 */
let SANDBOX = "";

function git(cwd: string, args: string[], date?: string): void {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
      // ⚠️ tag 的 `creatordate` 讀的是 COMMITTER date —— 這是造假歷史的那一根槓桿。
      ...(date ? { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : {}),
    },
  });
}

/**
 * 造一個只有 tag 有意義的假 repo。
 * `tags` 是 `[版號, ISO 日期]` 的序列，依序打上去。
 */
function fakeRepo(tags: [string, string][]): string {
  const dir = mkdtempSync(join(SANDBOX, "rel-"));
  git(dir, ["init", "-q", "-b", "main"]);
  writeFileSync(join(dir, "f"), "x");
  git(dir, ["add", "f"]);
  git(dir, ["commit", "-qm", "c"], "2026-07-01T00:00:00+08:00");
  for (const [tag, date] of tags) {
    git(dir, ["tag", "-a", tag, "-m", tag], date);
  }
  return dir;
}

function run(cwd: string, args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync("bash", [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return { code: r.status ?? -1, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

/**
 * 今天與昨天的 ISO 日期 —— 腳本讀的是系統時鐘，所以夾具也要。
 *
 * ⛔ **必須用本機日期，不可以用 `toISOString()`**（2026-08-06 修的真缺陷）。
 * `toISOString()` 回的是 **UTC**，而 `release.sh` 比的是 `date +%F`（**本機**）。
 * 在 UTC+8 上，本機 00:00–08:00 這八個小時裡 UTC 還停在前一天 —— 於是夾具造出
 * 「昨天」的 tag 卻跟「今天」比，`rel-same-day` 被判成跨天而紅。
 *
 * ⚠️ 它不是偶發，是**每天固定紅八小時**：白天寫的守衛白天全綠，所以它昨天
 * 出貨時看起來是好的。這一類「只在某個時段紅」的缺陷比全紅更貴 ——
 * 它會讓人以為是自己那一批改壞的（我今天就先去查了自己的 diff）。
 * 時鐘相關的夾具一律問一次：**我和被測的東西，是不是同一個時區？**
 */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x: number): string => String(x).padStart(2, "0");
  // 本機年月日（與 `date +%F` 同一個時區），不是 UTC。
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T12:00:00+08:00`;
}

beforeAll(() => {
  SANDBOX = mkdtempSync(join(tmpdir(), "ggd-release-"));
});
afterAll(() => {
  if (SANDBOX) rmSync(SANDBOX, { recursive: true, force: true });
});

describe("版號守衛 scripts/release.sh", () => {
  it("同一天再發一版 → 只 bump 第三段", () => {
    cover("rel-same-day");
    const dir = fakeRepo([["v0.10.3", isoDaysAgo(0)]]);
    const r = run(dir, ["--next"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("v0.10.4");
  });

  it("⭐ 跨天 → bump 次版號,而且第三段歸 0", () => {
    cover("rel-crosses-day");
    const dir = fakeRepo([["v0.10.3", isoDaysAgo(1)]]);
    const r = run(dir, ["--next"]);
    expect(r.code).toBe(0);
    // ⛔ 兩件事一起讀：minor 有加、patch 有歸 0。
    // 只驗 minor 的話，一個忘了歸零的實作會給出 v0.11.3 而照樣過。
    expect(r.out).toBe("v0.11.0");
  });

  it("⭐⭐ 迴歸：v0.9 那 10 天的形狀,現在會被算成翻頁", () => {
    cover("rel-regression-v09");
    // 這就是真的發生過的那一幕：昨天發了 v0.9.45，今天又要發。
    // 壞掉的行為是給出 v0.9.46（45 次都是這樣）；對的行為是 v0.10.0。
    const dir = fakeRepo([["v0.9.45", isoDaysAgo(1)]]);
    expect(run(dir, ["--next"]).out).toBe("v0.10.0");
    // 而且**明確拒絕**那個壞掉的號 —— 不是「建議別的」，是回非零。
    const bad = run(dir, ["--check", "v0.9.46"]);
    expect(bad.code).not.toBe(0);
    expect(bad.err).toContain("v0.10.0");
  });

});
