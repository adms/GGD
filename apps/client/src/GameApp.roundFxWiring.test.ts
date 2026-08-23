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
  // ── GH#594 之後才浮出來的一族（`.reset()` / `.clear()` / `.despawn()` 收尾的） ──
  footstep: "本地腳步的節拍狀態,跟著**實體**走(單位不在了就沒有腳步),⛔ 不是留在場上的資源",
  remoteSteps: "同上,另外十一位的推導腳步 —— 它的 key 是實體 id,實體消失即失效",
  sfxQueue: "**一幀**的空間音效批次,下一幀就 flush 掉 —— 壽命比一個回合短兩個數量級",
  interp: "實體位置插值緩衝,key 是實體 id;單位從 snapshot 消失時就沒有人再讀它",
  prediction: "本地預測的替身,跟著本地實體走(despawn 是它自己的生命週期,不是回合的)",
  aliveByPlayer: "存活表,每一幀由權威 snapshot 整份覆寫 —— 回合邊界清它不會改變任何一幀的結果",
  casts: "施法進度追蹤,由 cast 開始/結束事件自己增刪;回合邊界不會留下沒結束的施法",
  connStats: "網路統計(ping/jitter),跟**房間連線**走不跟回合走 —— 回合之間連線並沒有斷",
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

    // ⭐ GH#594 —— 抽取以前**只認 `.dispose()`**,而 `dispose()` 裡有一整族是用
    //    `.reset()` / `.clear()` / `.clearAll()` / `.despawn()` 收尾的。那一族
    //    **結構上不可能**進 `disposed` ⇒ 既不必註冊、也不必寫豁免理由,
    //    而「抽取看不到」與「已經覆蓋」在斷言上長得**一模一樣**。
    //    ⛔ 這不是理論:GH#580(`vfxSoundLayer` 的循環音跟著進商店)正是這個洞放過去的。
    const disposed = new Set(
      [...body.matchAll(/this\.(\w+)\??\.(?:dispose|reset|clear|clearAll|despawn)\(\)/g)].map(
        (m) => m[1]!,
      ),
    );
    // 第二道:**module 單例**（連 `this.` 都沒有），例如 `vfxSoundLayer.reset()`。
    for (const m of body.matchAll(/^\s*(\w+)\.reset\(\)/gm)) disposed.add(m[1]!);
    expect(disposed.size, "一個收尾呼叫都沒抓到 —— 抽取壞了").toBeGreaterThan(5);

    const registry = read("./render/roundFxRegistry.ts");
    // ⭐ GH#560 —— 兩種註冊都要抓：`add()`（四個邊界全跑，預設）與
    //    `addScoped()`（只跑某幾個邊界，`why` 必填）。⛔ 只認 `.add(` 的話，
    //    改成 scoped 的那幾列會**從這張表上消失**而斷言照樣綠 —— 那正是這條
    //    測試存在的理由（兩份清單沒有人比對）換一層再犯。
    const registered = new Set(
      [...registry.matchAll(/\.add(?:Scoped)?\(\s*"([^"]+)"/g)].map((m) => m[1]!),
    );
    expect(registered.size, "roundFxRegistry 一個註冊都沒抓到 —— 抽取壞了").toBeGreaterThan(3);
    // GH#580 —— 特效循環音（龍捲風／火柱／吐息／傳送門,28 支技能覆寫）真的在表上。
    expect([...registered], "GH#580:特效循環音的登記表不在回合邊界上").toContain("vfxSoundLayer");

    const unguarded = [...disposed].filter((n) => !registered.has(n) && !(n in NOT_ROUND_SCOPED));
    expect(
      unguarded,
      `這些 FX 會被 teardown 收但回合邊界收不到 —— 在 createRoundFx 裡 registry.add，或連同理由加進 NOT_ROUND_SCOPED：${unguarded.join(", ")}`,
    ).toEqual([]);
  });
});
