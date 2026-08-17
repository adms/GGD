/**
 * GH#337 的**閘**：GameApp 每一個持有 Babylon 資源的 FX，要嘛在回合邊界被清，
 * 要嘛在下面這張表裡有**書面理由**。
 *
 * 根因不是「有人刪掉了清理」——是兩張手寫清單只有 `dispose()` 那一張是完整的，
 * 而**沒有任何東西在比對它們**。散文治不了這個（元規則），所以這裡是一條會紅的
 * 測試:新加一個 FX 到 GameApp 而忘了 `registry.add(...)` → 紅。
 *
 * 手法沿用 `GameApp.frameWiring.test.ts`（GameApp 抓 Babylon engine / canvas /
 * socket，headless 建構不起來）：`stripComments` + 大括號切塊，所以註解裡談論
 * 這些名字滿足不了任何一條。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { stripComments } from "@ggd/shared/testkit/stripComments";

const read = (rel: string): string =>
  stripComments(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

/**
 * `dispose()` 裡出現、但**刻意不**受回合邊界管的欄位。每一列都要有理由 ——
 * 一列沒有理由的豁免，跟沒有這條測試是一樣的。
 */
const NOT_ROUND_SCOPED: Record<string, string> = {
  postFx: "相機上的 post-process，只在效果衰減中才掛著，衰減完自己就卸下來",
  burnTint: "同上，每個 viewport 的紅色濾鏡，由 BurnTintFrame 每幀驅動",
  deathFocus: "同上，灰階濾鏡只在該玩家死著的時候掛，活過來就卸",
  roundWinner: "回合勝者舞台是 lazy 的 overlay canvas，由它自己的顯示週期收掉",
  views: "實體驅動 —— 單位從 snapshot 消失時 EntityViewRegistry 自己就拆了",
  renderer: "Babylon engine/scene 本身，回合之間當然不能拆",
  sessions: "Colyseus 房間連線，不是特效",
  input: "滑鼠鍵盤擷取，不是特效",
  inputGuard: "beforeunload / keyboard lock 這種全域掛鉤，不是特效",
  touch: "觸控搖桿，不是特效",
  aimIndicator: "瞄準指示器，跟著輸入狀態走，不是特效",
  gamepads: "手把輪詢，不是特效",
};

describe("GH#337 回合邊界的清單與 teardown 的清單對得起來 (round-vfx-cleanup)", () => {
  it("GameApp.dispose() 裡的每一個 FX，不是註冊了就是列在 NOT_ROUND_SCOPED", () => {
    cover("round-vfx-cleanup");
    const app = read("./GameApp.ts");
    const at = app.indexOf("dispose(): void");
    expect(at, "GameApp.ts 找不到 dispose() —— 錨點被改名了").toBeGreaterThan(0);
    const open = app.indexOf("{", at);
    let depth = 0;
    let body = "";
    for (let i = open; i < app.length; i++) {
      if (app[i] === "{") depth++;
      else if (app[i] === "}" && --depth === 0) {
        body = app.slice(open + 1, i);
        break;
      }
    }
    expect(body.length, "dispose() 的大括號沒配對").toBeGreaterThan(0);

    const disposed = new Set([...body.matchAll(/this\.(\w+)\??\.dispose\(\)/g)].map((m) => m[1]!));
    expect(disposed.size, "一個 this.X.dispose() 都沒抓到 —— 抽取壞了").toBeGreaterThan(5);

    const registry = read("./render/roundFxRegistry.ts");
    const registered = new Set(
      [...registry.matchAll(/\.add\(\s*"([^"]+)"/g)].map((m) => m[1]!),
    );
    expect(registered.size, "roundFxRegistry 一個註冊都沒抓到 —— 抽取壞了").toBeGreaterThan(3);

    const unguarded = [...disposed].filter((n) => !registered.has(n) && !(n in NOT_ROUND_SCOPED));
    expect(
      unguarded,
      `這些 FX 會被 teardown 收但回合邊界收不到 —— 在 createRoundFx 裡 registry.add，或連同理由加進 NOT_ROUND_SCOPED：${unguarded.join(", ")}`,
    ).toEqual([]);
  });
});
