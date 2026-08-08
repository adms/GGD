/**
 * 【跨技能強化】—— 走真的 `world.step()`、真的傷害封包、真的血條。
 *
 * 這一條守的是**接線**，不是機制：一支 EX 指名改寫**另一支**技能的數字之後，
 * 被強化的那一支要在世界上真的表現不同。
 *
 * 夾具是 77-002 御雷劍的形狀：一支永遠不觸發的反傷被動（`chance: 0`），
 * 加上一支把它的機率改成「必定觸發」的 EX。所以「有沒有生效」可以只用
 * **攻擊者的血條**回答 —— ⛔ 沒有任何一條斷言去看 `ModifierSource.hooks[].chance`
 * 這個欄位變成多少（CLAUDE.md 失敗形態 ⑦：掃屬性代替掃行為）。
 *
 * ⚠️ **兩個方向一起讀，而且在同一個 world、同一個 tick**：兩位受害者是同一份
 * 英雄定義、同一支天生技、同一支 EX，唯一的差別是有沒有 `learnEx()`。
 * 少了「沒學就不變」那一半，一個「不管有沒有 augment 都套用」的實作會全綠。
 *
 * ⚠️ 沒有任何出貨數值住在這裡（第零守則⑦）：`chance: 0 → 1` 是夾具自己造的，
 * 讓機制可觀測；斷言只問「掉了沒」，不問掉多少。
 *
 * ── 突變紀錄（真的做過：改壞 → 紅 → 改回來）────────────────────────────────
 *  · `abilityPassives.ts::rankBlock` 的 `applyAugmentToHooks(block.hooks, ops)`
 *    改回 `block.hooks`（＝強化整條撤銷）→ 「學了 EX」那一半紅：
 *    攻擊者一滴血都沒掉。
 *  · `abilityAugment.ts::collectAugmentOps` 的 `if (rank <= 0) return` 拿掉
 *    （＝沒學也算數）→ 「沒學 EX」那一半紅：對照組的攻擊者也掉血了。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { Abilities, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { learnEx } from "./abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "../../ids";
import type { AbilityDef } from "../content/defs";
import type { IntentFrame } from "../intents";
import { REFERENCES, type RefEdge } from "../../content/refs";

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;

const INNATE_ID = "fixture-aug.passive" as AbilityId;
const EX_ID = "fixture-aug.ex" as AbilityId;
const FIGHTER = "fixture-aug-fighter" as ChampionId;
const PLAIN = "fixture-aug-plain" as ChampionId;

/** 被強化的那一支：反傷天生技，`chance: 0` = 永遠不觸發。 */
const INNATE: AbilityDef = {
  id: INNATE_ID,
  name: "fixture 雷鳴劍",
  slot: "PASSIVE",
  innateKind: "passive",
  castType: "self",
  maxRank: 1,
  cooldown: [0],
  manaCost: [0],
  range: 0,
  effects: [],
  passive: {
    ranks: [
      {
        hooks: [
          {
            on: "onDamageTaken",
            target: "event",
            chance: 0,
            effects: [{ kind: "damage", amount: { flat: 50 }, damageType: "true" }],
          },
        ],
      },
    ],
  },
};

/** 強化者：exact ability ref + allowlist 的 `procChance`，⛔ 不是名稱、不是路徑。 */
const EX: AbilityDef = {
  id: EX_ID,
  name: "fixture 御雷劍",
  slot: "EX",
  castType: "self",
  maxRank: 1,
  cooldown: [0],
  manaCost: [0],
  range: 0,
  effects: [],
  augment: { targets: [{ abilityId: INNATE_ID, ops: [{ op: "procChance", mode: "set", value: 1 }] }] },
} as unknown as AbilityDef;

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(INNATE_ID, INNATE);
  Abilities.register(EX_ID, EX);
  // 兩位受害者是**同一份**定義（天生技 + EX 都有）。對照組只是沒有 learnEx()。
  registerChampion({ ...THORNE, id: FIGHTER, passiveAbility: INNATE_ID, exAbility: EX_ID });
  registerChampion({ ...THORNE, id: PLAIN });
});

function spawn(world: SimWorld, championId: ChampionId, seat: number, dx: number) {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seat),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x + dx, z: Z0.center.z + 10 },
    zone: 0,
  });
}

describe("跨技能強化 —— 一支 EX 改寫另一支技能的機率", () => {
  it("學了強化 EX 的人，反傷真的打得到攻擊者；沒學的同一份英雄一滴都沒打到", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260808);
    const learned = spawn(world, FIGHTER, 0, -6);
    const unlearned = spawn(world, FIGHTER, 1, -2);
    const hitLearned = spawn(world, PLAIN, 2, 2);
    const hitUnlearned = spawn(world, PLAIN, 3, 6);
    world.rebuildGrid();

    expect(learnEx(world, learned)).toBe(true);

    const before = new Map(
      [hitLearned, hitUnlearned].map((e) => [e, world.health.get(e)!.hp] as const),
    );
    for (const [attacker, victim] of [
      [hitLearned, learned],
      [hitUnlearned, unlearned],
    ] as const) {
      world.damageQueue.push({
        source: attacker,
        target: victim,
        amount: 100,
        type: "true",
        crit: false,
        origin: "ability:test.ability-augment",
      });
    }
    // 反傷是 hook 排出來的封包，下一輪才落地 —— 兩個 tick 讓它結算完。
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);

    const lost = (e: (typeof hitLearned)) => before.get(e)! - world.health.get(e)!.hp;
    expect(lost(hitLearned)).toBeGreaterThan(0);
    expect(lost(hitUnlearned)).toBe(0);
  });

  // fail closed 的那一半：目標必須是一條**硬** ref edge，否則指不到的強化會在
  // 執行期靜默無效（而 `editorCapabilities` 的 caveat 宣稱它在載入時就死）。
  // 突變：把 `refs.ts::abilityRefs` 那一段 `augment` 推送刪掉 → 這一條紅。
  it("強化目標是硬 ref —— 指不到的技能在載入時就被 validateReferences 擋下", () => {
    const edges = (REFERENCES.abilities as (d: unknown) => RefEdge[])({ ...EX, schema: "ability@1" });
    const edge = edges.find((e) => e.targetId === INNATE_ID);
    expect(edge?.targetCollection).toBe("abilities");
    expect(edge?.soft).toBeUndefined();
  });
});
