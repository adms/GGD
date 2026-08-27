/**
 * 🚪 GH#716 —— `GameApp.ts` 拆檔的**閘**（第〇·七守則）。
 *
 * ⭐ 三個必要條件裡的第②③條（①門面由下面第三條驗）：
 * **新開一個 `game/*.ts` 卻忘了掛上去要有東西紅**，而且閘**從出貨的那個檔推導** ——
 * ⛔ 不是掃資料夾就收工。前例：`config.ts` 9,162→68 檔那次的閘只掃 `schema/config/`
 * 這一層，而 `castApproachDoc.ts` 住上一層 ⇒ 漏一行 union **不會紅**，
 * 2026-08-22 差點造成線上事故。
 * ⇒ 這裡兩個方向一起讀：資料夾裡的每一個檔，都必須被**出貨的 `GameApp.ts`**
 * （或它已經 import 的某個 `game/` 模組）真的 import 到。
 *
 * ⚠️ 這一支是**體驗層**（拆檔的接線），所以 ≤80 行、只做一次突變 ——
 * 行為本身由既有的那些守衛承擔（`GameApp.zoneCull` / `mobHealthBarWiring` /
 * `anchorBounds` 都已經跟著搬過去掃新的模組了）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";

const TAG = "client-gameapp-split";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const GAME_APP = readFileSync(fileURLToPath(new URL("../GameApp.ts", import.meta.url)), "utf8");
const read = (f: string): string => readFileSync(HERE + f, "utf8");
const modules = readdirSync(HERE).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

/** 從 `GameApp.ts` 出發，跟著 `./game/x` 與同目錄的 `./x` 走一遍可達集合。 */
function reachable(): Set<string> {
  const seen = new Set<string>();
  const queue = [...GAME_APP.matchAll(/from "\.\/game\/([\w.-]+)"/g)].map((m) => `${m[1]!}.ts`);
  while (queue.length > 0) {
    const f = queue.pop()!;
    if (seen.has(f) || !modules.includes(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/from "\.\/([\w.-]+)"/g)) queue.push(`${m[1]!}.ts`);
  }
  return seen;
}

describe("GameApp 拆檔 (client-gameapp-split)", () => {
  it("① 每一個 game/*.ts 都被出貨的 GameApp.ts 真的 import 到", () => {
    cover(TAG);
    // GUARD-THE-GUARD：掃到 0 個檔要爆炸，⛔ 不是安靜全綠。
    expect(modules.length, "game/ 底下掃不到模組 —— 路徑或過濾條件壞了").toBeGreaterThanOrEqual(3);
    const live = reachable();
    const orphans = modules.filter((f) => !live.has(f));
    expect(
      orphans,
      `這幾個 game/*.ts 沒有任何出貨路徑到得了 ⇒ 它們是死碼（拆出去卻忘了掛上）：${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("② 棘輪：GameApp.ts 只能變短，⛔ 不可以再漲回 4,000 行", () => {
    cover(TAG);
    const lines = GAME_APP.split("\n").length;
    // ⭐ 第〇·七守則的線就是 4,000。⚠️ 這一格是**棘輪**：拆完之後它降到 3,991，
    // 所以上界寫 4,000 —— 下一條 lane 想再往這個檔塞 10 行就會撞到閘，
    // 而那正是這張票要防的東西（它 60 天內被改了 116 次）。
    expect(lines, `GameApp.ts 又漲到 ${lines} 行 —— 新東西請放進 game/，⛔ 不要塞回這個檔`).toBeLessThan(
      4000,
    );
  });

  it("③ 門面：GameAppOptions 仍然從 GameApp.ts 出得去（既有 import 端不准斷）", () => {
    cover(TAG);
    // `main.tsx` / `ui/replay/ReplayApp.tsx` 都寫 `from "./GameApp"`，⛔ 搬走型別
    // 而不留門面 = 它們當場斷掉。
    expect(GAME_APP, "GameAppOptions 的門面沒了 —— main.tsx 會編不過").toMatch(
      /export type \{[^}]*GameAppOptions/,
    );
  });
});
