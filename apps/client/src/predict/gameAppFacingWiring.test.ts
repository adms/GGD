/**
 * GH#281 出貨路徑的守衛 —— **被測的是 GameApp 自己的方法，不是一份重寫**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這個檔為什麼存在
 * ═══════════════════════════════════════════════════════════════════════════
 * #281 的規則層（`localRenderPose.ts` / `LocalPrediction.setCombatFacingTarget`）
 * 本來就有測試，而且測得很紮實。**但接線層一條守衛都沒有。** 2026-08-03 實測：
 * 一次撤掉 `GameApp.ts` 上 #281 的**全部三處**接線 ——
 *
 *   1) `authFacing` 取樣（改成硬寫 `undefined`）
 *   2) `setCombatFacingTarget(...)` 整行刪掉
 *   3) `poseFor` 的 `localRenderPose(...)` 改回 `return localPose`
 *
 * —— 跑 9 個相關測試檔、**78 條測試全綠**。也就是說這個功能在玩家那邊可以完全
 * 消失，而測試會說沒事。CLAUDE.md 失敗形態 ③（可以從渲染樹刪掉但測試還是全綠）
 * ＋ ⑤（被測的不是出貨的那個）。
 *
 * 所以這裡照 `predictionArenaParity.test.ts:188` 的樣板：
 * **`GameApp.prototype.<method>.call(self, …)` 跑真的那一份**，
 * `self` 只放那個方法真的會碰到的欄位。不 mock 被測方法本身。
 *
 * ⚠️ 涵蓋範圍要誠實：這個檔守的是 `combatFacingTargetPos`（接線 2 的實質內容）
 * 與「teleport 要清掉上一回合的交戰對象」。接線 1 與 3 在 `frame()` 裡面，
 * prototype-call 需要幾十個 mock 才跑得起來 —— 那兩處目前**仍然沒有守衛**，
 * 不要以為這個檔全包了。
 */
import { describe, expect, it } from "vitest";

import type { GameApp } from "../GameApp";

type Vec2 = { x: number; z: number };
type FacingHost = { combatFacingTargetPos: (state: unknown, renderTick: number) => Vec2 | null };

/** 一份最小的 `MatchState` 替身：`combatFacingTargetPos` 只用到 `entities.get`。 */
function stateWith(entries: Record<string, { x: number; z: number; alive: boolean }>) {
  return { entities: { get: (id: string) => entries[id] } };
}

describe("GameApp.combatFacingTargetPos —— 出貨路徑（GH#281 接線 2）", () => {
  it("回傳的是**內插後**的座標，不是快照的原始座標", async () => {
    const { GameApp } = await import("../GameApp");
    const self = {
      attackOrderTargetId: 7,
      // 快照說目標在 (100, 100)；內插器說它現在畫在 (10, 20)。
      interp: { sample: (id: number) => (id === 7 ? { x: 10, z: 20 } : null) },
    };

    const got = (GameApp.prototype as unknown as FacingHost).combatFacingTargetPos.call(
      self,
      stateWith({ "7": { x: 100, z: 100, alive: true } }),
      1234,
    );

    // ⚠️ 這一條就是突變點：把實作改成 `return { x: es.x, z: es.z }`（忽略 interp）
    // 這裡會拿到 100/100 而紅。身體要轉向的是玩家**看得到**的那個目標，
    // 不是一個 INTERP_DELAY_MS 之後才會被畫出來的位置。
    expect(got, "取樣得到內插座標時不可以退回快照座標").toEqual({ x: 10, z: 20 });
  });

  it("內插器取樣不到才退回快照座標", async () => {
    const { GameApp } = await import("../GameApp");
    const self = { attackOrderTargetId: 7, interp: { sample: () => null } };

    const got = (GameApp.prototype as unknown as FacingHost).combatFacingTargetPos.call(
      self,
      stateWith({ "7": { x: 100, z: 100, alive: true } }),
      1234,
    );

    expect(got, "取樣不到就該退回快照，而不是整個放棄面向").toEqual({ x: 100, z: 100 });
  });

  it("目標死了 → 回 null **而且**把記憶中的 id 一起清掉", async () => {
    const { GameApp } = await import("../GameApp");
    const self = {
      attackOrderTargetId: 7,
      interp: { sample: () => ({ x: 10, z: 20 }) },
    };

    const got = (GameApp.prototype as unknown as FacingHost).combatFacingTargetPos.call(
      self,
      stateWith({ "7": { x: 100, z: 100, alive: false } }),
      1234,
    );

    expect(got).toBeNull();
    // 清掉 id 是**行為**不是裝飾：留著的話下一幀又會去查同一具屍體，
    // 身體就一直朝著它最後停下來的地方站著。
    expect(self.attackOrderTargetId, "死掉的目標必須連 id 一起忘掉").toBeNull();
  });

  it("目標整個離開快照（離線／被移除）也算失效", async () => {
    const { GameApp } = await import("../GameApp");
    const self = { attackOrderTargetId: 7, interp: { sample: () => ({ x: 10, z: 20 }) } };

    const got = (GameApp.prototype as unknown as FacingHost).combatFacingTargetPos.call(
      self,
      stateWith({}),
      1234,
    );

    expect(got).toBeNull();
    expect(self.attackOrderTargetId).toBeNull();
  });

  it("沒有交戰對象 / 沒有 state → null（不可以丟例外）", async () => {
    const { GameApp } = await import("../GameApp");
    const proto = GameApp.prototype as unknown as FacingHost;

    expect(proto.combatFacingTargetPos.call({ attackOrderTargetId: null }, stateWith({}), 1)).toBeNull();
    expect(proto.combatFacingTargetPos.call({ attackOrderTargetId: 7 }, null, 1)).toBeNull();
  });
});

describe("GH#281 接線：teleport 要清掉跨回合的交戰對象", () => {
  it("`frame` 在 teleport 分支上清掉 attackOrderTargetId", async () => {
    // ⚠️ 這一條是**原始碼結構**斷言，不是行為斷言 —— CLAUDE.md 失敗形態 ⑥。
    // 留著是因為 `frame()` 的 prototype-call 需要幾十個 mock，而這個缺陷
    // （新回合影子朝著上一場的對手）值得**現在**就有一個會紅的東西。
    // 把它換成真正的行為守衛是 GH#281 的後續工作，不要把這條當成完成。
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../GameApp.ts", import.meta.url), "utf8");
    const teleportIdx = src.indexOf("this.prediction.teleport(authPos");
    expect(teleportIdx, "找不到 teleport 呼叫 —— 這個守衛已經過期了，請重寫").toBeGreaterThan(0);

    // 往回看 500 個字元：清除必須就在同一個分支裡，不是散在別處。
    const before = src.slice(Math.max(0, teleportIdx - 500), teleportIdx);
    expect(
      before.includes("this.attackOrderTargetId = null"),
      "teleport（＝新回合重生）沒有清掉上一回合的交戰對象 —— 影子會朝著已經不在的人轉身",
    ).toBe(true);
  });
});

// 型別層：確保上面的 cast 沒有把一個不存在的方法名寫進來（改名就編譯不過）。
type _AssertMethodExists = GameApp extends { frame: unknown } ? true : never;
