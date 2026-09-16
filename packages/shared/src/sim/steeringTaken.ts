/**
 * 「**方向盤被拿走了嗎**」—— 暴走／恐懼／魅惑／混亂四種控場的**一份**答案（第〇·四守則）。
 *
 * 兩個讀端問的是同一件事，⛔ 不各列一份：
 *   · `OrderSystem`：拿走了 ⇒ 這一 tick 丟掉玩家／bot 的指令（身體交給 berserkSeek／fearPass／charmPass／chaosPass）
 *   · `abilities/channel.ts`：拿走了 ⇒ 持續引導被打斷（GH#1191 `cancelOn:"control"`）——
 *     ⛔ 否則引導把腳定住，恐懼／魅惑打在引導中的人身上等於無效。
 *
 * ⚠️ 嘲弄（`taunt.ts`）⛔ 不在這四種裡：它住 `world.taunt`、搶的是**索敵**不是指令，
 *   出貨 `config.taunt@1.overridesManualOrder:false` 時玩家仍握著方向盤 —— 見 `channel.ts` 的 breakCause。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { berserkDropsOrders } from "./berserk";
import { fearDropsOrders } from "./fear";
import { charmDropsOrders } from "./charm";
import { chaosDropsOrders } from "./chaos";

export function steeringTaken(world: SimWorld, id: EntityId): boolean {
  return (
    berserkDropsOrders(world, id) ||
    fearDropsOrders(world, id) ||
    charmDropsOrders(world, id) ||
    chaosDropsOrders(world, id)
  );
}
