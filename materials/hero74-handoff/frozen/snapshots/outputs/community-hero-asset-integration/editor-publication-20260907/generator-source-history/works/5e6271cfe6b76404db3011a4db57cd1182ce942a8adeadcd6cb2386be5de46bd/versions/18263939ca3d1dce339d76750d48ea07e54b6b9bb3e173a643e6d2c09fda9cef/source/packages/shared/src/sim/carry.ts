/**
 * 背負 —— 「把隊友收進箱子，跟著我走，期間不可被選取」（禰豆子的木箱）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ **L4 已填**（詞彙包留的空殼在這一版變成真的）。這個檔只有**狀態與謂詞**：
 * 誰在誰身上（{@link CarriedState}）、四道「看不看得見他」的閘、以及一支
 * {@link releaseCarried}。⛔ 每 tick 的座標重建在 `systems/CarrySystem.ts`、
 * 上車那一刻在 `effects/carry.ts` —— 三個檔各一件事，不互相 import。
 *
 * ⚠️ 這一整族仍然是「沒有人被背著的比賽 = 逐位元零成本」：`world.carried` 空的
 * 時候每一支謂詞都是一次 `Map.get`，`digest()` 的折入是條件式的（SimWorld.ts），
 * 所以既有錄影 hash 一格都不動。
 *
 * ⚠️ 「不可選取」的四根軸**逐字沿用** `sim/stealth.ts::StealthRules` 已經命名的
 * 那四根（blocksAutoAcquire / blocksMobAggro / blocksManualTarget /
 * blocksAbilityAoe），⛔ 不發明第二套詞彙 —— 兩套會分岔，而分岔的那一天兩邊的
 * 測試各自只看自己那一半。
 *
 * ⚠️ 「不可選取」≠ **無敵**：`abilityAoe` 預設 `false`，一發打在腳下的 AoE 照樣
 * 打得到箱子裡的人。
 *
 * PURITY（sim/purity.test.ts）：不抽 rng、不看時鐘，到期走絕對 tick。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";

/** 一名乘客的狀態 —— `SimWorld.carried` 的值型別（key = 乘客）。 */
export interface CarriedState {
  /** 背他的那具身體。 */
  carrier: EntityId;
  /** 絕對 tick，⛔ 不是遞減計數器。 */
  expiresAtTick: number;
  /** 「不可選取」的四根軸，逐字對應 `StealthRules`。 */
  blocksAutoAcquire: boolean;
  blocksMobAggro: boolean;
  blocksManualTarget: boolean;
  blocksAbilityAoe: boolean;
  /** 載具死了乘客放下（release）還是跟著倒（drop）。 */
  onCarrierDeath: "release" | "drop";
}

/** 這具身體現在是不是**被背著**（給 snapshot 決定要不要點 `CARRIED`）。 */
export function isCarried(world: SimWorld, id: EntityId): boolean {
  return world.carried.has(id);
}

/** 自動索敵看不看得見它。 */
export function carryBlocksAuto(world: SimWorld, id: EntityId): boolean {
  return world.carried.get(id)?.blocksAutoAcquire === true;
}

/** 小怪仇恨看不看得見它。 */
export function carryBlocksMobAggro(world: SimWorld, id: EntityId): boolean {
  return world.carried.get(id)?.blocksMobAggro === true;
}

/** 玩家點不點得到它。 */
export function carryBlocksManualTarget(world: SimWorld, id: EntityId): boolean {
  return world.carried.get(id)?.blocksManualTarget === true;
}

/**
 * 技能 AoE 掃不掃得到它。
 *
 * ⚠️ **今天沒有呼叫者，而且那是誠實的**：唯一的閘點是
 * `abilities/abilitySystem.ts::enemiesInCircle`，那個檔這一輪由另一條 lane
 * 獨佔（反向嘲諷要在它正下方新增 `bodiesInCircle`），兩條線同時改同一支函式
 * 就是保證衝突。⇒ 這一格的**出貨語意仍然是對的**：`blocksAbilityAoe` 的預設是
 * `false`（不可選取 ≠ 免疫），而出貨的禰豆子的木箱沒有把它打開，所以今天沒有
 * 任何一份內容需要這道閘。⛔ 但一份把它填成 `true` 的 JSON 現在不會生效 ——
 * 這件事寫在回報的「沒做完」那一欄，⛔ 不是靠這行註解就算數。
 */
export function carryBlocksAbilityAoe(world: SimWorld, id: EntityId): boolean {
  return world.carried.get(id)?.blocksAbilityAoe === true;
}

/**
 * 讓一名乘客下車。**冪等**（沒在車上就什麼都不做），因為它的三個呼叫點
 *（到期、載具沒了、載具死了）在同一 tick 可能同時成立。
 *
 * ⛔ 這裡**不動座標**：放下的位置就是箱子最後停的地方，而那正是乘客現在的
 * 座標（`CarrySystem` 每 tick 都把它寫成載具的）。硬塞一個「旁邊一步」的位移
 * 會讓乘客穿牆 —— 而 `MovementSystem` 的豁免正好在這一 tick 之後才解除。
 */
export function releaseCarried(world: SimWorld, passenger: EntityId): void {
  world.carried.delete(passenger);
}
