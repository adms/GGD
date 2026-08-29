/**
 * ⭐⭐【變身對子的閘不可以自己重寫基準線】—— GH#854。
 *
 * `abilityCodeParityForms.test.ts` 曾經在發現「兩邊一起動」時
 * `writeFileSync(BASELINE, …)` 然後綠 —— ⭐ **它把自己的證據改掉再宣告通過**
 * （CLAUDE.md 失敗形態⑩：守衛是靠缺陷才綠的）。而它掩蓋掉的正是六個變身對子
 * 被 `deriveCastTimes` 一路推開（castTimeSec 兩形態不同：本體有產生器來源的
 * 14/36 vs 其餘手編對子 5/84）。
 *
 * ⛔ 這一條**不掃原始碼字串**（失敗形態⑥）—— 它真的把那支測試跑起來，
 *    餵一份過期的基準線，然後問**兩件事**：它紅了嗎、那個檔被動過嗎。
 * ⭐ 而且先跑一次乾淨的當量尺校準（兩個方向）：控制組不綠 ⇒ 本條結論作廢。
 *
 * 突變紀錄：把 `abilityCodeParityForms.test.ts` 的斷言路徑改回「發現差異就
 * writeFileSync 回去」→ 這一條以「基準線被動過」紅並印出前後位元組數。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const SUITE = "packages/shared/src/content/abilityCodeParityForms.test.ts";
const REAL = join(REPO, "packages/shared/src/content/abilityCodeParityForms.baseline.json");
const VITEST = join(REPO, "node_modules/.bin/vitest");

/**
 * 跑那支測試，基準線指到 `baseline`。回傳離開碼與輸出。
 *
 * ⚠️ `--root` 是必要的，⛔ 不是裝飾：vitest 用 **findUp** 找設定檔（見
 * `vitest.config.ts` 檔頭的 GH#428 那一段），在 git worktree 裡跑的時候
 * 它會爬到**別的**工作樹去 —— 實測 2026-08-29 一次跑到了鄰居的目錄，
 * 收到 4 個不相干的檔案全綠，而我要驗的那一支根本沒被跑到。
 */
function run(baseline: string): { code: number; out: string } {
  const [cmd, head] = existsSync(VITEST) ? [VITEST, [] as string[]] : ["npx", ["vitest"]];
  const r = spawnSync(cmd, [...head, "run", "--root", REPO, SUITE], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 300_000,
    env: { ...process.env, GGD_FORM_PAIR_BASELINE: baseline, CI: "1" },
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** 一份**過期**的基準線：一個編號單邊被推開、另一個編號兩邊一起被推開。 */
function stale(dir: string): string {
  const rows = JSON.parse(readFileSync(REAL, "utf8")) as Record<string, [string | null, string | null]>;
  const both = Object.keys(rows).sort().filter((c) => rows[c]![0] !== null && rows[c]![1] !== null);
  expect(both.length, "基準線裡要有至少兩個編號兩邊都在（⛔ 否則這條測試沒有材料）").toBeGreaterThan(1);
  const bend = (v: string) => `${v.slice(0, -1)}${v.endsWith("0") ? "1" : "0"}`;
  const [oneSided, twoSided] = [both[0]!, both[both.length - 1]!];
  rows[oneSided] = [bend(rows[oneSided]![0]!), rows[oneSided]![1]];
  rows[twoSided] = [bend(rows[twoSided]![0]!), bend(rows[twoSided]![1]!)];
  const p = join(dir, "stale.baseline.json");
  writeFileSync(p, JSON.stringify(rows, null, 2) + "\n", "utf8");
  return p;
}

describe("變身對子的閘不可以自己重寫基準線（GH#854）", () => {
  it("⭐ 過期的基準線 ⇒ 紅，而且那個檔一個位元組都沒被動", { timeout: 600_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-formpair-"));

    // ── 校準①：拿出貨的基準線原封不動跑一次，必須綠 ────────────────────────
    //    ⛔ 控制組不綠的話，下面那個「紅」證明不了任何事（它可能紅在別的地方）。
    const clean = join(dir, "clean.baseline.json");
    writeFileSync(clean, readFileSync(REAL, "utf8"), "utf8");
    const control = run(clean);
    expect(control.code, `控制組應該綠：\n${control.out.slice(-1500)}`).toBe(0);

    // ── 校準②：同一把尺量「已知過期」的那一邊，必須紅 ──────────────────────
    const p = stale(dir);
    const before = readFileSync(p, "utf8");
    const bad = run(p);
    expect(bad.code, `過期的基準線必須讓那支測試紅：\n${bad.out.slice(-1500)}`).not.toBe(0);
    expect(bad.out, "訊息要指名**單邊**那一筆（GH#479 要抓的缺陷本身）").toContain("⛔ 單邊");
    expect(bad.out, "⛔ 兩邊一起動也要紅 —— 那正是舊版靜默吸收掉的那一種").toContain("⚠️ 兩邊");

    // ── ⭐ 承重的那一句：閘紅了，而它**沒有把基準線改成現況** ────────────────
    expect(
      readFileSync(p, "utf8") === before,
      "⛔ 那支測試在斷言路徑寫了基準線 —— 一個會自己重寫基準線的閘等於沒有閘（GH#854）。" +
        `\n   before ${before.length}B / after ${readFileSync(p, "utf8").length}B`,
    ).toBe(true);
  });
});
