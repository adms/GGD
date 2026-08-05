/**
 * `onReflect`【反彈成功時】的行為守衛（owner 2026-08-05：「onReflect／反彈成功時
 * 這個也要」）。
 *
 * ── ⛔ 這一檔的重點是**它不該發的三種情況** ─────────────────────────────
 *
 * 「有反彈到就發」是很好寫的一半。難的、而且會讓一張卡在戰場上說謊的另一半，
 * 是**沒反彈到的時候不可以發** —— `incomingPct` 有三道閘：
 *
 *   ① 事件沒帶封包（`ctx.incoming === undefined`）—— 不是被打出來的
 *   ② `reflectDepth > maxChainDepth` —— 反彈鏈到底了
 *   ③ 排空預算來不及且 `whenTooLate: "drop"`（出貨預設）
 *
 * 三道任何一道攔下來都**沒有反彈**，而一個照樣觸發的 `onReflect` 會讓
 * 「反彈時回血」實際上變成「被打時回血」—— 那是另一支技能，
 * 而且**畫面上看不出差別**（失敗形態 ④：斷言方向跟缺陷無關）。
 *
 * 所以下面每一條都同時讀「該發的發了」與「該不發的沒發」。
 *
 * ── 為什麼數 `pendingReflectHooks` 而不是數 hook 的副作用 ────────────────
 * 因為要區分的是「這一發**有沒有**被判定成反彈成功」，而 hook 的 payload 是
 * 內容的自由。讀佇列讀的正是那個判定本身，而佇列由出貨的 `effects/damage.ts`
 * 填、由出貨的 `ReflectHookSystem` 排空 —— 兩端都是出貨的那一個。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `damage.ts` 的 `pendingReflectHooks.push(...)` 那一段刪掉 → refl-fires 紅
 *   · 那一段的 `if (reflectDepth !== undefined)` 拿掉（永遠 push）→ refl-not-when-blocked 紅
 *   · `SimWorld` 的 `reflectHookSystem(this)` 那一行刪掉 → refl-drained 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { combatResolveSystem } from "../combat/damage";
import { normalizeCombatEnv } from "../combatEnv";
import { attachSource } from "../stats/statPipeline";
import type { HookDef } from "../stats/modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const CENTER = SKELETON_ARENA.zones[0]!.center;

function makeWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 1);
  // k = 1 讓算式看得懂;這一檔不驗數字,只驗「有沒有被判定成反彈成功」。
  w.combatEnv = normalizeCombatEnv({ damageDealt: 1 });
  return w;
}

function hero(w: SimWorld, seat: number, team: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: CENTER.x + seat, z: CENTER.z },
    zone: 0,
  });
}

/** 一份反彈 hook（照抄 `incomingReflect.test.ts` 的形狀）。 */
function reflectHook(pct: number, maxChainDepth?: number): HookDef {
  return {
    on: "onDamageTaken",
    effects: [
      {
        kind: "damage",
        damageType: "true",
        amount: { flat: 0 },
        incomingPct: {
          perRank: [pct],
          ...(maxChainDepth !== undefined ? { maxChainDepth } : {}),
        },
      },
    ],
  };
}

function hit(w: SimWorld, attacker: EntityId, victim: EntityId, amount: number): void {
  w.damageQueue.push({
    source: attacker,
    target: victim,
    amount,
    type: "physical",
    crit: false,
    origin: "basic",
  });
  combatResolveSystem(w);
}

describe("onReflect —— 反彈成功時", () => {
  it("反彈真的排出去時,佇列上出現一筆(持有者=反彈的人,target=被反彈到的人)", () => {
    cover("refl-fires");
    const w = makeWorld();
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    attachSource(w, victim, { id: "src:reflect", kind: "item", hooks: [reflectHook(2)] });

    hit(w, attacker, victim, 100);

    expect(w.pendingReflectHooks).toEqual([{ reflector: victim, victim: attacker }]);
  });

  it("⛔ 沒有反彈發生時一筆都不發 —— 三道閘各驗一次", () => {
    cover("refl-not-when-blocked");

    // ① 根本沒有 incomingPct 的世界:反彈這件事不存在。
    const noHook = makeWorld();
    const a1 = hero(noHook, 0, 0);
    const v1 = hero(noHook, 1, 1);
    hit(noHook, a1, v1, 100);
    expect(noHook.pendingReflectHooks).toEqual([]);

    // ② 鏈深閘:`maxChainDepth: 0` 時第一發反彈仍然合法(深度 0),
    //    但**攻擊者身上也戴反彈**的話,他那一發的回敬(深度 1)會被閘掉。
    //    所以佇列上只該有一筆,不是兩筆。
    const depth = makeWorld();
    const a2 = hero(depth, 0, 0);
    const v2 = hero(depth, 1, 1);
    attachSource(depth, v2, { id: "src:r1", kind: "item", hooks: [reflectHook(1, 0)] });
    attachSource(depth, a2, { id: "src:r2", kind: "item", hooks: [reflectHook(1, 0)] });
    hit(depth, a2, v2, 100);
    // ⚠️ 讀的是「幾筆」而不是「有沒有」:一個把閘拿掉的實作在這裡是**兩筆**,
    // 而「有沒有」對兩筆與一筆都會過。
    expect(depth.pendingReflectHooks).toEqual([{ reflector: v2, victim: a2 }]);

    // ③ ⛔ **同一個 hook 裡的普通傷害效果不算反彈。**
    //    這是那個 `if (reflectDepth !== undefined)` 實際在守的東西 —— 上面兩道閘
    //    走的是 `return`,所以它們不會走到 push 那一行;會走到的是**沒有
    //    `incomingPct` 的那個 effect**。一份「被打時反彈 100% 並且額外打 50」的
    //    hook 會排出兩發封包,而只有第一發是反彈。
    //    ⚠️ 第一版我把突變寫成「把 if 改成 true」而測試照樣綠,就是因為沒有這一段。
    const mixed = makeWorld();
    const a3 = hero(mixed, 0, 0);
    const v3 = hero(mixed, 1, 1);
    attachSource(mixed, v3, {
      id: "src:mixed",
      kind: "item",
      hooks: [
        {
          on: "onDamageTaken",
          effects: [
            {
              kind: "damage",
              damageType: "true",
              amount: { flat: 0 },
              incomingPct: { perRank: [1] },
            },
            // 這一發不是反彈 —— 它只是同一張卡上的附帶傷害。
            { kind: "damage", damageType: "true", amount: { flat: 50 } },
          ],
        },
      ],
    });
    hit(mixed, a3, v3, 100);
    expect(mixed.pendingReflectHooks).toEqual([{ reflector: v3, victim: a3 }]);
  });

  it("系統真的把佇列排空了 —— 否則下一 tick 會重發一次", () => {
    cover("refl-drained");
    const w = makeWorld();
    const attacker = hero(w, 0, 0);
    const victim = hero(w, 1, 1);
    attachSource(w, victim, { id: "src:reflect", kind: "item", hooks: [reflectHook(2)] });

    hit(w, attacker, victim, 100);
    expect(w.pendingReflectHooks).toHaveLength(1); // 夾具前提:真的有排進去

    w.step(new Map());

    // ⚠️ 沒排空的話這一筆會在**每一個** tick 重新觸發一次 —— 一個「反彈時回血」
    // 的道具會變成「反彈過一次之後永遠每 tick 回血」,而那看起來只是「有點強」。
    expect(w.pendingReflectHooks).toEqual([]);
  });
});
