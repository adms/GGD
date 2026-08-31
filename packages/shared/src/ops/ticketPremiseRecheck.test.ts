import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * ⭐⭐ GH#686 ④ —— **前提回驗**：票文主張的「現況」今天還成立嗎。
 *
 * ── 為什麼這一段值得做成閘（⭐ 量到的，⛔ 不是感覺）────────────────────────
 * 2026-08-31 的 W0：五條 lane 逐票回驗 **54 張**，⭐ **37% 的前提已經不成立**。
 * ⚠️ 而失效的成本是**最貴的一種**：下一個實作者會**再做一次已經存在的東西**，
 * 而真缺口原封不動。
 *
 * ── ⭐ 這條守衛驗**三種形狀**，⛔ 而它們都是「一行指令就驗得掉」的那一類 ──
 * ① 路徑存在性（既有）② **行數漂移**（散文形 ＋ ⭐ **表格形**）③ ⭐ **重跑票文貼的 grep**
 *
 * ⚠️ ⭐ ②的表格形是**量尺自證抓出來的**：第一版只認散文形，
 * 拿已知過期的 #626（5,665 → 243 行）試 ⇒ **沒抓到** —— 因為那張票的行數住在表格欄位裡。
 * ⭐ 一把只認一種寫法的尺，會在它最該說話的那張票上沉默。
 */
const REPO = resolve(__dirname, "../../../..");

function lint(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ggd-lint-"));
  const f = join(dir, "b.md");
  writeFileSync(f, body);
  try {
    return execFileSync("bash", ["scripts/ticket-lint.sh", "--body-file", f], {
      cwd: REPO, encoding: "utf8", timeout: 60_000,
    });
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FRAME =
  "## Objective\nx\n## Scope\nx\n## Files / modules likely affected\nx\n" +
  "## Implementation constraints\nx\n## Acceptance criteria\n1. x\n" +
  "## Test / verification criteria\nx\n[思考策略] x\n[解決模板] x\n";

describe("GH#686 ④ 票文前提回驗", () => {
  it("★ ⭐ **表格形**的行數漂移抓得到（#626 的形狀）", () => {
    // `scripts/ticket-lint.sh` 今天約 20K —— 宣稱它有 99,999 行一定是假的。
    const out = lint(`${FRAME}\n| 檔 | 行 |\n|---|---:|\n| \`scripts/ticket-lint.sh\` | 99,999 |\n`);
    expect(out, "⛔ 表格形沒抓到 ⇒ #626 那一類票會靜靜地過").toContain("前提過期");
    expect(out).toContain("99,999");
  });

  it("★ ⭐ 票文貼的 grep 指令會被**重跑**（#756 的形狀）", () => {
    const out = lint(`${FRAME}\n| \`grep -rn describe packages/shared/src/ops/ticketPremiseRecheck.test.ts\` | ⛔ **零命中** |\n`);
    expect(out, "⛔ 沒重跑 ⇒ 一句過期的「零命中」會活很久").toContain("前提過期");
  });

  it("⭐ 沒有問題的票**不叫**（⛔ 一支會誤報的閘下一輪就被整段忽略）", () => {
    const out = lint(`${FRAME}\n這張票動 \`scripts/ticket-lint.sh\`，⛔ 沒有任何數字宣稱。\n`);
    expect(out).not.toContain("前提過期");
  });

  it("⛔ 帶管道／重導的指令**不跑**（票文是資料，⛔ 不是可信的腳本）", () => {
    const out = lint(`${FRAME}\n| \`grep -rn x . | tee /tmp/pwn\` | ⛔ **零命中** |\n`);
    expect(out).not.toContain("前提過期");
  });
});
