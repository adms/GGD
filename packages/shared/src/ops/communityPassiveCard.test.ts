/**
 * 🃏 社群英雄天生技的卡面 ＝ 同一名英雄 Q/W/E/R 的三行格式（GH#1239）。
 *
 * > owner 2026-09-12（逐字，`docs/_daily/ledger-source_temp_20260912.md:30`）：
 * >  「卡面缺字 #1239 34 支技能攻擊時會觸發而卡面沒說(31 支是新上架那批帶的)=> 那你補阿幹嘛問我」
 *
 * ⭐ 真的把 `tools/ship-81/passive_card.py --check` 跑起來（⛔ 不是掃字串）——
 * 組字與「recipe `currentBehavior` 對上出貨 JSON 才上卡」的判準都住在那一支，⛔ 這裡不抄第二份。
 *
 * ⚠️ 為什麼 `declaredFieldMatchesShape` 那一條不夠：它只抓「掛 `onBasicAttack` 而卡面沒說普攻」。
 * 03／08／25／31／35 的原始描述**本來就含「普攻」兩個字**，把【目前模板可執行】那行拿掉它照樣綠 ——
 * ⭐ 而那時卡面又回到「只剩目標設計」的謊話。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/ship-81/passive_card.py");

describe("社群天生技卡面（GH#1239）", () => {
  it("⭐ 有代理 runtime 的天生技卡面都已組成三行（⛔ 還只有目標設計 ⇒ 紅）", () => {
    expect(existsSync(SCRIPT), "passive_card.py 不見了 —— 這條守衛在測空氣").toBe(true);
    const r = spawnSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });
    expect(
      r.status,
      "⛔ 不要改這條測試 —— 跑 `python3 tools/ship-81/passive_card.py && pnpm prose:build`，" +
        `再 commit content/abilities。\n腳本說：${r.stdout}${r.stderr}`,
    ).toBe(0);
    // ⭐ 分母：真的組到卡（⛔ recipe 讀不到時「0 份待組」讀起來跟全過一樣）。
    expect(r.stdout, `⛔ 一份卡都沒核到 —— 母體塌了：${r.stdout}`).toMatch(/已組好 [1-9]\d* 份/);
  });
});
