/**
 * ⭐⭐ **經驗總倍率乘在三個發放點上**（GH#909）。
 *
 * owner 2026-09-02（逐字）：
 * > 「[Claude 提議 ×3，改成一格『經驗總倍率』預設 3.0] **ok 一起開票在同一張**」
 *
 * ⭐ 票文逐字的四格：
 * · 做法 ＝ **一格倍率**，⛔ 不是把 `reward.xp` 那三個數字改掉
 * · 出貨預設 ＝ **3.0**
 * · 乘在 ⇒ **發放的當下**（一般殭屍單殺 · 特殊殭屍分紅 · 殭屍王分紅），
 *   ⛔ 不是乘在「升級所需」
 * · rollback ⇒ 打回 **1.0** ＝ 回到今天
 *
 * ⭐ **為什麼是倍率**：改 `reward.xp` 是三個數字 × 三個住處 ＝ **九處**；
 * 改倍率是後台**一個欄位** ⇒ owner 下次想從 3.0 調到 2.5 ⛔ 不必經過一次部署。
 *
 * ⚠️⚠️ ⭐ **這一支驗的是「規則轉換之後」的值** —— 三個發放點的共同上游是
 * `mobRulesFromConfig()`，⛔ 而讀 JSON 的字面值會完全漏掉那一層。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `mobs.ts` 一般殭屍那一行的 `* (cfg.reward.xpMultiplier ?? 1)` 拿掉
 *    → 🔴 ②「一般殭屍的經驗沒有乘上倍率」
 * M2 特殊那一行同樣拿掉 → 🔴 ③「特殊殭屍分紅沒有乘上倍率」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mobRulesFromConfig, mobBountyRules } from "./mobs";

const CFG = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/config/arena-rules.json"), "utf8"),
) as { mobWaves: Record<string, unknown> };
const MW = CFG.mobWaves;

/** ⭐ 把倍率換成 `m` 之後，過**出貨的**轉換再問三個發放點。 */
function rulesWith(m: number | undefined): ReturnType<typeof mobRulesFromConfig> {
  const c = JSON.parse(JSON.stringify(MW)) as {
    reward: { xpMultiplier?: number };
  };
  if (m === undefined) delete c.reward.xpMultiplier;
  else c.reward.xpMultiplier = m;
  return mobRulesFromConfig(c as never, 1 / 30);
}

describe("經驗總倍率（GH#909）", () => {
  it("★★ ⭐ 出貨預設是 **3.0**（owner 逐字）", () => {
    expect(
      (MW["reward"] as { xpMultiplier?: number }).xpMultiplier,
      "⛔ 出貨的經驗總倍率不是 3.0 —— owner 2026-09-02 逐字定案的就是這個數字",
    ).toBe(3);
  });

  it("★★ ⭐ **一般殭屍**單殺：×3 真的是 ×1 的三倍", () => {
    const one = rulesWith(1).rewardXp;
    const three = rulesWith(3).rewardXp;
    expect(one, "⛔ 量尺壞了：基礎經驗是 0 ⇒ 乘什麼都一樣").toBeGreaterThan(0);
    expect(
      three,
      `⛔⛔ 一般殭屍的經驗沒有乘上倍率（×1 給 ${one}、×3 給 ${three}）\n` +
        "  ⇒ 去看 `mobs.ts` 的 `rewardXp:` 那一行還有沒有 `* (cfg.reward.xpMultiplier ?? 1)`",
    ).toBe(one * 3);
  });

  it("★★ ⭐ **特殊殭屍**與**殭屍王**的分紅也一起乘（票文點名的另外兩個發放點）", () => {
    for (const kind of ["special", "boss"] as const) {
      const one = mobBountyRules(rulesWith(1), kind)!.xp;
      const three = mobBountyRules(rulesWith(3), kind)!.xp;
      expect(one, `⛔ ${kind} 的基礎經驗是 0 ⇒ 這一格量不到東西`).toBeGreaterThan(0);
      expect(
        three,
        `⛔⛔ ${kind === "special" ? "特殊殭屍" : "殭屍王"}分紅沒有乘上倍率（${one} → ${three}）`,
      ).toBe(one * 3);
    }
  });

  it("★★ ⭐⭐ **rollback**：打回 1.0 ＝ 逐位元回到這一格出現之前", () => {
    const off = rulesWith(1);
    const absent = rulesWith(undefined);
    expect(
      absent.rewardXp,
      "⛔ 缺席時不等於 ×1 ⇒ 一份在這一格出現之前寫好的 arena 會被悄悄改掉",
    ).toBe(off.rewardXp);
    expect(mobBountyRules(absent, "boss")!.xp).toBe(mobBountyRules(off, "boss")!.xp);
  });

  it("⭐ 反方向：倍率 **0** 也寫得出來（⛔ 界線不可以把「不給經驗」擋掉）", () => {
    expect(rulesWith(0).rewardXp, "⛔ ×0 竟然還給經驗").toBe(0);
  });
});
