/**
 * ⭐ GH#995 —— `pnpm docs:readme:check` 在**每一台機器**上都要得到同一個答案。
 *
 * 在此之前 `tools/reference/gen_readme_lists.py` 的輸出取決於 `data/curation/whitelist.json`
 * （git-ignored 的營運狀態）⇒ owner 的機器 49 名 OPEN、CI 的全新 clone 0 名 ⇒ `--check`
 * 在 CI 結構上不可能綠（CLAUDE.md 失敗形態⑨），於是它被寫成一條「白名單不在就 skip」。
 * 現在開放名單只從進版控的快照 `docs/reference/_curation-snapshot.json` 來。
 *
 * 承重的一條：同一支 `--check`，白名單**在**（這台機器的預設）與**不在**
 * （`GGD_CURATION_WHITELIST` 指到不存在的路徑）各跑一次，兩次都要是 `up to date`
 * —— 也就是兩種環境算出的位元組都等於 commit 裡的那一份。
 * ⚠️ 真的把腳本跑起來，⛔ 不是掃字串。體驗層（工具腳本）：一條薄守衛。
 * 突變紀錄：讓產生器在白名單缺席時多印一句 ⇒ 第二次 `--check` 紅。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const SCRIPT = resolve(ROOT, "tools/reference/gen_readme_lists.py");
const SNAPSHOT = resolve(ROOT, "docs/reference/_curation-snapshot.json");

function check(env: Record<string, string>): string {
  const r = spawnSync("python3", [SCRIPT, "--check"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return `exit=${r.status}\n${r.stdout}${r.stderr}`;
}

describe("README／docs/reference 的產生器不取決於這台機器的營運狀態（GH#995）", () => {
  it("⭐ 白名單在／不在，`--check` 都是 up to date（⛔ 不再有 skip）", () => {
    expect(
      existsSync(SNAPSHOT),
      "開放名單的快照不在 git 裡 —— 在有白名單的機器跑 `pnpm docs:readme` 然後 git add",
    ).toBe(true);

    const present = check({});
    expect(
      present,
      "有白名單的機器：README/docs 過期或快照 ≠ 白名單 ⇒ 跑 `pnpm docs:readme` 然後 git add",
    ).toMatch(/^exit=0\n[\s\S]*up to date/);

    const absent = check({
      GGD_CURATION_WHITELIST: resolve(ROOT, "data/curation/__no-such-whitelist__.json"),
    });
    expect(
      absent,
      "沒有白名單的機器（CI）算出了另一份 README —— 產生器又把機器狀態烘進去了（GH#995）",
    ).toMatch(/^exit=0\n[\s\S]*up to date/);
    expect(absent, "⛔ 「沒驗到」那條 skip 回來了 —— 那不是驗過").not.toContain("沒驗到");
  });
});
