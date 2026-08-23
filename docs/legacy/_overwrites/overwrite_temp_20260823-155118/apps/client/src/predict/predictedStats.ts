/**
 * ⭐ 客戶端預測用的**屬性計算** —— 抽成純函式的唯一理由是**它要能被守衛跑到**。
 *
 * ── 為什麼（GH#616）────────────────────────────────────────────────────────
 * 這兩支原本是 `GameApp` 的 private method，而 `GameApp` **沒辦法 headless 建**
 * （Babylon engine / canvas / socket）⇒ 任何守衛都只能**自己重寫一份**去驗 ——
 * 而那正是第二守則失敗形態⑤（被測的不是出貨的那個）。
 *
 * ⚠️ 2026-08-23 我第一次寫這條守衛時就踩了：測試自己呼叫 `finalizeStat`，
 * 於是**把出貨路徑改回錯的版本，測試照樣綠**。⇒ 抽出來，讓守衛跑**這一支**。
 *
 * ── ⛔ 這裡不可以有第二份公式 ──────────────────────────────────────────────
 * 伺服器的環境倍率是一條**鏈**（`sim/combatEnv.ts` 的 `STAT_ENV_CHAIN`），
 * 移速那一條有**兩格**：`fixed("moveSpeed")` 然後
 * `byAttackType(melee:"moveSpeedMelee", ranged:"moveSpeedRanged")`。
 * ⇒ 這裡呼叫**伺服器用的同一支** `finalizeStat()`，⛔ 不抄那條鏈
 * （抄了它漂掉的那天沒有東西會紅 —— 第〇·四守則）。
 */
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { finalizeStat } from "@ggd/shared/sim/baseBonus";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import type { ChampionId, ItemId } from "@ggd/shared/ids";

/** 沒有英雄卡時的移速底線（與 `GameApp` 在此之前逐位元相同）。 */
export const FALLBACK_MOVE_SPEED = 6.6;

/** 基礎 + 道具的扁平加成（兩支共用的那一半）。 */
function flatFromItems(base: number, items: readonly string[], stat: Stat): number {
  let v = base;
  for (const itemId of items) {
    if (!itemId) continue;
    const item = Items.tryGet(itemId as ItemId);
    for (const mod of item?.modifiers ?? []) {
      if (mod.stat === stat && mod.op === ModOp.Flat) v += mod.value;
    }
  }
  return v;
}

/**
 * ⭐ 影子要用的移速 —— **與伺服器 `statPipeline` 逐位元相同**。
 *
 * ⚠️ `attackType` 讀**英雄卡**（`ChampionDef` 的必填欄位），⛔ 不是「射程 > 3」
 * 那種啟發式 —— 射程是會被道具動到的衍生值，用它反推身分等於讓一件裝備
 * 把近戰變成遠程（`statPipeline.ts:141` 逐字記著同一條）。
 */
export function predictedMoveSpeed(
  championId: string,
  items: readonly string[],
  env: CombatEnvMultipliers,
): number {
  const def = Champions.tryGet(championId as ChampionId);
  const base = flatFromItems(def?.baseStats[Stat.MoveSpeed] ?? FALLBACK_MOVE_SPEED, items, Stat.MoveSpeed);
  return finalizeStat(base, Stat.MoveSpeed, { env, subject: { attackType: def?.attackType } });
}
