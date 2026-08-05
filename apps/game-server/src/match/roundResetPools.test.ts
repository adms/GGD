/**
 * 回合重置的清池 —— **兩個** `enterCombat` 站點都要走同一支函式（A4a，#278）。
 *
 * ⚠️ 為什麼是兩個：`MatchController` 有兩條擺位路徑（決鬥配對 + 大亂鬥
 * `placeRoyale`），而它們各自手寫了一份清池。只改一條會讓大亂鬥回合的殘留
 * 活下來、而決鬥回合是乾淨的 —— **測起來像隨機故障**。
 *
 * ⚠️ 為什麼讀原始碼：與 `configWiringCompleteness.test.ts` 同一個理由 ——
 * 「有兩個站點，而其中一個沒改」是一個**語法事實**，沒有執行期簽章。
 * 行為那一半（清了之後 `world.dot` 真的空了）在
 * `packages/shared/src/sim/clearPools.test.ts`，這裡只擋「漏了一個站點」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "MatchController.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("回合重置：兩個 enterCombat 站點都清池", () => {
  it("★ `clearForFreshBody` 在 MatchController 裡出現**兩次**", () => {
    cover("match-round-reset-pools");
    const n = (CODE.match(/clearForFreshBody\s*\(/g) ?? []).length;
    // 靶：把 royale 那一條改回手寫的兩行 → 1 → 紅（而且訊息說得出少了幾個）。
    expect(n, `只找到 ${n} 個呼叫點，應該是 2（決鬥 + 大亂鬥）`).toBe(2);
  });

  it("⛔ 手寫的清池寫法一個都不可以留下", () => {
    cover("match-round-reset-pools");
    // 舊寫法的指紋：`hp.shields = []` 與 `st.effects = []`。
    // 留著任何一個 = 有一條路徑繞過了共用函式，而 dot 那一池又漏掉了。
    expect(CODE).not.toContain("hp.shields = []");
    expect(CODE).not.toContain("st.effects = []");
  });
});
