/**
 * hook 家族（G4 · G8 · S3 · S10）—— 一支守衛，四條**畫面上看得出來**的線。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 每一條讀的都是最終世界狀態（血條 / 觸發了沒），⛔ 沒有一條在問「schema 收不收
 * 得下」——那種斷言對「欄位開了但 handler 沒接」是全綠的（失敗形態⑤）。
 * ⛔ 也沒有任何出貨數值進斷言：四條全部是「同一次執行的另一半」比較
 * （rank 1 vs rank 3、我的暴擊 vs 別人的、重置前 vs 重置後、技能 vs 普攻）。
 *
 * ── 突變驗證（2026-08-10，整個 lane 一條，挑最承重的）────────────────────────
 * `effects/hooks.ts` 的 `rank: Math.max(1, src.grantRank ?? 1)` 改回 `rank: 1`
 * （＝這一輪之前的出貨行為）→ 「G4」那一條紅，訊息逐字：
 *
 *   AssertionError: expected 40 to be greater than 40
 *   ❯ packages/shared/src/sim/effects/hookFamily.test.ts:133:40
 *
 * 也就是 rank 3 的被動 hook 打出的傷害掉回 rank 1 那一欄 —— 正是這個 lane 要修的
 * 「七支被動被迫在每一階各抄一份 hook」那個抄寫稅的可觀測面。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { Abilities, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { combatResolveSystem } from "../combat/damage";
import { rollCritStrike } from "../combat/critStrike";
import { reflectHookSystem } from "../systems/ReflectHookSystem";
import { syncAbilityPassives } from "../abilities/abilityPassives";
import { attachSource } from "../stats/statPipeline";
import { fireHooks } from "./hooks";
import { runEffects } from "./effectRunner";
import type { AbilityDef } from "../content/defs";
import type { HookDef } from "../stats/modifiers";
import type { TriggerDamage } from "./effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../../ids";

const CENTER = SKELETON_ARENA.zones[0]!.center;
const RANKED_ID = "fixture-ranked.passive" as AbilityId;
const RANKED = "fixture-ranked" as ChampionId;
/**
 * 對照用的乾淨身體 —— ⚠️ G8 / S3 / S10 三條**不可以**用 RANKED：那支 fixture 被動
 * 自己就掛著一條 `onDamageDealt`，它會在排空迴圈裡對每一發衍生封包再觸發一次，
 * 於是量到的數字是一整條連鎖而不是被測的那一條（第一次跑就是這樣紅的）。
 */
const PLAIN = THORNE.id;

/**
 * 一支**三階**的被動，每一階的 hook 逐字相同（同一個物件），只有 payload 的
 * `perRank` 欄不同。這正是 G4 要消滅的那個形狀的反面：作者只寫一份。
 */
const RANKED_PASSIVE: AbilityDef = {
  id: RANKED_ID,
  name: "fixture 階梯被動",
  slot: "PASSIVE",
  innateKind: "passive",
  castType: "self",
  maxRank: 3,
  cooldown: [0, 0, 0],
  manaCost: [0, 0, 0],
  range: 0,
  effects: [],
  passive: {
    ranks: [1, 2, 3].map(() => ({
      hooks: [
        {
          on: "onDamageDealt",
          effects: [{ kind: "damage", damageType: "true", amount: { perRank: [10, 40, 90] } }],
        } as HookDef,
      ],
    })),
  },
};

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(RANKED_ID, RANKED_PASSIVE);
  registerChampion({ ...THORNE, id: RANKED, passiveAbility: RANKED_ID });
});

function makeWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = normalizeCombatEnv({ damageDealt: 1 });
  return w;
}

function hero(w: SimWorld, seat: number, team: number, champ: ChampionId): EntityId {
  return spawnChampion(w, {
    championId: champ,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: CENTER.x + seat * 2, z: CENTER.z },
    zone: 0,
  });
}

const hp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;

/** 一發**已經落地**的封包的 payload（`combat/damage.ts` 交給 hook 的那份）。 */
function trigger(over: Partial<TriggerDamage> = {}): TriggerDamage {
  return {
    raw: 10,
    mitigated: 10,
    hpLost: 10,
    origin: "basic",
    reflectDepth: 0,
    resolvePass: 0,
    type: "physical",
    crit: false,
    ...over,
  };
}

describe("hook 家族 —— G4 · G8 · S3 · S10", () => {
  it("G4：同一份 hook，rank 3 的被動打得比 rank 1 重（payload 以授予它的那一階求值）", () => {
    const w = makeWorld();
    const low = hero(w, 0, 0, RANKED);
    const high = hero(w, 1, 0, RANKED);
    const vLow = hero(w, 2, 1, RANKED);
    const vHigh = hero(w, 3, 1, RANKED);
    // ⚠️ 走**出貨的轉發路徑**（`syncAbilityPassives` → `rankSource` → `grantRank`），
    // ⛔ 不是手寫一份帶 grantRank 的 source —— 那會繞過整條接線而測試照樣綠。
    w.abilities.get(high)!.passiveSlot!.rank = 3;
    syncAbilityPassives(w, high);

    fireHooks(w, low, "onDamageDealt", vLow);
    fireHooks(w, high, "onDamageDealt", vHigh);
    const before = { low: hp(w, vLow), high: hp(w, vHigh) };
    combatResolveSystem(w);

    expect(before.low - hp(w, vLow)).toBeGreaterThan(0); // 夾具前提：rank 1 真的有打
    expect(before.high - hp(w, vHigh)).toBeGreaterThan(before.low - hp(w, vLow));
  });

  it("G8：暴擊 hook 只認**自己那條** critStrike 的 proc，不認同一發上別人的暴擊", () => {
    const w = makeWorld();
    const owner = hero(w, 0, 0, PLAIN);
    const victim = hero(w, 1, 1, PLAIN);
    const zap: HookDef[] = [
      {
        on: "onDamageDealt",
        damageCrit: "crit",
        critSource: "thisSource",
        effects: [{ kind: "damage", damageType: "true", amount: { flat: 50 } }],
      },
    ];
    // 兩份來源、兩條**逐字相同**的 hook —— 唯一的差別是誰帶著那條暴擊 grant。
    attachSource(w, owner, {
      id: "src:sword",
      kind: "item",
      critStrike: { chance: 1, damageMult: 2, lifestealFraction: 0 },
      hooks: zap,
    });
    attachSource(w, owner, { id: "src:hat", kind: "item", hooks: zap });

    // 真的骰一次（出貨的產出端），名單就是它回報的那一份。
    const roll = rollCritStrike(w, owner, 100, 1, false);
    expect(roll.critSources).toEqual(["src:sword"]);

    const before = hp(w, victim);
    fireHooks(
      w,
      owner,
      "onDamageDealt",
      victim,
      undefined,
      trigger({ crit: true, critSources: roll.critSources }),
    );
    combatResolveSystem(w);
    const bothWouldBe = (before - hp(w, victim)) * 2;

    // 只有帶 grant 的那一份觸發了：兩份都觸發的話傷害會是這個數的兩倍。
    const w2 = makeWorld();
    const o2 = hero(w2, 0, 0, PLAIN);
    const v2 = hero(w2, 1, 1, PLAIN);
    attachSource(w2, o2, { id: "src:sword", kind: "item", hooks: zap });
    attachSource(w2, o2, { id: "src:hat", kind: "item", hooks: zap });
    const b2 = hp(w2, v2);
    fireHooks(
      w2,
      o2,
      "onDamageDealt",
      v2,
      undefined,
      trigger({ crit: true, critSources: ["src:sword", "src:hat"] }),
    );
    combatResolveSystem(w2);
    expect(b2 - hp(w2, v2)).toBeCloseTo(bothWouldBe, 6);
  });

  it("S3：modifyCooldown 重置得了一條 hook 的內部冷卻（被動唯一有冷卻的那一格）", () => {
    const w = makeWorld();
    const owner = hero(w, 0, 0, PLAIN);
    const victim = hero(w, 1, 1, PLAIN);
    attachSource(w, owner, {
      id: "src:proc",
      kind: "passive",
      hooks: [
        {
          on: "onDamageDealt",
          key: "theProc",
          internalCooldown: 60,
          effects: [{ kind: "damage", damageType: "true", amount: { flat: 30 } }],
        },
      ],
    });

    fireHooks(w, owner, "onDamageDealt", victim); // ① 發動，燒掉 ICD
    combatResolveSystem(w);
    const afterFirst = hp(w, victim);
    fireHooks(w, owner, "onDamageDealt", victim); // ② 冷卻中，什麼都不該發生
    combatResolveSystem(w);
    expect(hp(w, victim)).toBe(afterFirst);

    // ③ 重置那一條，再打一次 —— 這一次要真的又掉血。
    runEffects(
      [
        {
          kind: "modifyCooldown",
          shape: "single",
          mode: "reset",
          target: "hookInternalCooldown",
          hookKey: "theProc",
        },
      ],
      { world: w, caster: owner, rank: 1, targets: [owner], origin: "hook:src:proc", rng: w.rng },
    );
    fireHooks(w, owner, "onDamageDealt", victim);
    combatResolveSystem(w);
    expect(hp(w, victim)).toBeLessThan(afterFirst);
  });

  it("S10：onReflectSuccess 問得出**原**封包是技能還是普攻", () => {
    const heal = (origin: string): number => {
      const w = makeWorld();
      const attacker = hero(w, 0, 0, PLAIN);
      const victim = hero(w, 1, 1, PLAIN);
      attachSource(w, victim, {
        id: "src:whirl",
        kind: "passive",
        hooks: [
          {
            on: "onDamageTaken",
            effects: [
              { kind: "damage", damageType: "true", amount: { flat: 0 }, incomingPct: { perRank: [1] } },
            ],
          },
          {
            on: "onReflectSuccess",
            // 「若成功反彈敵方**技能** AP 傷害」的那個「技能」—— 在這一格之前
            // 讀的是反彈封包自己，所以這個問題問不出來。
            reflectedDamageSource: "ability",
            target: "self", // 事件的 target 是被反彈到的攻擊者；回血的是反彈的人。
            effects: [{ kind: "heal", amount: { flat: 40 } }],
          },
        ],
      });
      w.health.get(victim)!.hp -= 200; // 留出回血的空間
      w.damageQueue.push({
        source: attacker,
        target: victim,
        amount: 100,
        type: "physical",
        crit: false,
        origin,
      });
      combatResolveSystem(w);
      expect(w.pendingReflectHooks).toHaveLength(1); // 夾具前提：反彈真的成功了
      const before = hp(w, victim);
      reflectHookSystem(w);
      return hp(w, victim) - before;
    };

    expect(heal("ability:fixture")).toBeGreaterThan(0);
    expect(heal("basic")).toBe(0);
  });
});
