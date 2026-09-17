/**
 * ⭐ 角色名言總表的閘 —— 真的把產生器跑起來（⛔ 不是掃字串）。
 *
 * > owner 2026-09-17：「你是不是忘記把所有角色我跟你對應過的角色名言建檔」
 *
 * 名言住三個地方（owner 名單／聽審採用的原作／選角畫面那一套）⇒ 少了哪一位以前沒有任何東西會叫。
 * 這條閘問兩件事：① `docs/角色名言總表.md` 與 `inventory.json` 是不是最新的；
 * ② **缺口只能變少** —— 上架新英雄卻沒給名言 ⇒ 棘輪紅（`tools/quote-inventory/ratchet.json`）。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");
const gen = (...args: string[]) =>
  spawnSync("node", ["--import", "tsx", "tools/quote-inventory/gen.mjs", ...args], { cwd: REPO, encoding: "utf8" });

describe("角色名言總表", () => {
  it("總表與缺口棘輪都是最新的（過期或缺口變多就紅）", () => {
    const r = gen("--check");
    expect(`${r.stdout}${r.stderr}`.trim()).not.toMatch(/過期|缺口/);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
  });

  it("總表列出出貨名單上的每一位，缺名言的那幾位有自己的一節", () => {
    const doc = readFileSync(join(REPO, "docs/角色名言總表.md"), "utf8");
    const inv = JSON.parse(readFileSync(join(REPO, "tools/quote-inventory/inventory.json"), "utf8"));
    expect(inv.rows).toHaveLength(inv.roster);
    for (const row of inv.rows) expect(doc).toContain(`\`${row.id}\``);
    expect(doc).toContain(`## ⛔ 戰鬥名言缺口（${inv.battleMissing} 位）`);
  });
});
