/**
 * ⭐⭐ GH#734 —— 右鍵指令按下去的那一刻要**答得回來**。
 *
 * owner 2026-07-29 逐字：「點右鍵攻擊會讓目標物**閃紅圈圈** 並且玩家角色發出
 * **攻擊語音**；取消...等其他動作也是播對應音效」
 *
 * ── 2026-08-31 量到的現況 ────────────────────────────────────────────────
 * `GameApp.ts` 的 `onOrder` 有**三個**呼叫點，⛔ 而三個都是直通 `setOrder` ——
 * **零個回饋呼叫**。而 `resolveTargetMarker()` 那一套環**已經存在**，
 * ⛔ 只有**手把**那條路在用（`:1856`）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `attackTarget` 那一 case 改成 `return null` → 「右鍵敵人要出聲」紅
 *   · `policy.ring` 那一格拿掉（永遠給 id）→ 「只關環」紅
 *   · `attackMove` 併進 `attackTarget` → 「A 鍵點地是移動不是攻擊」紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Order } from "@ggd/shared/sim/intents";
import {
  orderFeedbackFor,
  ORDER_CUES,
  DEFAULT_ORDER_FEEDBACK,
  NO_ORDER_FEEDBACK,
} from "./orderFeedback";

const o = (kind: string, extra: Record<string, unknown> = {}): Order =>
  ({ kind, ...extra }) as unknown as Order;

describe("GH#734 指令回饋", () => {
  it("量尺先自證：出貨預設是**開的**（⛔ 關著的話下面全是空過）", () => {
    expect(DEFAULT_ORDER_FEEDBACK).toEqual({ enabled: true, ring: true, voice: true });
  });

  it("★ ⭐ **右鍵敵人 ⇒ 那個實體閃 ＋ 攻擊語音**（owner 逐字的那一句）", () => {
    expect(orderFeedbackFor(o("attackTarget", { entity: 42 }))).toEqual({
      flashEntityId: 42,
      cue: "attack",
    });
  });

  it("★ ⭐ **打地板也出聲**（⛔ 沉默與「按鍵沒吃到」在玩家手上長得一樣）", () => {
    const f = orderFeedbackFor(o("attackTarget"));
    expect(f.flashEntityId, "⛔ 沒有目標就沒有環 —— 那是對的").toBeNull();
    expect(f.cue, "⛔ 而它仍然要出聲").toBe("attack");
  });

  it("★ ⭐ **`attackMove` 是移動，⛔ 不是攻擊** —— 玩家還沒指定目標", () => {
    // ⚠️ 併進 `attack` 會讓他以為鎖到人了。
    expect(orderFeedbackFor(o("attackMove", { point: { x: 1, z: 2 } })).cue).toBe("move");
    expect(orderFeedbackFor(o("move", { point: { x: 1, z: 2 } })).cue).toBe("move");
  });

  it("⭐ 停止／保持 ⇒ `stop`；**取消（null）⇒ `cancel`**", () => {
    expect(orderFeedbackFor(o("stop")).cue).toBe("stop");
    expect(orderFeedbackFor(o("hold")).cue).toBe("stop");
    expect(orderFeedbackFor(null).cue, "⛔ 取消也要有音（owner 逐字）").toBe("cancel");
  });

  it("⭐ **兩個軸各自關得掉**（⛔ 不是一個總開關）", () => {
    const a = o("attackTarget", { entity: 7 });
    expect(orderFeedbackFor(a, { enabled: true, ring: false, voice: true })).toEqual({
      flashEntityId: null,
      cue: "attack",
    });
    expect(orderFeedbackFor(a, { enabled: true, ring: true, voice: false })).toEqual({
      flashEntityId: 7,
      cue: null,
    });
    expect(orderFeedbackFor(a, { enabled: false, ring: true, voice: true })).toBe(
      NO_ORDER_FEEDBACK,
    );
  });

  it("⭐ 認不得的 order kind ⇒ **不出聲**（⛔ 猜錯的音效比沒有更難查）", () => {
    expect(orderFeedbackFor(o("someFutureKind")).cue).toBeNull();
  });

  it("⭐ 每一個回得出來的 cue 都在**封閉列舉**裡（⛔ 不是自由字串）", () => {
    for (const k of ["attackTarget", "attackMove", "move", "stop", "hold"]) {
      const c = orderFeedbackFor(o(k)).cue;
      if (c !== null) expect(ORDER_CUES as readonly string[], k).toContain(c);
    }
    expect(orderFeedbackFor(null).cue).toBe("cancel");
  });
});

/**
 * ⭐⭐ **接縫** —— 純函式對了不代表它被叫到（失敗形態⑧）。
 *
 * ⚠️ 這一組刻意掃**出貨原始碼**：「這一行有沒有被接上」本來就是一個關於
 * 原始碼的性質，⛔ 沒有行為版本（`apps/client` 沒有 React 測試環境，
 * 而 `GameApp.ts` 需要一整個 Babylon 場景才跑得起來）。
 * ⭐ 而它釘的是**關係**（`onOrder` 的每一個呼叫點都要先給回饋），
 * ⛔ 不是「檔案裡有沒有提到那個字」。
 */
describe("GH#734 接縫 —— `onOrder` 的每一個呼叫點都接上了", () => {
  const SRC = readFileSync(resolve(__dirname, "../GameApp.ts"), "utf8");

  it("量尺先自證：`onOrder` 真的有呼叫點（⛔ 零個會讓下面空過）", () => {
    expect(SRC.split("onOrder:").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("★ ⭐ **本地玩家的每一個 `onOrder` 都先給回饋**，⛔ 沒有直通的", () => {
    // ⚠️ 直通的形狀逐字是 `onOrder: (order) => this.sender.setOrder(order),`
    //   —— ⭐ 而在 2026-08-31 之前**兩處都是它**。
    const direct = SRC.split("\n").filter((l) =>
      /onOrder:\s*\(order\)\s*=>\s*this\.sender\.setOrder\(order\)/.test(l),
    );
    expect(
      direct,
      "⛔ 又有一條直通的路 —— 那條路上按下右鍵什麼都不會發生",
    ).toEqual([]);
    // ⭐ 接線收成一行（`withOrderFeedback`）—— ⛔ 因為 `GameApp.ts` 有一條
    //   `< 4,000` 行的棘輪，⭐ 而每條 lane 往它塞五行那個檔就回不去了。
    expect(SRC.split("onOrder: withOrderFeedback(").length - 1).toBe(2);
  });

  it("⭐ 指令環真的接進 indicator（⛔ 算出來了但沒畫＝失敗形態①）", () => {
    // ⭐ 狀態搬進 `game/orderFeedbackRunner.ts` —— ⛔ `GameApp.ts` 有一條棘輪
    //   （「只能變短，新東西請放進 game/」），⭐ 而我第一版寫在那裡當場把它撞紅。
    expect(SRC).toContain("pickTargetRing(this.orderFeedback,");
    // ⚠️ ⭐ **⛔ 不要抄縮排** —— 我第一版斷言了 `"resolveTargetMarker(\n    orderTarget,"`
    //   而它因為縮排差幾格就紅了。⭐ 要釘的是**關係**：那個目標被解成一個環。
    const i = SRC.indexOf("pickTargetRing(this.orderFeedback,");
    const win = SRC.slice(i, i + 300);
    // ⚠️ ⭐ 它是**當函式傳進去**的（⛔ 不是在這裡呼叫）⇒ 斷言不可以帶括號。
    expect(win, "⛔ 算出來了卻沒有解成環（失敗形態①）").toContain("resolveTargetMarker");
    expect(win, "⛔ 解的不是指令那一個目標").toContain("resolvePadTargetMarker");
  });

  it("⭐ 環用**時間戳**過期，⛔ 不是一個要有人記得關的 boolean", () => {
    const runner = readFileSync(resolve(__dirname, "../game/orderFeedbackRunner.ts"), "utf8");
    expect(runner).toContain("private flashUntilMs = 0;");
    expect(runner, "⛔ 改回 boolean = 需要有人記得關掉它").toContain(
      "this.nowMs() < this.flashUntilMs",
    );
  });
});
