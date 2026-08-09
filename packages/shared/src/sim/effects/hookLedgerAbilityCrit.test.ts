/**
 * Lane 1（2026-08-10）—— 兩條**畫面上看得出來**的線。
 *
 * ① 靈氣換掉 `hooks` 陣列時，S6 的兩本額度帳跟著作廢（`invalidateHookLedgers`）。
 * ⑨ 技能暴擊也產 `critSources`，所以 `critSource:"thisSource"` 在技能上真的觸發
 *    （⑦「一次判定、一串結果」就是靠這個，hook 不用再抽第二次籤）。
 *
 * ⛔ 兩條讀的都是**血條**，不是 schema 形狀，也不是「那個欄位被設成什麼」——
 * 那種斷言對「欄位開了但 handler 沒接」是全綠的（失敗形態⑤）。
 * ⛔ 沒有出貨數值進斷言：兩條都是「同一次執行的另一半」比較。
 *
 * ── 突變驗證（一個 lane 一條，挑最承重的）────────────────────────────────────
 * `effects/hookIcd.ts::invalidateHookLedgers` 拿掉 `src.hookFireCount = undefined`
 * （＝這一輪之前 `aura.ts` 的行為）→ ① 那一條紅：
 *
 *   AssertionError: expected 0 to be greater than 0
 *
 * 也就是換陣列之後那條**全新**的一次性 hook 一次都發不出來 —— 額度被記到別人頭上。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { combatResolveSystem } from "../combat/damage";
import { auraSystem } from "../aura/aura";
import { attachSource } from "../stats/statPipeline";
import { fireHooks } from "./hooks";
import { runEffects } from "./effectRunner";
import type { AuraDef } from "../aura/aura";
import type { HookDef } from "../stats/modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CENTER = SKELETON_ARENA.zones[0]!.center;
const PLAIN = THORNE.id;

beforeAll(() => registerSkeletonContent());

function makeWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = normalizeCombatEnv({ damageDealt: 1 });
  return w;
}

function hero(w: SimWorld, seat: number, team: number, champ: ChampionId = PLAIN): EntityId {
  return spawnChampion(w, {
    championId: champ,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: CENTER.x + seat, z: CENTER.z },
    zone: 0,
  });
}

const hp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;

/** 一條**一次性**的觸發器（S6 的 `maxTriggers`）—— 每次呼叫給一個新陣列。 */
const onceHooks = (): HookDef[] => [
  {
    on: "onBasicAttack",
    maxTriggers: 1,
    effects: [{ kind: "damage", damageType: "true", amount: { flat: 50 } }],
  } as HookDef,
];

describe("Lane 1 —— ① 換 hooks 要清額度帳 · ⑨ 技能暴擊也產 critSources", () => {
  it("① 靈氣 rank-up 換掉 hooks 之後，那條全新的一次性觸發器仍然發得出來", () => {
    const w = makeWorld();
    const emitter = hero(w, 0, 0);
    const ally = hero(w, 1, 0);
    const victim = hero(w, 6, 1);
    // 一份**真的**靈氣（走出貨的 `auraSystem` 投射路徑），⛔ 不是手寫一份
    // kind:"aura" 的 source —— 那會繞過這一輪要修的那一行。
    const def: AuraDef = { radius: 30, affects: "ally", hooks: onceHooks() };
    attachSource(w, emitter, { id: "src:aura", kind: "passive", auras: [def] });

    // ⚠️ `auraSystem` 用的是廣相位格點（出貨順序是 `rebuildGrid()` 的下一行），
    // 少了這一行查詢會是空的，而症狀是「靈氣好像沒作用」。
    w.rebuildGrid();
    auraSystem(w);
    const first = hp(w, victim);
    fireHooks(w, ally, "onBasicAttack", victim); // 用掉唯一的一次額度
    combatResolveSystem(w);
    expect(first - hp(w, victim)).toBeGreaterThan(0); // 夾具前提：第一次真的打了
    // 再打一次：額度用完了，什麼都不該發生（S6 本身還活著）。
    const used = hp(w, victim);
    fireHooks(w, ally, "onBasicAttack", victim);
    combatResolveSystem(w);
    expect(used - hp(w, victim)).toBe(0);

    // ── rank-up：同一份靈氣換上**另一個**陣列（內容一樣、參照不同），
    //    也就是 `aura.ts` 對「升階／換裝」的判定條件。
    def.hooks = onceHooks();
    w.rebuildGrid();
    auraSystem(w);

    const before = hp(w, victim);
    fireHooks(w, ally, "onBasicAttack", victim);
    combatResolveSystem(w);
    // 新的那一條是全新的觸發器，它自己的額度沒有被舊那條用掉。
    expect(before - hp(w, victim)).toBeGreaterThan(0);
  });

  it("⑨ 技能暴擊帶著來源名單：只有**帶著那條 grant** 的來源上的 hook 追加落雷", () => {
    const zap: HookDef[] = [
      {
        on: "onDamageDealt",
        damageCrit: "crit",
        critSource: "thisSource",
        effects: [{ kind: "damage", damageType: "true", amount: { flat: 50 } }],
      },
    ];
    const grant = { chance: 1, damageMult: 2, lifestealFraction: 0 };

    /** 同一發技能傷害，唯一的差別是那條 hook 掛在**哪一份**來源上。 */
    function run(zapOnGranter: boolean): number {
      const w = makeWorld();
      const owner = hero(w, 0, 0);
      const victim = hero(w, 6, 1);
      attachSource(w, owner, {
        id: "src:sword",
        kind: "item",
        critStrike: grant,
        ...(zapOnGranter ? { hooks: zap } : {}),
      });
      attachSource(w, owner, {
        id: "src:hat",
        kind: "item",
        ...(zapOnGranter ? {} : { hooks: zap }),
      });
      const before = hp(w, victim);
      // 一發**技能**傷害（`canCrit`）—— ⛔ 不是普攻，普攻那條路在這之前就會過。
      runEffects(
        [{ kind: "damage", damageType: "physical", amount: { flat: 20 }, canCrit: true }],
        {
          world: w,
          caster: owner,
          rank: 1,
          targets: [victim],
          origin: "ability:fixture",
          rng: w.rng,
        },
      );
      combatResolveSystem(w);
      return before - hp(w, victim);
    }

    const onGranter = run(true);
    const onOther = run(false);
    expect(onOther).toBeGreaterThan(0); // 夾具前提：那一發技能真的打到了
    // 掛在帶 grant 的那一份上才觸發；掛在別件裝備上不觸發（同一發、同一個暴擊）。
    expect(onGranter).toBeGreaterThan(onOther);
  });
});
