/**
 * outputMult.ts —— 「輸出倍率」的**唯一**讀取點（GH#354 / G2）。
 *
 * owner 2026-08-17 的 20 件 [EX解放] 裡有 7 件要的是同一件事：
 * 「這一次施放／這一段時間內，我造成的**傷害·治療·護盾整體** ×N」。
 *
 * ⚠️ 為什麼是一支共用函式而不是三行內聯：三個消費端（傷害佇列 / heal / addShield）
 * 各自寫一次 `1 + final[stat]` 看起來一樣便宜，但那是**三份**會分頭腐爛的算式 ——
 * 哪天要加「上限」或「戰鬥外不生效」就得記得改三處，而漏掉的那一處會安靜地
 * 用舊語意（失敗形態②）。
 *
 * ⚠️ 語意是**加成**：0 = ×1、0.25 = ×1.25。⛔ 不是「預設 1 的倍率」——
 * 一個沒填的英雄會拿到 0，而 ×0 是全部歸零。見 `Stat.OutputDamagePct` 的註解。
 *
 * ⛔ 夾在 0 以下：`1 + v` 為負代表「打人幫他補血」，那不是任何一張卡要的東西，
 * 而且它會讓下游的「傷害必須為正」假設整個崩掉。上界刻意**不夾** ——
 * 這一族本來就是為了突破而存在的（[EX解放] 的定義），要上限請在內容側寫。
 */
import type { SimWorld } from "../SimWorld";
import type { EntityId } from "../../ids";
import { Stat } from "./statTypes";

/** 傷害／治療／護盾三軸；⛔ 呼叫端只能傳這三個。 */
export type OutputAxis = Stat.OutputDamagePct | Stat.OutputHealingPct | Stat.OutputShieldPct;

/**
 * `1 + final[axis]`，夾在 0 以下。`source` 不存在或沒有 StatsComp → 回 1
 * （環境傷害、火圈、守衛塔那些「沒有主人」的來源本來就不該被誰的裝備放大）。
 */
export function outputMult(
  world: SimWorld,
  source: EntityId | undefined,
  axis: OutputAxis,
): number {
  if (source === undefined) return 1;
  const v = world.stats.get(source)?.final[axis];
  if (v === undefined || v === 0) return 1; // 快路徑：絕大多數單位這一格是 0
  const m = 1 + v;
  return m > 0 ? m : 0;
}
