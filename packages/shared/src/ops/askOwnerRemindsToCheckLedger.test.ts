import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **「上次討論過了 你怎麼又問我」** —— owner 2026-09-09 逐字。
 *
 * ⭐ 而查下去他是對的：`asked-before.sh role 標籤` 只找得到**當天**那一筆
 *   ⇒ 他上一次的裁決**從來沒被記進帳本** ⇒ 所以我又問了一次。
 *
 * ⚠️ ⭐ 工具早就在（`ruling.sh` 寫票＋帳本 · `asked-before.sh` 查），
 *   ⛔ 而沒有任何東西逼我用它 —— CLAUDE.md 記著這條散文**失效過四次**。
 *
 * ⇒ 第五次之後把它接上 hook：**在留言裡問 owner 一個決定時會被提醒先查**。
 *   ⚠️ ⭐ 刻意是**警告不擋**（exit 0）：擋掉會變成「算了不問了」——
 *   ⭐ 而一個該問而沒問的決定，比一次重複發問更貴。
 */

const REPO = join(import.meta.dirname, "../../../..");
const HOOK = join(REPO, "scripts/preserve-before-overwrite.py");

function run(command: string): { code: number; err: string } {
  // ⭐ 用 `spawnSync` —— ⛔ `execFileSync` 成功時**只回 stdout**，
  //   而這個提醒是印在 **stderr** 上的（hook 的慣例）。
  //   ⚠️ 我第一版就是這樣讓尺瞎掉的：hook 有作用而測試說沒有。
  const r = spawnSync("python3", [join(REPO, "scripts/preserve-before-overwrite.py")], {
    cwd: REPO,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    timeout: 60_000,
  });
  return { code: r.status ?? -1, err: `${r.stderr ?? ""}${r.stdout ?? ""}` };
}

describe("問 owner 之前先查他答過沒（owner 2026-09-09「你怎麼又問我」）", () => {
  it("① 留言在問 owner 一個決定 ⇒ ⭐ 提醒先查，⛔ 而不擋", () => {
    const { code, err } = run(
      'gh issue comment 1138 --body "這一格要 owner 決定：選 A 還是 B"',
    );
    expect(code, "⛔ 擋掉了 —— 那會變成「算了不問了」，比重複發問更貴").toBe(0);
    expect(err, "⛔ 沒提醒 ⇒ 下一次還是會直接問").toContain("asked-before.sh");
    expect(err, "⛔ 沒指出根因（是我沒記，不是他沒說）").toContain("ruling.sh");
  });

  it("② 一般的留言 ⇒ ⛔ 不吵（⭐ 證明①不是對每個 gh 指令都喊）", () => {
    const { code, err } = run('gh issue comment 999 --body "量到的數字：37/37 通過"');
    expect(code).toBe(0);
    expect(err).not.toContain("asked-before.sh");
  });

  it("③ 完全無關的指令 ⇒ ⛔ 不吵", () => {
    expect(run("git status --porcelain").err).not.toContain("asked-before.sh");
  });
});
