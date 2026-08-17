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
  it("★ **每一條**擺位路徑都呼叫 `clearForFreshBody`", () => {
    cover("match-round-reset-pools");
    // ⚠️ 這一條原本是 `count === 2`（決鬥 + 大亂鬥）。GH#343 加了第三條擺位路徑
    // （練習房 `placePractice`），於是它以「應該是 2」紅掉 —— 而**新路徑其實有
    // 好好清池**，訊息卻指著一個不存在的缺陷。絕對數字是會過期的（第二守則：
    // 驗機制、⛔ 不驗數字）。
    // ⇒ 改成守真正的性質：**把英雄放上場的每一支函式，body 裡都要有那一行**。
    //   加第四條路徑時它自動涵蓋；把任何一條改回手寫清池時它仍然紅。
    const bodyOf = (name: string): string => {
      const at = CODE.indexOf(`private ${name}(`);
      expect(at, `找不到擺位函式 ${name} —— 它被改名或刪掉了`).toBeGreaterThan(-1);
      // 從函式標頭往後切到下一個 `\n  private ` / `\n  public `（同一層縮排）。
      const rest = CODE.slice(at);
      const end = rest.slice(1).search(/\n {2}(private|public|protected)? ?[a-zA-Z]+\(/);
      return end < 0 ? rest : rest.slice(0, end + 1);
    };
    // 三條路徑：決鬥配對（住在 `enterCombat` 裡）· 大亂鬥 · 練習房。
    for (const fn of ["enterCombat", "placeRoyale", "placePractice"]) {
      expect(
        bodyOf(fn),
        `${fn} 把英雄放上場卻沒有呼叫 clearForFreshBody —— 上一回合的燃燒/護盾會活到這一場`,
      ).toContain("clearForFreshBody(");
    }
  });

  it("⛔ 手寫的清池寫法一個都不可以留下", () => {
    cover("match-round-reset-pools");
    // 舊寫法的指紋：`hp.shields = []` 與 `st.effects = []`。
    // 留著任何一個 = 有一條路徑繞過了共用函式，而 dot 那一池又漏掉了。
    expect(CODE).not.toContain("hp.shields = []");
    expect(CODE).not.toContain("st.effects = []");
  });
});
