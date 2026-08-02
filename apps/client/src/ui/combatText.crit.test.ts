/**
 * combat-text-crit — owner 2026-08-02:
 *   「角色傷害暴擊的時候，傷害數值後面會帶 " ! " 驚嘆號」
 *
 * ── 先查了才做:crit 這格到底送不送得到客戶端 ────────────────────────────────
 * 送得到,而且**早就在畫面上用著**。整條路是:
 *   sim  `systems/BasicAttackSystem` 擲骰 → `damageQueue` 的封包帶 `crit`
 *        (`sim/components.ts` 的 `crit?: boolean`);遠程走 `ProjectileComp.crit`
 *        飛完再交還,所以射出去那一刻的暴擊不會在飛行中掉。
 *   client `frameBus.ts` 的 combat-text entry 有 `crit`,而且**暴擊永遠不與同 tick
 *        的其他數字合併**(`if (!input.crit && !input.killingBlow)`),
 *        `WorldAnchorLayer` 再把它讀成 `mods.crit`。
 * 也就是說這不是失敗形態 ②:`CRIT_SIZE_MULT` 一直在用同一格放大字級。缺的只是
 * 那個驚嘆號 —— 所以這次的改動是**在既有通道上加第二個表現**,不是新開一條路。
 *
 * ── 兩個通道分開驗 ──────────────────────────────────────────────────────────
 * 驚嘆號在 `combatTextLabel`,放大在 `combatTextStyle`。分開寫,是為了讓任何一邊
 * 被改壞時另一邊不會幫它掩護(失敗形態 ④:斷言方向跟缺陷無關)。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CRIT_SIZE_MULT,
  CRIT_SUFFIX,
  COMBAT_TEXT_WORDS,
  combatTextLabel,
  combatTextStyle,
  combatTextStyleKey,
  type CombatTextCategory,
} from "./combatText";

describe("暴擊的驚嘆號 (combat-text-crit)", () => {
  it("暴擊的傷害數字後面帶 !,不暴擊就沒有", () => {
    expect(combatTextLabel("dealt", 37, true)).toBe(`37${CRIT_SUFFIX}`);
    expect(combatTextLabel("dealt", 37, false)).toBe("37");
    // 預設參數不可以偷偷變成 true —— 那會讓每一下普攻都看起來像暴擊
    expect(combatTextLabel("dealt", 37)).toBe("37");
  });

  it("受到的傷害也一樣(被暴擊是玩家最需要看見的那一下)", () => {
    expect(combatTextLabel("taken", 250, true)).toBe(`250${CRIT_SUFFIX}`);
  });

  it("`+` 前綴與 `!` 後綴同時在時各站一邊", () => {
    expect(combatTextLabel("heal", 12, true)).toBe(`+12${CRIT_SUFFIX}`);
  });

  it("沒有數字的類別不加驚嘆號 —— 「閃避!」不是一個存在的東西", () => {
    for (const [category, word] of Object.entries(COMBAT_TEXT_WORDS)) {
      expect(combatTextLabel(category as CombatTextCategory, 0, true)).toBe(word);
    }
  });

  it("字級真的變大,而且倍率就是 CRIT_SIZE_MULT", () => {
    const plain = combatTextStyle("dealt", { crit: false, killingBlow: false });
    const crit = combatTextStyle("dealt", { crit: true, killingBlow: false });
    expect(crit.fontSize).toBeGreaterThan(plain.fontSize);
    expect(crit.fontSize).toBe(Math.round(plain.fontSize * CRIT_SIZE_MULT));
  });

  it("暴擊**沒有**專屬顏色 —— 色相是傷害屬性的通道(owner 2026-08-02 裁定)", () => {
    const plain = combatTextStyle("dealt", { crit: false, killingBlow: false, dmgType: "physical" });
    const crit = combatTextStyle("dealt", { crit: true, killingBlow: false, dmgType: "physical" });
    expect(crit.color).toBe(plain.color);
  });

  it("WorldAnchorLayer 真的把 e.crit 餵進 combatTextLabel", () => {
    // 沒有這一條的話,上面每一條都可以全綠而畫面上永遠沒有驚嘆號:
    // `combatTextLabel(cat, amount)` 的第三個參數有預設值 false,少傳不會報錯,
    // 也不會有任何型別錯誤 —— 這就是失敗形態 ② 最典型的長相。
    // 它是 structural 掃描,理由與 `ui/surfaceParity.test.ts` 檔頭同一套:
    // WorldAnchorLayer 是 rAF 迴圈 + DOM,客戶端 vitest env 是 node。註解先剝掉。
    const src = readFileSync(fileURLToPath(new URL("./WorldAnchorLayer.tsx", import.meta.url)), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src).toMatch(/combatTextLabel\(\s*e\.category\s*,\s*e\.amount\s*,\s*e\.crit\s*\)/);
  });

  it("暴擊與不暴擊的 style key 不同 —— 否則池化的節點會沿用上一下的字級", () => {
    // 失敗形態 ②:算出來了(style 對)但畫面沒換(節點沒被重新 style)。
    expect(combatTextStyleKey("dealt", { crit: true, killingBlow: false })).not.toBe(
      combatTextStyleKey("dealt", { crit: false, killingBlow: false }),
    );
  });
});
