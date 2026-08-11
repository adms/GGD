/**
 * GH#314 —— 每一格技能在它**解鎖的那個等級**都必須付得起。
 *
 * owner 2026-08-12：「統一全英雄初始 MP +600（後台倍率預設值可改）」。
 * 那個 +600 住在 `config.base-bonus@1` 的 `bonus.maxMana`，這條守衛驗的是
 * **它真的讓每一格按得下去**，⛔ 不是驗「+600 這個數字」（第二守則：不驗數字）。
 *
 * ⚠️ 這條守衛的價值全在**基準**上，而那個基準我第一次算錯了兩次：
 *
 *   ① 只讀 `def.baseStats.maxMana` → 漏掉**智力貢獻**。夏娜的 baseStats 是 100，
 *      但 `championStatBase` 算出來的 L1 池是 355（+600 = 955）。用錯基準會報出
 *      3 支假的「超池」。
 *   ② 一律拿 **L1** 衡量 → EX 技能在第 7 回合（≈L30）才解鎖，用 L1 的池衡量一支
 *      玩家在 L30 才碰得到的技能，等於在問一個不會發生的問題。
 *
 * 所以這裡**逐槽位取它自己的解鎖等級**，而且用出貨的 `championStatBase`
 * （⛔ 不自己重算公式 —— 那會變成第二份實作）。
 *
 * 失敗形態②：算出來了但玩家拿不到。一支 MP 超過池的技能，面板畫得出來、
 * 說明寫得漂亮，**按下去毫無反應而且不會說為什麼**。
 *
 * 突變紀錄：
 *   · `content/config/base-bonus.json` 的 `bonus.maxMana` 拿掉 → 紅（4 支超池）
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { registerAll, Configs } from "./registries";
import { Champions } from "../sim/content/registry";
import { championStatBase } from "../sim/stats/attributes";
import { Stat } from "../sim/stats/statTypes";
import { normalizeBaseBonus } from "../sim/baseBonus";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/**
 * 槽位 → 它解鎖的等級。⚠️ 從 `config.arena-rules@1` 的 `grantLevels` **推導**，
 * ⛔ 不抄字面值（Q/W/E 第 1 回合、R 第 3 回合、EX 第 7 回合，而每回合給幾級是
 * owner 會調的東西）。
 */
function unlockLevels(rules: unknown): Record<string, number> {
  const rounds = (rules as { rounds?: Record<string, { grantLevels?: number }> })?.rounds ?? {};
  const keys = Object.keys(rounds)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  let acc = 1;
  const byRound: Record<number, number> = {};
  for (const r of keys) {
    acc += rounds[String(r)]?.grantLevels ?? 0;
    byRound[r] = acc;
  }
  const last = keys.length ? byRound[keys[keys.length - 1]!]! : 1;
  const at = (round: number) => byRound[round] ?? last;
  // ⚠️ 一個槽位在「解鎖的那一回合」就要付得起 —— 用**那一回合結束時**的等級太寬鬆。
  return { passive: 1, Q: at(1), W: at(1), E: at(1), R: at(3), ex: at(7) };
}

describe("技能在解鎖等級付得起（GH#314）", () => {
  it("⭐ 沒有任何一格的首階 MP 超過持有者當時的魔力池 —— 超過 = 那顆鈕永遠按不下去", async () => {
    cover("ability-affordable-at-unlock");
    const loaded = await new ContentLoader(new FsContentSource(CONTENT)).load();
    registerAll(loaded.store);

    const rules = Configs.tryGet("arena-rules");
    const L = unlockLevels(rules);
    expect(L.ex, "夾具前提：讀不到 arena-rules 就等於全部用 L1 衡量").toBeGreaterThan(L.Q);

    const bonus = normalizeBaseBonus(
      (Configs.tryGet("base-bonus") as { bonus?: unknown } | undefined)?.bonus,
    );
    const manaBonus = bonus[Stat.MaxMana] ?? 0;

    const over: string[] = [];
    let checked = 0;
    for (const c of Champions.all()) {
      for (const [slot, ab] of Object.entries(c.abilities ?? {})) {
        const mp = (ab as { manaCost?: number[] } | undefined)?.manaCost;
        if (!Array.isArray(mp) || mp.length === 0 || !(mp[0]! > 0)) continue;
        checked++;
        const pool = championStatBase(c, Stat.MaxMana, L[slot] ?? L.Q!) + manaBonus;
        if (mp[0]! > pool)
          over.push(`${c.id}.${slot} MP1=${mp[0]} > 池(L${L[slot] ?? L.Q})=${Math.round(pool)}`);
      }
    }

    // 夾具前提：真的掃到東西，否則上面兩圈是在掃空氣（失敗形態③）。
    expect(checked, "一格帶 manaCost 的技能都沒掃到 —— 這條守衛在測空集合").toBeGreaterThan(200);
    expect(over, "MP 超過魔力池 = 那顆鈕永遠按不下去，而且面板不會說為什麼").toEqual([]);
  });
});
