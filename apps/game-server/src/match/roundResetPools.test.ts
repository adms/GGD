/**
 * 回合重置的清池 —— **每一條**把英雄放上場的路徑都要走同一支函式（A4a，#278）。
 *
 * ⚠️ 為什麼是好幾條：`MatchController` 有多條擺位路徑（決鬥配對 + 大亂鬥
 * `placeRoyale` + 練習房 `placePractice`），而它們各自手寫了一份重置。只改一條
 * 會讓某一種回合的殘留活下來、而另一種是乾淨的 —— **測起來像隨機故障**。
 *
 * ⚠️ 為什麼讀原始碼：與 `configWiringCompleteness.test.ts` 同一個理由 ——
 * 「有 N 個站點，而其中一個沒改」是一個**語法事實**，沒有執行期簽章。
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

/** 從函式標頭往後切到下一個同層縮排的成員。 */
function bodyOf(name: string): string {
  const at = CODE.indexOf(`private ${name}(`);
  expect(at, `找不到函式 ${name} —— 它被改名或刪掉了`).toBeGreaterThan(-1);
  const rest = CODE.slice(at);
  const end = rest.slice(1).search(/\n {2}(private|public|protected)? ?[a-zA-Z]+\(/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

describe("回合邊界重置：每一條路徑都走同一支函式", () => {
  it("★ 擺位路徑 **與中場入口** 都呼叫 `restoreForNextRound`", () => {
    cover("match-round-reset-pools");
    // ⚠️ 這一條原本是 `count === 2`，後來因為新增路徑以「應該是 2」紅掉 ——
    // 絕對數字是會過期的（第二守則：驗機制、⛔ 不驗數字）。守的是性質：
    // **把英雄放上場、或把玩家放進商店的每一支函式，body 裡都要有那一行**。
    // ⭐ `enterIntermission` 是 GH#455 加進來的那一站：少了它，中場整段期間
    // 玩家帶著上一回合的殘血在商店裡做採買決策。
    for (const fn of ["enterCombat", "placeRoyale", "placePractice", "enterIntermission"]) {
      expect(
        bodyOf(fn),
        `${fn} 沒有呼叫 restoreForNextRound —— 上一回合的殘血/燃燒/護盾會活下來`,
      ).toContain("restoreForNextRound(");
    }
  });

  it("⛔ 手寫的重置寫法一個都不可以留在那幾條路徑上", () => {
    cover("match-round-reset-pools");
    // 舊寫法的指紋。`hp.hp = hp.maxHp` 在**作弊指令**上是合法的（god mode /
    // fullHeal 刻意不清池），所以只掃這幾支函式，⛔ 不掃全檔。
    for (const fn of ["enterCombat", "placeRoyale", "placePractice", "enterIntermission"]) {
      const body = bodyOf(fn);
      expect(body, `${fn} 又長出一份手寫的回滿`).not.toContain("hp.hp = hp.maxHp");
      expect(body, `${fn} 又長出一份手寫的清池`).not.toContain("hp.shields = []");
      expect(body, `${fn} 又長出一份手寫的清池`).not.toContain("st.effects = []");
    }
  });
});
