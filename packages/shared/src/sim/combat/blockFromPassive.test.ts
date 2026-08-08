/**
 * 技能授予的格擋 —— 走真的封包、真的 `world.step()`、真的血條。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這一條守的是什麼(以及為什麼是這一條而不是別的)
 *
 * `BlockGrant` 的機制本身早就出貨並且有 59 條守衛(`block.test.ts` +
 * `block.shipped.test.ts`)。這一批補的**不是機制**,是它的**第二個寫入點**:
 * 在 2026-08-08 之前,`ModifierSource.block` 只有 `economy/itemSource.ts` 會寫,
 * 所以「20-00 銀色甲胄:有30%機率格擋100%魔法傷害」這種**天生技**在編輯器裡
 * 根本沒有形狀可以填。
 *
 * 所以這裡量的是那條接線:**一支被動技能授予的格擋,在真的一發傷害上真的擋得住**。
 *
 * ⚠️ 斷言讀的是 `world.health.get(x).hp` —— snapshot 每 tick 送上線、玩家血條
 * 讀的那一份。**沒有**任何一條斷言去看 `ModifierSource.block` 這個欄位在不在
 * (CLAUDE.md 失敗形態 ⑦:掃屬性代替掃行為)—— 一個把 grant 完美存進 source
 * 卻從來沒有從 `dmg` 扣掉的實作,必須在這裡紅。
 *
 * ⚠️ 也沒有任何一條斷言寫著 30% / 100% / 1.5 秒。出貨數值住在內容檔裡,測試
 * 抄一份就是第四個住處(CLAUDE.md 第零守則⑦)。夾具用 `chance: 1` 讓**機制**
 * 變得可觀測,而不是去釘那個機率是多少。
 *
 * 對照組是同一份英雄定義**只差沒有那支天生技**,跑在**同一個 world、同一個
 * tick、吃同一種封包**。所以兩邊的護甲/魔抗/`combatEnv` 逐項相同,唯一的差別
 * 就是那條被動 —— 而那正是這條守衛要歸因的東西。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { Abilities, Champions, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "../../ids";
import type { AbilityDef } from "../content/defs";
import type { IntentFrame } from "../intents";

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;

const INNATE_ID = "fixture-blocker.passive" as AbilityId;
const BLOCKER = "fixture-blocker" as ChampionId;
const CONTROL = "fixture-control" as ChampionId;

/**
 * 一支**只**授予格擋的天生技 —— 沒有 modifiers、沒有 hooks、沒有 auras。
 *
 * 那個空是刻意的,而且正是 20-00 銀色甲胄的形狀:它的整段文案就是那個格擋,
 * 屬性表上一個數字都沒有。`rankBlock` 的「這一階是不是空的」判斷要是漏了
 * `block` 這一格,source 就永遠不會掛上去,而所有既有測試照樣全綠
 * (CLAUDE.md 失敗形態 ②)。
 */
const INNATE: AbilityDef = {
  id: INNATE_ID,
  name: "fixture 銀色甲胄",
  slot: "PASSIVE",
  innateKind: "passive",
  castType: "self",
  maxRank: 1,
  cooldown: [0],
  manaCost: [0],
  range: 0,
  effects: [],
  // `chance: 1` = 必定觸發,讓機制可觀測;`fraction: 1` = 整包擋掉,讓「有沒有
  // 擋到」可以只用血條回答,不必在測試裡重算一次 `mitigate()`。
  passive: { ranks: [{ block: { damageTypes: ["magic"], chance: 1, fraction: 1 } }] },
};

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(INNATE_ID, INNATE);
  // 兩份英雄定義**只差 `passiveAbility` 一格**。同一個 base、同一組 Q/W/E/R、
  // 同一份 legacy `passive`(Barkskin,純護甲)—— 所以兩邊的減傷逐項相同。
  registerChampion({ ...THORNE, id: BLOCKER, passiveAbility: INNATE_ID });
  registerChampion({ ...THORNE, id: CONTROL });
});

/** 同一個 world 裡生一位英雄(同隊,所以不會互相自動接敵)。 */
function spawn(world: SimWorld, championId: ChampionId, seat: number, dx: number) {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seat),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x + dx, z: Z0.center.z + 10 },
    zone: 0,
  });
}

describe("技能被動授予格擋 —— 同一個 ModifierSource.block,第二個寫入點", () => {
  it("帶著格擋天生技的英雄吃下同一發魔法傷害,血是不掉的;沒有那支天生技的不是", () => {
    expect(Champions.tryGet(BLOCKER)?.passiveAbility).toBe(INNATE_ID);
    const world = new SimWorld(SKELETON_ARENA, 20260808);
    const blocker = spawn(world, BLOCKER, 0, -3);
    const control = spawn(world, CONTROL, 1, 3);
    world.rebuildGrid();

    const before = {
      blocker: world.health.get(blocker)!.hp,
      control: world.health.get(control)!.hp,
    };
    for (const target of [blocker, control]) {
      world.damageQueue.push({
        source: control,
        target,
        amount: 300,
        type: "magic",
        crit: false,
        origin: "ability:test.block-from-passive",
      });
    }
    world.step(NO_INTENTS);

    const lost = {
      blocker: before.blocker - world.health.get(blocker)!.hp,
      control: before.control - world.health.get(control)!.hp,
    };
    // 守衛的守衛:對照組真的有掉血。少了這一條,一個「魔抗把 300 全吃掉」的
    // 世界會讓兩邊都是 0,整條測試變成永遠綠的。
    expect(lost.control).toBeGreaterThan(0);
    expect(lost.blocker).toBe(0);
  });
});
